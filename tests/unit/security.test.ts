/**
 * Origin enforcement, rate-limit hygiene and asset verification.
 *
 * These are the checks the browser and the CDN can be trusted to pass but a
 * non-browser caller cannot, so they are pure logic and tested directly.
 */

import { describe, expect, it } from "vitest";

import {
  BUCKET_IDLE_TTL_MS,
  MAX_TRACKED_BUCKETS,
  RATE_LIMIT_CAPACITY,
  consumeRateLimit,
  isAllowedOrigin,
  normaliseIp,
  resetRateLimits,
  trackedBucketCount,
} from "@/lib/mux/handler";
import {
  formatVerification,
  isSupportedAspect,
  verifyPlaybackAsset,
  type FetchLike,
} from "@/lib/mux/playback-verifier";

/* ------------------------------------------------------------------ */
/* Origin enforcement                                                  */
/* ------------------------------------------------------------------ */

function request(method: string, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/mux/upload", { method, headers });
}

describe("origin enforcement", () => {
  it("allows a matching origin", () => {
    expect(
      isAllowedOrigin(request("POST", { origin: "http://localhost:3000" })),
    ).toBe(true);
  });

  it("rejects a foreign origin", () => {
    expect(isAllowedOrigin(request("POST", { origin: "https://evil.example" }))).toBe(false);
  });

  it("falls back to the referer when there is no origin", () => {
    expect(
      isAllowedOrigin(request("POST", { referer: "http://localhost:3000/courses" })),
    ).toBe(true);
    expect(isAllowedOrigin(request("POST", { referer: "https://evil.example/x" }))).toBe(false);
  });

  it("allows a read with no origin evidence at all", () => {
    // Status polling uses GET, and a same-origin GET may omit both headers.
    expect(isAllowedOrigin(request("GET"))).toBe(true);
  });

  it("rejects a write that carries no origin evidence", () => {
    // This is the bypass: with neither header present there is nothing to check
    // the caller against, and a write is exactly the case that must not fall
    // through to "allowed".
    for (const method of ["POST", "DELETE", "PUT", "PATCH"]) {
      expect(isAllowedOrigin(request(method)), `${method} must not be allowed bare`).toBe(false);
    }
  });

  it("treats an empty header as absent", () => {
    expect(isAllowedOrigin(request("POST", { origin: "   " }))).toBe(false);
  });

  it("is case-insensitive about the method", () => {
    expect(isAllowedOrigin(request("delete"))).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Client key hygiene                                                  */
/* ------------------------------------------------------------------ */

describe("client key", () => {
  it("normalises IPv4 and IPv6", () => {
    expect(normaliseIp("203.0.113.7")).toBe("203.0.113.7");
    expect(normaliseIp("  203.0.113.7  ")).toBe("203.0.113.7");
    expect(normaliseIp("2001:db8::1")).toBe("2001:db8::1");
  });

  it("accepts the bracketed and port-suffixed forms proxies emit", () => {
    expect(normaliseIp("[::1]:8080")).toBe("::1");
    expect(normaliseIp("[2001:db8::1]")).toBe("2001:db8::1");
  });

  it("rejects anything that is not an address", () => {
    // A crafted value would otherwise mint a fresh bucket on every request,
    // which is how the limiter gets bypassed and the map gets grown.
    expect(normaliseIp("not-an-ip")).toBeNull();
    expect(normaliseIp("")).toBeNull();
    expect(normaliseIp("   ")).toBeNull();
    expect(normaliseIp(null)).toBeNull();
    expect(normaliseIp("999.1.1.1")).toBeNull();
    expect(normaliseIp("10.0.0.01")).toBeNull(); // Leading zeros: ambiguous.
    expect(normaliseIp("dead:beef")).toBeNull(); // Not enough colons.
    expect(normaliseIp("fe80::1%eth0")).toBeNull(); // Zone id.
    expect(normaliseIp("10.0.0.0/8")).toBeNull(); // Prefix smuggling.
    expect(normaliseIp("a".repeat(64))).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Rate-limit map hygiene                                              */
/* ------------------------------------------------------------------ */

describe("rate limit bucket hygiene", () => {
  it("prunes buckets that have refilled and gone idle", () => {
    resetRateLimits();
    const start = 1_000_000;

    for (let index = 0; index < 30; index += 1) {
      consumeRateLimit(`ip_${index}`, start);
    }

    expect(trackedBucketCount(start)).toBe(30);

    // Within the idle window, a drained bucket is still doing work: dropping it
    // early would hand each of those callers a second full allowance.
    consumeRateLimit("ip_0", start + BUCKET_IDLE_TTL_MS - 1);
    expect(trackedBucketCount(start + BUCKET_IDLE_TTL_MS - 1)).toBe(30);

    // Past it, they are full and carry nothing worth keeping.
    const later = start + BUCKET_IDLE_TTL_MS + 1;
    consumeRateLimit("ip_0", later);
    expect(trackedBucketCount(later)).toBe(1);

    resetRateLimits();
  });

  it("keeps a drained bucket while it still carries limiter state", () => {
    resetRateLimits();
    const start = 2_000_000;

    // Exhaust this one.
    for (let index = 0; index < RATE_LIMIT_CAPACITY + 2; index += 1) {
      consumeRateLimit("busy", start);
    }

    expect(consumeRateLimit("busy", start).allowed).toBe(false);

    /*
     * Past the idle TTL the bucket has swept at least once. The refill is
     * continuous, so some allowance legitimately returns — but only the amount
     * the elapsed time earned. A pruned-and-recreated bucket would reset to a
     * full allowance, so the caller would get the entire budget back for free.
     */
    const later = start + BUCKET_IDLE_TTL_MS * 10;
    const refilled = consumeRateLimit("busy", later);
    expect(refilled.allowed).toBe(true);
    expect(refilled.remaining).toBeLessThan(RATE_LIMIT_CAPACITY);

    resetRateLimits();
  });

  it("stays within the tracked-bucket ceiling under key rotation", () => {
    resetRateLimits();
    const start = 3_000_000;
    const rotated = MAX_TRACKED_BUCKETS + 500;

    /*
     * Exactly the abuse the ceiling exists for: a caller who controls the
     * forwarded-for value gets a fresh bucket on every request. Without a bound
     * this loop is an unbounded allocation driven by an unauthenticated caller.
     */
    for (let index = 0; index < rotated; index += 1) {
      consumeRateLimit(`10.0.${Math.floor(index / 256)}.${index % 256}`, start);
    }

    expect(trackedBucketCount(start)).toBe(MAX_TRACKED_BUCKETS);

    resetRateLimits();
  });
});

/* ------------------------------------------------------------------ */
/* Playback asset verification                                         */
/* ------------------------------------------------------------------ */

const MASTER = [
  "#EXTM3U",
  '#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=1280x720,CODECS="avc1.4d401f"',
  "https://cdn.example/rendition-low.m3u8",
  '#EXT-X-STREAM-INF:BANDWIDTH=2400000,RESOLUTION=1920x1080,CODECS="avc1.640020"',
  "https://cdn.example/rendition-high.m3u8",
].join("\n");

/** Sixty seconds, so the clip clears the lesson-duration floor. */
const MEDIA = [
  "#EXTM3U",
  "#EXT-X-TARGETDURATION:6",
  ...Array.from({ length: 10 }, (_, index) => `#EXTINF:6.0,\nseg${index}.m4s`),
  "#EXT-X-ENDLIST",
].join("\n");

function fakeFetch(routes: Record<string, string | null>): FetchLike {
  return (async (url: string) => {
    const body = Object.entries(routes).find(([prefix]) => url.startsWith(prefix))?.[1] ?? null;

    if (body === null) return { ok: false, status: 404, text: async () => "" };
    return { ok: true, status: 200, text: async () => body };
  }) as FetchLike;
}

const GOOD_ROUTES = {
  "https://stream.mux.com/abc.m3u8": MASTER,
  "https://cdn.example/rendition-low.m3u8": MEDIA,
  "https://cdn.example/rendition-high.m3u8": MEDIA,
  "https://image.mux.com/abc/": "webp",
};

describe("playback asset verification", () => {
  it("accepts a long widescreen asset", async () => {
    const result = await verifyPlaybackAsset("abc", { fetchImpl: fakeFetch(GOOD_ROUTES) });

    expect(result.ok).toBe(true);
    expect(result.streamAvailable).toBe(true);
    expect(result.thumbnailAvailable).toBe(true);
    expect(result.durationSec).toBeCloseTo(60, 1);
    // The highest-bandwidth rendition, not the first listed.
    expect(result.width).toBe(1920);
    expect(result.aspectRatioLabel).toBe("16:9");
  });

  it("rejects a short clip, and says why", async () => {
    // Mux hosts background-video loops as public assets: valid ids that are
    // useless as lessons, because they end before a learner can read the title.
    const result = await verifyPlaybackAsset("abc", {
      fetchImpl: fakeFetch({
        ...GOOD_ROUTES,
        "https://cdn.example/rendition-low.m3u8": "#EXTM3U\n#EXTINF:9.8,\na.m4s\n#EXT-X-ENDLIST",
        "https://cdn.example/rendition-high.m3u8": "#EXTM3U\n#EXTINF:9.8,\na.m4s\n#EXT-X-ENDLIST",
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toMatch(/too short to be a lesson/);
  });

  it("rejects a square asset for a 16:9 player", async () => {
    const square = MASTER.replace(/1920x1080/g, "674x674").replace(/1280x720/g, "674x674");
    const result = await verifyPlaybackAsset("abc", {
      fetchImpl: fakeFetch({ ...GOOD_ROUTES, "https://stream.mux.com/abc.m3u8": square }),
    });

    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toMatch(/letterbox/);
  });

  it("reports an unreachable manifest without throwing", async () => {
    const result = await verifyPlaybackAsset("abc", { fetchImpl: fakeFetch({}) });

    expect(result.ok).toBe(false);
    expect(result.streamAvailable).toBe(false);
    expect(result.problems[0]).toMatch(/not served/);
  });

  it("rejects a malformed id before making any request", async () => {
    let called = false;
    const result = await verifyPlaybackAsset("not a valid id", {
      fetchImpl: (async () => {
        called = true;
        return { ok: true, status: 200, text: async () => "" };
      }) as FetchLike,
    });

    expect(result.ok).toBe(false);
    expect(called).toBe(false);
  });

  it("reports a network failure as a problem, not an exception", async () => {
    const result = await verifyPlaybackAsset("abc", {
      fetchImpl: (async () => {
        throw new Error("ENOTFOUND");
      }) as FetchLike,
    });

    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toMatch(/ENOTFOUND/);
  });

  it("treats a live playlist, which has no end list, as unknown duration", async () => {
    const result = await verifyPlaybackAsset("abc", {
      fetchImpl: fakeFetch({
        ...GOOD_ROUTES,
        "https://cdn.example/rendition-low.m3u8": "#EXTM3U\n#EXTINF:6.0,\nseg1.m4s",
        "https://cdn.example/rendition-high.m3u8": "#EXTM3U\n#EXTINF:6.0,\nseg1.m4s",
      }),
    });

    expect(result.durationSec).toBeNull();
    expect(result.ok).toBe(false);
  });
});

describe("aspect ratio support", () => {
  it("accepts the ratios a lesson player presents well", () => {
    expect(isSupportedAspect(1920, 1080)).toBe(true);
    expect(isSupportedAspect(1440, 1080)).toBe(true);
    expect(isSupportedAspect(2560, 1080)).toBe(true);
  });

  it("rejects square, which is the letterbox case, not a supported ratio", () => {
    // A square clip is valid video and a fine asset; it is the wrong shape for
    // this player, where it bars the sides and costs most of a phone screen.
    expect(isSupportedAspect(1000, 1000)).toBe(false);
  });

  it("rejects extreme ratios and nonsense dimensions", () => {
    expect(isSupportedAspect(1080, 1920)).toBe(false);
    expect(isSupportedAspect(1000, 100)).toBe(false);
    expect(isSupportedAspect(0, 100)).toBe(false);
    expect(isSupportedAspect(null, null)).toBe(false);
  });
});

describe("verification formatting", () => {
  it("names every problem it found", async () => {
    const result = await verifyPlaybackAsset("abc", { fetchImpl: fakeFetch({}) });
    const text = formatVerification(result);

    expect(text).toContain("unusable");
    expect(text).toContain("stream manifest: unavailable");
  });
});