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

/** `true` when the request comes from this app. */
export function isAllowedOrigin(request: Request): boolean {
  const allowed = hostOf(getAppUrl());
  if (allowed === null) return true;

  const origin = hostOf(request.headers.get("origin"));
  if (origin !== null) return originMatches(origin, allowed);

  const referer = hostOf(request.headers.get("referer"));
  if (referer !== null) return originMatches(referer, allowed);

  // A same-origin browser request always sends `Origin` for POST, but a
  // same-origin GET may omit both headers. Treat that as allowed so status
  // polling is not broken; CORS still stops a foreign page from reading it.
  return true;
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

/** Best-effort client IP from the usual proxy headers. */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";

  return request.headers.get("x-real-ip")?.trim() || "unknown";
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
