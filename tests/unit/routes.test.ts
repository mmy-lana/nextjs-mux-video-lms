// @vitest-environment node
/**
 * Route-handler tests.
 *
 * `@mux/mux-node` is mocked so the pipeline can be exercised without network
 * access or credentials, which is also how the `MUX_NOT_CONFIGURED` and
 * upstream-failure branches are reached deterministically.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MuxNotConfiguredError } from "@/lib/mux/errors";
import { resetRateLimits } from "@/lib/mux/handler";

const uploadCreate = vi.fn();
const uploadRetrieve = vi.fn();
const assetRetrieve = vi.fn();
const assetDelete = vi.fn();
const signPlaybackId = vi.fn();
const getMuxClient = vi.fn();

vi.mock("@mux/mux-node", () => ({
  default: class MuxMock {},
}));

vi.mock("@/lib/mux/server", () => ({
  getMuxClient: () => getMuxClient(),
  isMuxConfigured: () => true,
  resetMuxClient: () => {},
  getSigningKey: () => ({ keyId: "key-1", keySecret: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----" }),
}));

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...actual,
    getAppUrl: () => "http://localhost:3000",
  };
});

const ORIGIN = "http://localhost:3000";

function request(url: string, init: RequestInit & { origin?: string } = {}): Request {
  const headers = new Headers(init.headers);
  headers.set("origin", init.origin ?? ORIGIN);

  return new Request(url, { ...init, headers });
}

function params<T>(value: T): { params: Promise<T> } {
  return { params: Promise.resolve(value) };
}

async function importRoute(path: string) {
  return import(path);
}

beforeEach(() => {
  resetRateLimits();
  getMuxClient.mockReturnValue({
    video: {
      uploads: { create: uploadCreate, retrieve: uploadRetrieve },
      assets: { retrieve: assetRetrieve, delete: assetDelete },
    },
    jwt: { signPlaybackId },
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

/* ------------------------------------------------------------------ */

describe("POST /api/mux/upload", () => {
  it("returns an upload id and url with cors_origin set to the app url", async () => {
    const { POST } = await importRoute("@/app/api/mux/upload/route");
    uploadCreate.mockResolvedValue({ id: "upl_1", url: "https://storage.googleapis.com/x" });

    const response = await POST(request("http://localhost:3000/api/mux/upload", {
      method: "POST",
      body: JSON.stringify({ policy: "public" }),
    }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      uploadId: "upl_1",
      url: "https://storage.googleapis.com/x",
    });

    expect(uploadCreate).toHaveBeenCalledWith({
      cors_origin: "http://localhost:3000",
      new_asset_settings: { playback_policy: ["public"] },
    });
  });

  it("passes a signed policy through", async () => {
    const { POST } = await importRoute("@/app/api/mux/upload/route");
    uploadCreate.mockResolvedValue({ id: "upl_2", url: "https://storage.googleapis.com/y" });

    await POST(request("http://localhost:3000/api/mux/upload", {
      method: "POST",
      body: JSON.stringify({ policy: "signed" }),
    }));

    expect(uploadCreate).toHaveBeenCalledWith({
      cors_origin: "http://localhost:3000",
      new_asset_settings: { playback_policy: ["signed"] },
    });
  });

  it("rejects an invalid policy with 400 VALIDATION_FAILED", async () => {
    const { POST } = await importRoute("@/app/api/mux/upload/route");

    const response = await POST(request("http://localhost:3000/api/mux/upload", {
      method: "POST",
      body: JSON.stringify({ policy: "drm" }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_FAILED" },
    });
    expect(uploadCreate).not.toHaveBeenCalled();
  });

  it("rejects a malformed body with 400", async () => {
    const { POST } = await importRoute("@/app/api/mux/upload/route");

    const response = await POST(request("http://localhost:3000/api/mux/upload", {
      method: "POST",
      body: "{not json",
    }));

    expect(response.status).toBe(400);
  });

  it("rejects a foreign origin with 403 FORBIDDEN_ORIGIN", async () => {
    const { POST } = await importRoute("@/app/api/mux/upload/route");

    const response = await POST(request("http://localhost:3000/api/mux/upload", {
      method: "POST",
      body: JSON.stringify({ policy: "public" }),
      origin: "http://evil.example",
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "FORBIDDEN_ORIGIN" },
    });
    expect(uploadCreate).not.toHaveBeenCalled();
  });

  it("accepts a different loopback port", async () => {
    const { POST } = await importRoute("@/app/api/mux/upload/route");

    // `next build && next start` serves on whatever port it is given, while the
    // app URL keeps its development default.
    const response = await POST(request("http://localhost:3000/api/mux/upload", {
      method: "POST",
      body: JSON.stringify({ policy: "public" }),
      origin: "http://localhost:3111",
    }));

    expect(response.status).toBe(201);
  });

  it("still rejects a loopback-looking public host", async () => {
    const { POST } = await importRoute("@/app/api/mux/upload/route");

    const response = await POST(request("http://localhost:3000/api/mux/upload", {
      method: "POST",
      body: JSON.stringify({ policy: "public" }),
      origin: "http://localhost.evil.example",
    }));

    expect(response.status).toBe(403);
  });

  it("maps an SDK failure to 502 UPSTREAM_FAILED without leaking detail", async () => {
    const { POST } = await importRoute("@/app/api/mux/upload/route");
    uploadCreate.mockRejectedValue(new Error("token=hunter2 rejected by api.mux.com"));

    const response = await POST(request("http://localhost:3000/api/mux/upload", {
      method: "POST",
      body: JSON.stringify({ policy: "public" }),
    }));

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error.code).toBe("UPSTREAM_FAILED");
    expect(JSON.stringify(body)).not.toContain("hunter2");
  });

  it("sets no-store on every response", async () => {
    const { POST } = await importRoute("@/app/api/mux/upload/route");
    uploadCreate.mockResolvedValue({ id: "u", url: "https://x" });

    const response = await POST(request("http://localhost:3000/api/mux/upload", {
      method: "POST",
      body: JSON.stringify({ policy: "public" }),
    }));

    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("returns 503 MUX_NOT_CONFIGURED when the client cannot be built", async () => {
    const { POST } = await importRoute("@/app/api/mux/upload/route");
    getMuxClient.mockImplementation(() => {
      throw new MuxNotConfiguredError();
    });

    const response = await POST(request("http://localhost:3000/api/mux/upload", {
      method: "POST",
      body: JSON.stringify({ policy: "public" }),
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "MUX_NOT_CONFIGURED" },
    });
    expect(uploadCreate).not.toHaveBeenCalled();
  });

  it("returns a generic 500 for an unexpected failure, without leaking detail", async () => {
    const { POST } = await importRoute("@/app/api/mux/upload/route");
    getMuxClient.mockImplementation(() => {
      throw new Error("connection string postgres://user:hunter2 refused");
    });

    const response = await POST(request("http://localhost:3000/api/mux/upload", {
      method: "POST",
      body: JSON.stringify({ policy: "public" }),
    }));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe("UPSTREAM_FAILED");
    expect(JSON.stringify(body)).not.toContain("hunter2");
  });

  it("rate limits after 20 requests in a window", async () => {
    const { POST } = await importRoute("@/app/api/mux/upload/route");
    uploadCreate.mockResolvedValue({ id: "u", url: "https://x" });

    let limited: Response | null = null;
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const response = await POST(request("http://localhost:3000/api/mux/upload", {
        method: "POST",
        body: JSON.stringify({ policy: "public" }),
        headers: { "x-forwarded-for": "203.0.113.9" },
      }));

      if (response.status === 429) {
        limited = response;
        break;
      }
    }

    expect(limited).not.toBeNull();
    await expect(limited!.json()).resolves.toMatchObject({ error: { code: "RATE_LIMITED" } });
    expect(limited!.headers.get("retry-after")).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ */

describe("GET /api/mux/upload/[id]", () => {
  it("awaits context.params and reports waiting", async () => {
    const { GET } = await importRoute("@/app/api/mux/upload/[id]/route");
    uploadRetrieve.mockResolvedValue({ id: "upl_1", status: "waiting" });

    const response = await GET(
      request("http://localhost:3000/api/mux/upload/upl_1"),
      params({ id: "upl_1" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "waiting",
      assetId: null,
      errorMessage: null,
    });
    expect(uploadRetrieve).toHaveBeenCalledWith("upl_1");
  });

  it("reports the asset id once the asset is created", async () => {
    const { GET } = await importRoute("@/app/api/mux/upload/[id]/route");
    uploadRetrieve.mockResolvedValue({ id: "upl_1", status: "asset_created", asset_id: "ast_1" });

    const response = await GET(
      request("http://localhost:3000/api/mux/upload/upl_1"),
      params({ id: "upl_1" }),
    );

    await expect(response.json()).resolves.toEqual({
      status: "asset_created",
      assetId: "ast_1",
      errorMessage: null,
    });
  });

  it("surfaces an errored upload with a message", async () => {
    const { GET } = await importRoute("@/app/api/mux/upload/[id]/route");
    uploadRetrieve.mockResolvedValue({
      id: "upl_1",
      status: "errored",
      error: { type: "upload_expired", message: "The upload expired." },
    });

    const response = await GET(
      request("http://localhost:3000/api/mux/upload/upl_1"),
      params({ id: "upl_1" }),
    );

    await expect(response.json()).resolves.toEqual({
      status: "errored",
      assetId: null,
      errorMessage: "The upload expired.",
    });
  });

  it("maps a 404 from Mux to 404 NOT_FOUND", async () => {
    const { GET } = await importRoute("@/app/api/mux/upload/[id]/route");
    const notFound = Object.assign(new Error("nope"), { status: 404 });
    uploadRetrieve.mockRejectedValue(notFound);

    const response = await GET(
      request("http://localhost:3000/api/mux/upload/upl_1"),
      params({ id: "upl_1" }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("rejects a malformed id before calling Mux", async () => {
    const { GET } = await importRoute("@/app/api/mux/upload/[id]/route");

    const response = await GET(
      request("http://localhost:3000/api/mux/upload/bad%20id"),
      params({ id: "bad id" }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_FAILED" },
    });
    expect(uploadRetrieve).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */

describe("GET|DELETE /api/mux/asset/[id]", () => {
  it("reports a preparing asset with no playback id", async () => {
    const { GET } = await importRoute("@/app/api/mux/asset/[id]/route");
    assetRetrieve.mockResolvedValue({ id: "ast_1", status: "preparing", playback_ids: [] });

    const response = await GET(
      request("http://localhost:3000/api/mux/asset/ast_1"),
      params({ id: "ast_1" }),
    );

    await expect(response.json()).resolves.toEqual({
      status: "preparing",
      playbackId: null,
      durationSec: null,
      errorMessage: null,
    });
  });

  it("returns the first playback id and a rounded duration when ready", async () => {
    const { GET } = await importRoute("@/app/api/mux/asset/[id]/route");
    assetRetrieve.mockResolvedValue({
      id: "ast_1",
      status: "ready",
      duration: 123.456,
      playback_ids: [{ id: "playABC123" }, { id: "playXYZ789" }],
    });

    const response = await GET(
      request("http://localhost:3000/api/mux/asset/ast_1"),
      params({ id: "ast_1" }),
    );

    await expect(response.json()).resolves.toEqual({
      status: "ready",
      playbackId: "playABC123",
      durationSec: 123,
      errorMessage: null,
    });
  });

  it("surfaces an errored asset with Mux's message", async () => {
    const { GET } = await importRoute("@/app/api/mux/asset/[id]/route");
    assetRetrieve.mockResolvedValue({
      id: "ast_1",
      status: "errored",
      errors: { type: "invalid_input", messages: ["Unsupported codec"] },
    });

    const response = await GET(
      request("http://localhost:3000/api/mux/asset/ast_1"),
      params({ id: "ast_1" }),
    );

    const body = await response.json();
    expect(body.status).toBe("errored");
    expect(body.errorMessage).toBe("Mux reported an asset error.");
  });

  it("deletes an asset", async () => {
    const { DELETE } = await importRoute("@/app/api/mux/asset/[id]/route");
    assetDelete.mockResolvedValue(undefined);

    const response = await DELETE(
      request("http://localhost:3000/api/mux/asset/ast_1", { method: "DELETE" }),
      params({ id: "ast_1" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: true });
    expect(assetDelete).toHaveBeenCalledWith("ast_1");
  });

  it("treats an already-deleted asset as success", async () => {
    const { DELETE } = await importRoute("@/app/api/mux/asset/[id]/route");
    assetDelete.mockRejectedValue(Object.assign(new Error("gone"), { status: 404 }));

    const response = await DELETE(
      request("http://localhost:3000/api/mux/asset/ast_1", { method: "DELETE" }),
      params({ id: "ast_1" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: true });
  });

  it("maps an upstream failure to 502", async () => {
    const { DELETE } = await importRoute("@/app/api/mux/asset/[id]/route");
    assetDelete.mockRejectedValue(new Error("secret=abc upstream exploded"));

    const response = await DELETE(
      request("http://localhost:3000/api/mux/asset/ast_1", { method: "DELETE" }),
      params({ id: "ast_1" }),
    );

    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain("abc");
  });
});

/* ------------------------------------------------------------------ */

describe("POST /api/mux/token", () => {
  it("signs playback, thumbnail and storyboard tokens", async () => {
    const { POST } = await importRoute("@/app/api/mux/token/route");
    signPlaybackId.mockImplementation(async (_id: string, options?: { type?: string }) => {
      if (options?.type === "thumbnail") return "tok-thumb";
      if (options?.type === "storyboard") return "tok-story";
      return "tok-video";
    });

    const response = await POST(request("http://localhost:3000/api/mux/token", {
      method: "POST",
      body: JSON.stringify({ playbackId: "playABC123" }),
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.playback).toBe("tok-video");
    expect(body.thumbnail).toBe("tok-thumb");
    expect(body.storyboard).toBe("tok-story");
    expect(body.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("rejects a missing playback id", async () => {
    const { POST } = await importRoute("@/app/api/mux/token/route");

    const response = await POST(request("http://localhost:3000/api/mux/token", {
      method: "POST",
      body: JSON.stringify({}),
    }));

    expect(response.status).toBe(400);
    expect(signPlaybackId).not.toHaveBeenCalled();
  });

  it("maps a signing failure to 502 without leaking the key", async () => {
    const { POST } = await importRoute("@/app/api/mux/token/route");
    signPlaybackId.mockRejectedValue(new Error("RSA private key abcdef rejected"));

    const response = await POST(request("http://localhost:3000/api/mux/token", {
      method: "POST",
      body: JSON.stringify({ playbackId: "playABC123" }),
    }));

    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain("abcdef");
  });
});
