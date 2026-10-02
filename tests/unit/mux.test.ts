// @vitest-environment node
/**
 * Mux URL builders, error shapes, the origin check, the rate limiter and the
 * request-parsing helpers.
 *
 * Runs in the `node` environment because the helpers under test build real
 * `Request` objects and are marked `server-only`.
 */

import { describe, expect, it } from "vitest";

import { DEFAULT_SEED_PLAYBACK_ID, SEED_PLAYBACK_ID } from "@/lib/seed/playback";
import {
  MUX_IMAGE_ORIGIN,
  MUX_STREAM_ORIGIN,
  POSTER_WIDTHS,
  dashUrl,
  gifUrl,
  posterUrl,
  storyboardUrl,
  streamUrl,
} from "@/lib/mux/urls";
import { MuxRouteError, NotFoundError, formatIssues } from "@/lib/mux/errors";
import {
  RATE_LIMIT_CAPACITY,
  clientKey,
  consumeRateLimit,
  isAllowedOrigin,
  isDevHost,
  parseParams,
  parseJsonBody,
} from "@/lib/mux/handler";
import { createTokenRequestSchema, muxIdParamSchema } from "@/lib/schemas";

describe("posterUrl", () => {
  it("builds a Mux thumbnail url with time and width", () => {
    expect(posterUrl("playABC123", 2, 960)).toBe(
      `${MUX_IMAGE_ORIGIN}/playABC123/thumbnail.webp?time=2&width=960`,
    );
  });

  it("defaults to a 2 second frame at 960 wide", () => {
    expect(posterUrl("playABC123")).toBe(
      `${MUX_IMAGE_ORIGIN}/playABC123/thumbnail.webp?time=2&width=960`,
    );
  });

  it("falls back to the default width for an unsupported one", () => {
    expect(posterUrl("playABC123", 5, 123 as never)).toContain("width=960");
    expect(posterUrl("playABC123", 5, 320)).toContain("width=320");
  });

  it("rejects a non-positive time rather than emitting a broken url", () => {
    expect(posterUrl("playABC123", 0)).toContain("time=2");
    expect(posterUrl("playABC123", -5)).toContain("time=2");
  });

  it("appends a token for signed playback", () => {
    expect(posterUrl("playABC123", 2, 640, "tok")).toBe(
      `${MUX_IMAGE_ORIGIN}/playABC123/thumbnail.webp?time=2&width=640&token=tok`,
    );
  });

  it("exposes the widths it accepts", () => {
    expect(POSTER_WIDTHS).toContain(960);
  });
});

describe("streamUrl", () => {
  it("builds an HLS manifest url", () => {
    expect(streamUrl("playABC123")).toBe(`${MUX_STREAM_ORIGIN}/playABC123.m3u8`);
    expect(streamUrl("playABC123", "tok")).toBe(`${MUX_STREAM_ORIGIN}/playABC123.m3u8?token=tok`);
  });

  it("builds the companion image and dash urls", () => {
    expect(gifUrl("playABC123")).toContain("/playABC123/animated.gif?time=2");
    expect(storyboardUrl("playABC123")).toBe(`${MUX_IMAGE_ORIGIN}/playABC123/storyboard.jpg`);
    expect(dashUrl("playABC123", "tok")).toBe(`${MUX_STREAM_ORIGIN}/playABC123.mpd?token=tok`);
  });
});

describe("seed playback id", () => {
  it("defaults to Mux's public demo asset", () => {
    expect(DEFAULT_SEED_PLAYBACK_ID).toMatch(/^[A-Za-z0-9]+$/);
    expect(SEED_PLAYBACK_ID).toBe(DEFAULT_SEED_PLAYBACK_ID);
  });
});

describe("mux errors", () => {
  it("serialises to the shared ApiError shape", () => {
    expect(new NotFoundError().toJSON()).toEqual({
      error: { code: "NOT_FOUND", message: "The requested Mux resource does not exist." },
    });
  });

  it("carries a status and code", () => {
    const error = new MuxRouteError(418, "UPSTREAM_FAILED", "Teapot");

    expect(error.status).toBe(418);
    expect(error.code).toBe("UPSTREAM_FAILED");
    expect(error).toBeInstanceOf(Error);
  });

  it("flattens zod issues into dotted paths", () => {
    const result = createTokenRequestSchema.safeParse({});

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatIssues(result.error)[0]).toEqual({
        path: "playbackId",
        message: expect.any(String),
      });
    }
  });
});

describe("origin check", () => {
  function req(headers: Record<string, string>): Request {
    return new Request("http://localhost:3000/api/mux/upload", { headers });
  }

  it("accepts the configured origin", () => {
    expect(isAllowedOrigin(req({ origin: "http://localhost:3000" }))).toBe(true);
  });

  it("rejects a foreign origin", () => {
    expect(isAllowedOrigin(req({ origin: "https://evil.example" }))).toBe(false);
  });

  it("falls back to the referer when origin is absent", () => {
    expect(isAllowedOrigin(req({ referer: "http://localhost:3000/courses" }))).toBe(true);
    expect(isAllowedOrigin(req({ referer: "https://evil.example/x" }))).toBe(false);
  });

  it("allows a header-less same-origin request so status polling works", () => {
    expect(isAllowedOrigin(req({}))).toBe(true);
  });

  it("recognises dev hosts", () => {
    expect(isDevHost("http://localhost:3000")).toBe(true);
    expect(isDevHost("http://127.0.0.1:3000")).toBe(true);
    expect(isDevHost("https://lms.example.com")).toBe(false);
  });
});

describe("rate limiting", () => {
  it("allows a burst then blocks", () => {
    const results = Array.from({ length: RATE_LIMIT_CAPACITY + 5 }, () =>
      consumeRateLimit("1.2.3.4", 1_000_000),
    );

    expect(results.filter((result) => result.allowed)).toHaveLength(RATE_LIMIT_CAPACITY);
    const blocked = results.find((result) => !result.allowed);
    expect(blocked?.retryAfterSec).toBeGreaterThan(0);
  });

  it("refills over time", () => {
    for (let index = 0; index < RATE_LIMIT_CAPACITY; index += 1) {
      consumeRateLimit("5.6.7.8", 0);
    }

    expect(consumeRateLimit("5.6.7.8", 0).allowed).toBe(false);
    expect(consumeRateLimit("5.6.7.8", 60_000).allowed).toBe(true);
  });

  it("keys by client ip", () => {
    const request = new Request("http://localhost:3000/api/mux/upload", {
      headers: { "x-forwarded-for": "203.0.113.1, 70.41.3.18" },
    });

    expect(clientKey(request)).toBe("203.0.113.1");
  });
});

describe("param and body parsing", () => {
  it("parses valid params and rejects malformed ids", () => {
    expect(parseParams({ id: "upl_1" }, muxIdParamSchema)).toEqual({ id: "upl_1" });
    // Dashes and underscores are legal; separators and spaces are not.
    expect(parseParams({ id: "ast-1_x" }, muxIdParamSchema)).toEqual({ id: "ast-1_x" });
    expect(() => parseParams({ id: "bad id" }, muxIdParamSchema)).toThrow();
    expect(() => parseParams({ id: "../secrets" }, muxIdParamSchema)).toThrow();
    expect(() => parseParams({ id: "" }, muxIdParamSchema)).toThrow();
  });

  it("parses a JSON body and rejects a non-object", async () => {
    const request = new Request("http://localhost:3000/api/mux/token", {
      method: "POST",
      body: JSON.stringify({ playbackId: "playABC123" }),
    });

    await expect(parseJsonBody(request, createTokenRequestSchema)).resolves.toEqual({
      playbackId: "playABC123",
    });
  });

  it("raises VALIDATION_FAILED for malformed JSON", async () => {
    const request = new Request("http://localhost:3000/api/mux/token", {
      method: "POST",
      body: "{oops",
    });

    await expect(parseJsonBody(request, createTokenRequestSchema)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      status: 400,
    });
  });
});
