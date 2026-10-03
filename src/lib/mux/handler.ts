/**
 * Shared Route Handler pipeline (plan §4).
 *
 * Every `/api/mux/*` route runs through one of the wrappers here, which apply,
 * in order: origin check → rate limit → payload validation → execution →
 * `no-store` response shaping → error mapping. Keeping this in one place is
 * what makes the security rules auditable instead of repeated per route.
 */

import "server-only";

import { NextResponse } from "next/server";
import type { z } from "zod";

import { getAppUrl } from "../env";
import type { ApiError } from "../types";
import {
  ForbiddenOriginError,
  MuxRouteError,
  RateLimitedError,
  UpstreamError,
  ValidationError,
  formatIssues,
} from "./errors";

/** Requests allowed per IP per window. */
export const RATE_LIMIT_CAPACITY = 20;

/** Rate-limit window in milliseconds. */
export const RATE_LIMIT_WINDOW_MS = 60_000;

/* ------------------------------------------------------------------ */
/* Origin check                                                        */
/* ------------------------------------------------------------------ */

/** Hosts accepted in development regardless of `NEXT_PUBLIC_APP_URL`. */
const DEV_HOSTS: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
  "::1",
]);

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

/** Hostname without the port, e.g. `localhost:3000` → `localhost`. */
function hostnameOf(url: string | null | undefined): string | null {
  const host = hostOf(url);
  if (host === null) return null;

  return host.replace(/:\d+$/, "");
}

/** Methods that change remote state and therefore need a provable origin. */
const STATE_MODIFYING_METHODS: ReadonlySet<string> = new Set([
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);

/**
 * `true` when the request carries an `Origin` or `Referer` at all.
 *
 * Browsers attach one of these to every cross-origin request and to every
 * same-origin non-GET. Their total absence on a state-changing method means the
 * caller is not a browser — `curl`, a script, or a forged request — and there
 * is nothing left to check the caller against.
 */
export function hasOriginEvidence(request: Request): boolean {
  const hasOrigin = (request.headers.get("origin") ?? "").trim().length > 0;
  const hasReferer = (request.headers.get("referer") ?? "").trim().length > 0;

  return hasOrigin || hasReferer;
}

/** `true` when the request comes from this app. */
export function isAllowedOrigin(request: Request): boolean {
  const method = request.method.toUpperCase();
  const modifiesState = STATE_MODIFYING_METHODS.has(method);

  const allowed = hostOf(getAppUrl());
  if (allowed === null) return true;

  const origin = hostOf(request.headers.get("origin"));
  if (origin !== null) return originMatches(origin, allowed);

  const referer = hostOf(request.headers.get("referer"));
  if (referer !== null) return originMatches(referer, allowed);

  /*
   * Neither header was supplied.
   *
   * For a read that is tolerable: the response is `no-store` and CORS still
   * stops a foreign page from reading it. For a write it is not — an absent
   * Origin is exactly what a forged request looks like, and accepting it would
   * make the origin check decorative on the routes that matter most.
   */
  return !modifiesState;
}

/**
 * Loopback origins are interchangeable.
 *
 * `next build && next start` on a machine other than port 3000 would otherwise
 * reject every Studio call — the app URL env var keeps its development default,
 * but the server is genuinely local. A page served from `localhost` cannot be
 * an attacker's page unless the attacker already runs on this machine, so the
 * remaining risk is not the one this guard exists to stop.
 */
function originMatches(candidate: string, allowed: string): boolean {
  if (candidate === allowed) return true;

  // `candidate` and `allowed` are hosts (`localhost:3111`), not URLs, so the
  // port is stripped here rather than through `isDevHost`, which takes a URL.
  return isDevHostname(candidate) && isDevHostname(allowed);
}

/** `true` when a bare hostname is one of the loopback hosts. */
export function isDevHostname(host: string): boolean {
  return DEV_HOSTS.has(host.replace(/:\d+$/, "").toLowerCase());
}

/** Throw unless the request originates from this app. */
export function assertAllowedOrigin(request: Request): void {
  if (!isAllowedOrigin(request)) throw new ForbiddenOriginError();
}

/** `true` outside production, where localhost origins are always accepted. */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV !== "production";
}

/** `true` when a URL points at a local development host. */
export function isDevHost(url: string | null | undefined): boolean {
  const hostname = hostnameOf(url);
  return hostname !== null && DEV_HOSTS.has(hostname);
}

/* ------------------------------------------------------------------ */
/* Rate limiting                                                       */
/* ------------------------------------------------------------------ */

interface Bucket {
  tokens: number;
  updatedAt: number;
}

/**
 * In-memory token buckets keyed by client IP.
 *
 * Best-effort by nature: a serverless deployment gets one bucket per warm
 * instance, so this is a brake against a runaway poll loop, not a security
 * control.
 */
const buckets = new Map<string, Bucket>();

/**
 * A bucket is dropped once it has been full and idle for one window.
 *
 * Without this the map grows by one entry per distinct client key, forever.
 * A caller that rotates a spoofed `X-Forwarded-For` value gets a fresh bucket
 * each time, so unbounded growth is directly reachable by an unauthenticated
 * caller. A full bucket is functionally absent, so expiring it costs nothing.
 */
export const BUCKET_IDLE_TTL_MS = RATE_LIMIT_WINDOW_MS * 2;

/** Cap on distinct tracked clients, as a second bound against memory growth. */
export const MAX_TRACKED_BUCKETS = 10_000;

/**
 * The IP used for rate limiting.
 *
 * `X-Forwarded-For` is caller-controlled unless a trusted proxy overwrites it,
 * and it is free-form text, so it is validated as an IP address and only the
 * left-most valid entry is trusted. An unparseable or absent value collapses to
 * a single shared bucket: grouping unknown callers together is conservative,
 * whereas grouping them by attacker-supplied strings defeats the limiter.
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");

  if (forwarded) {
    for (const candidate of forwarded.split(",")) {
      const parsed = normaliseIp(candidate);
      if (parsed !== null) return parsed;
    }
  }

  const realIp = normaliseIp(request.headers.get("x-real-ip"));
  if (realIp !== null) return realIp;

  return UNKNOWN_CLIENT;
}

/** Shared bucket for requests whose origin cannot be determined. */
export const UNKNOWN_CLIENT = "unknown";

/**
 * Reduce a header value to a canonical IP string, or `null`.
 *
 * Accepts IPv4 dotted quads and IPv6 including the bracketed, zone-suffixed and
 * IPv4-mapped forms proxies emit. Anything else is rejected rather than
 * truncated, so a crafted string cannot be used to mint arbitrary buckets.
 */
export function normaliseIp(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;

  let candidate = value.trim();
  if (candidate.length === 0 || candidate.length > 45) return null;

  // `[::1]:8080` and `[fe80::1%eth0]` are both valid proxy output.
  const bracketed = /^\[(.+)\](?::\d{1,5})?$/.exec(candidate);
  if (bracketed !== null) candidate = bracketed[1] as string;

  if (candidate.includes("%")) return null; // Zone identifiers are not routable.
  if (candidate.includes("/")) return null; // Prefixes smuggle extra input.

  const lower = candidate.toLowerCase();

  if (isIpv4(lower)) return lower;

  if (/^[0-9a-f:]+$/.test(lower) && lower.includes(":")) {
    // A single colon is not enough: `dead:beef` is not an address.
    return lower.split(":").length >= 3 ? lower : null;
  }

  return null;
}

/** Strict dotted-quad check; each octet must be 0-255 with no leading zeros. */
function isIpv4(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 4) return false;

  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    if (part.length > 1 && part.startsWith("0")) return false;
    return Number.parseInt(part, 10) <= 255;
  });
}

/**
 * Drop buckets that are full and idle, and enforce a hard ceiling.
 *
 * Runs on every consume: the bucket map is touched on every request anyway, so
 * this adds no new call sites and cannot be forgotten on a code path.
 */
function pruneBuckets(nowMs: number): void {
  const refillPerMs = RATE_LIMIT_CAPACITY / RATE_LIMIT_WINDOW_MS;

  for (const [key, bucket] of buckets) {
    const elapsed = nowMs - bucket.updatedAt;
    if (elapsed < BUCKET_IDLE_TTL_MS) continue;

    /*
     * "Full" has to be the *projected* token count, not the stored one.
     *
     * A bucket created by a request holds `capacity - 1`, and a bucket one
     * request short of its ceiling holds `1`. Comparing the stored value
     * against `capacity` therefore matches almost nothing, and the sweep would
     * retain every entry it was added to remove.
     */
    const projected = bucket.tokens + elapsed * refillPerMs;
    if (projected < RATE_LIMIT_CAPACITY) continue;

    buckets.delete(key);
  }

  if (buckets.size < MAX_TRACKED_BUCKETS) return;

  // Still over the ceiling: drop the least recently touched until under it.
  const ordered = [...buckets.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt);
  const excess = buckets.size - MAX_TRACKED_BUCKETS;

  for (let index = 0; index < excess; index += 1) {
    const oldest = ordered[index];
    if (oldest !== undefined) buckets.delete(oldest[0]);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

/** Consume one token for `key`, refilling the bucket continuously over time. */
export function consumeRateLimit(
  key: string,
  nowMs: number = Date.now(),
  capacity: number = RATE_LIMIT_CAPACITY,
  windowMs: number = RATE_LIMIT_WINDOW_MS,
): RateLimitResult {
  pruneBuckets(nowMs);

  const refillPerMs = capacity / windowMs;
  const existing = buckets.get(key);

  if (!existing) {
    buckets.set(key, { tokens: capacity - 1, updatedAt: nowMs });
    return { allowed: true, remaining: capacity - 1, retryAfterSec: 0 };
  }

  const elapsed = Math.max(0, nowMs - existing.updatedAt);
  const tokens = Math.min(capacity, existing.tokens + elapsed * refillPerMs);

  if (tokens < 1) {
    buckets.set(key, { tokens, updatedAt: nowMs });
    const retryAfterSec = Math.max(1, Math.ceil((1 - tokens) / refillPerMs / 1000));
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  buckets.set(key, { tokens: tokens - 1, updatedAt: nowMs });
  return { allowed: true, remaining: Math.floor(tokens - 1), retryAfterSec: 0 };
}

/** Test seam: drop all buckets. */
export function resetRateLimits(): void {
  buckets.clear();
}

/**
 * Buckets currently retained.
 *
 * Exposed so the bound on memory growth is observable rather than asserted by
 * inspection: a caller rotating a spoofed forwarded-for value would otherwise
 * grow this without any visible symptom.
 */
export function trackedBucketCount(nowMs: number = Date.now()): number {
  pruneBuckets(nowMs);
  return buckets.size;
}

/* ------------------------------------------------------------------ */
/* Payload validation                                                  */
/* ------------------------------------------------------------------ */

/** Parse a JSON body, mapping any failure onto `VALIDATION_FAILED`. */
export async function parseJsonBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<z.infer<S>> {
  let raw: unknown;

  try {
    raw = await request.json();
  } catch {
    throw new MuxRouteError(400, "VALIDATION_FAILED", "Request body must be valid JSON.");
  }

  const result = schema.safeParse(raw);
  if (!result.success) throw new ValidationError(formatIssues(result.error));

  return result.data;
}

/** Parse route params, mapping any failure onto `VALIDATION_FAILED`. */
export function parseParams<S extends z.ZodType>(raw: unknown, schema: S): z.infer<S> {
  const result = schema.safeParse(raw);
  if (!result.success) throw new ValidationError(formatIssues(result.error));

  return result.data;
}

/* ------------------------------------------------------------------ */
/* Responses                                                           */
/* ------------------------------------------------------------------ */

/** `Cache-Control: no-store` on every API response. */
export const NO_STORE_HEADERS: Readonly<Record<string, string>> = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
};

export function json<T>(
  data: T,
  status = 200,
  extraHeaders?: Record<string, string>,
): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: { ...NO_STORE_HEADERS, ...extraHeaders },
  });
}

/** The single error envelope used by every route. */
export function errorResponse(
  error: MuxRouteError,
  extraHeaders?: Record<string, string>,
): NextResponse {
  return json<ApiError>(error.toJSON(), error.status, extraHeaders);
}

/**
 * Map any thrown value onto a response.
 *
 * Mux SDK failures become a generic `502` so credentials and upstream detail
 * never reach the browser; unexpected errors are logged server-side and
 * returned as a generic `500`.
 */
export function toErrorResponse(cause: unknown): NextResponse {
  if (cause instanceof MuxRouteError) {
    if (cause.status >= 500 && !(cause instanceof UpstreamError)) {
      console.error(`[lms] mux route error ${cause.code}:`, cause.message);
    }
    return errorResponse(cause);
  }

  console.error("[lms] unexpected mux route failure:", cause);
  return errorResponse(
    new MuxRouteError(500, "UPSTREAM_FAILED", "Unexpected server error."),
  );
}

/* ------------------------------------------------------------------ */
/* Pipeline                                                            */
/* ------------------------------------------------------------------ */

/** A handler's result: the JSON body plus an optional status code. */
export interface HandlerResult<T> {
  data: T;
  status?: number;
}

/** `Retry-After` emitted alongside a `429`. */
const RETRY_AFTER_SEC = 60;

function rateLimitHeaders(limit: RateLimitResult): Record<string, string> | undefined {
  if (limit.remaining > 0) return { "X-RateLimit-Remaining": String(limit.remaining) };
  return undefined;
}

/**
 * Wrap a body-validated handler (`POST /api/mux/upload`, `POST /api/mux/token`).
 *
 * `schema` of `null` means the endpoint takes no body.
 */
export function withMuxHandler<TBody, TResult>(
  schema: z.ZodType<TBody> | null,
  exec: (body: TBody, request: Request) => Promise<HandlerResult<TResult>>,
): (request: Request) => Promise<NextResponse> {
  return async function route(request: Request): Promise<NextResponse> {
    try {
      assertAllowedOrigin(request);

      const limit = consumeRateLimit(clientKey(request));
      if (!limit.allowed) throw new RateLimitedError(limit.retryAfterSec);

      const body = schema === null ? (undefined as TBody) : await parseJsonBody(request, schema);
      const { data, status = 200 } = await exec(body, request);

      return json(data, status, rateLimitHeaders(limit));
    } catch (cause) {
      return finishWithError(cause);
    }
  };
}

/**
 * Wrap a params-validated handler (`GET`/`DELETE` on `/api/mux/.../[id]`).
 *
 * Next.js 15+ hands route params to the handler as a promise, so `context.params`
 * is awaited inside the wrapper — one place to get right rather than four.
 */
export function withMuxParamsHandler<TParams, TResult>(
  schema: z.ZodType<TParams>,
  exec: (params: TParams, request: Request) => Promise<HandlerResult<TResult>>,
): (request: Request, context: { params: Promise<TParams> }) => Promise<NextResponse> {
  return async function route(
    request: Request,
    context: { params: Promise<TParams> },
  ): Promise<NextResponse> {
    try {
      assertAllowedOrigin(request);

      const limit = consumeRateLimit(clientKey(request));
      if (!limit.allowed) throw new RateLimitedError(limit.retryAfterSec);

      const raw: unknown = await context.params;
      const params = parseParams(raw, schema);

      const { data, status = 200 } = await exec(params, request);

      return json(data, status, rateLimitHeaders(limit));
    } catch (cause) {
      return finishWithError(cause);
    }
  };
}

function finishWithError(cause: unknown): NextResponse {
  const response = toErrorResponse(cause);

  if (cause instanceof RateLimitedError) {
    response.headers.set("Retry-After", String(RETRY_AFTER_SEC));
  }

  return response;
}
