/**
 * Typed errors and the single JSON error shape used by every Mux route.
 *
 * Handlers never surface an SDK message verbatim: upstream errors are mapped
 * to a generic string so tokens and internal detail cannot leak (plan §4.4).
 */

import type { ApiError, ApiErrorCode } from "../types";

/** Base class for every error this app raises deliberately. */
export class MuxRouteError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message);
    this.name = "MuxRouteError";
    this.status = status;
    this.code = code;
  }

  /** Serialise to the wire format. */
  toJSON(): ApiError {
    return { error: { code: this.code, message: this.message } };
  }
}

/** The server variables are absent; the Studio must show its empty state. */
export class MuxNotConfiguredError extends MuxRouteError {
  constructor(message = "Mux is not configured. Add MUX_TOKEN_ID and MUX_TOKEN_SECRET.") {
    super(503, "MUX_NOT_CONFIGURED", message);
    this.name = "MuxNotConfiguredError";
  }
}

/** The signing key is absent; only signed playback is unavailable. */
export class MuxSigningNotConfiguredError extends MuxRouteError {
  constructor(
    message = "Mux signing is not configured. Add MUX_SIGNING_KEY_ID and MUX_PRIVATE_KEY.",
  ) {
    super(503, "MUX_NOT_CONFIGURED", message);
    this.name = "MuxSigningNotConfiguredError";
  }
}

/** Origin or referer did not match the configured app host. */
export class ForbiddenOriginError extends MuxRouteError {
  constructor(message = "Origin is not allowed.") {
    super(403, "FORBIDDEN_ORIGIN", message);
    this.name = "ForbiddenOriginError";
  }
}

/** The request body or params failed schema validation. */
export class ValidationError extends MuxRouteError {
  readonly issues: ReadonlyArray<{ path: string; message: string }>;

  constructor(issues: ReadonlyArray<{ path: string; message: string }>) {
    super(400, "VALIDATION_FAILED", "Request validation failed.");
    this.name = "ValidationError";
    this.issues = issues;
  }
}

/** The upstream Mux resource does not exist. */
export class NotFoundError extends MuxRouteError {
  constructor(message = "The requested Mux resource does not exist.") {
    super(404, "NOT_FOUND", message);
    this.name = "NotFoundError";
  }
}

/** The per-IP token bucket is empty. */
export class RateLimitedError extends MuxRouteError {
  constructor(retryAfterSec: number) {
    super(429, "RATE_LIMITED", `Too many requests. Try again in ${retryAfterSec}s.`);
    this.name = "RateLimitedError";
  }
}

/** The Mux API call failed. The original error is kept for server logs only. */
export class UpstreamError extends MuxRouteError {
  readonly cause?: unknown;

  constructor(message = "Mux request failed.", cause?: unknown) {
    super(502, "UPSTREAM_FAILED", message);
    this.name = "UpstreamError";
    this.cause = cause;
  }
}

/** Convert a `zod` error into the flat issue list the API returns. */
export function formatIssues(error: {
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
}): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}
