"use client";

/**
 * Browser-side Mux API client.
 *
 * Every Mux secret stays on the server, so the browser only ever talks to this
 * app's own Route Handlers (decision D1). Each call returns parsed data or
 * throws an `ApiRequestError` carrying the route's error code, so callers can
 * branch on `MUX_NOT_CONFIGURED` rather than pattern-matching a message.
 */

import type {
  ApiError,
  ApiErrorCode,
  AssetStatusResponse,
  CreateTokenRequest,
  CreateTokenResponse,
  CreateUploadRequest,
  CreateUploadResponse,
  DeleteAssetResponse,
  MuxStatusResponse,
  PlaybackPolicy,
  PlaybackTokens,
  UploadStatusResponse,
} from "@/lib/types";

/** A failed call, with the server's machine-readable code intact. */
export class ApiRequestError extends Error {
  readonly code: ApiErrorCode | "NETWORK_ERROR";
  readonly status: number;

  constructor(code: ApiErrorCode | "NETWORK_ERROR", message: string, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.code = code;
    this.status = status;
  }

  /** `true` when Mux credentials are absent, so Studio should degrade. */
  get isMuxNotConfigured(): boolean {
    return this.code === "MUX_NOT_CONFIGURED";
  }
}

function isApiError(value: unknown): value is ApiError {
  if (typeof value !== "object" || value === null) return false;
  const error = (value as { error?: unknown }).error;
  return typeof error === "object" && error !== null && typeof (error as { code?: unknown }).code === "string";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(path, {
      ...init,
      headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
      // Mux state is per-user and changes constantly; never serve it from cache.
      cache: "no-store",
    });
  } catch (cause) {
    throw new ApiRequestError(
      "NETWORK_ERROR",
      cause instanceof Error ? cause.message : "The network request failed.",
      0,
    );
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    if (isApiError(payload)) {
      throw new ApiRequestError(payload.error.code, payload.error.message, response.status);
    }

    throw new ApiRequestError("UPSTREAM_FAILED", `Request failed with status ${response.status}.`, response.status);
  }

  return payload as T;
}

/**
 * What this deployment supports.
 *
 * Always resolves: an unreachable server is reported as "not configured",
 * because the Studio's response to that is the same either way.
 */
export async function fetchMuxStatus(): Promise<MuxStatusResponse> {
  try {
    return await request<MuxStatusResponse>("/api/mux/upload");
  } catch {
    return { configured: false, signing: false };
  }
}

/** Create a Mux direct upload and return its one-time upload URL. */
export function createDirectUpload(policy: PlaybackPolicy): Promise<CreateUploadResponse> {
  const body: CreateUploadRequest = { policy };

  return request<CreateUploadResponse>("/api/mux/upload", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Poll whether the uploaded bytes have become an asset yet. */
export function fetchUploadStatus(uploadId: string): Promise<UploadStatusResponse> {
  return request<UploadStatusResponse>(`/api/mux/upload/${encodeURIComponent(uploadId)}`);
}

/** Poll whether the asset has finished processing. */
export function fetchAssetStatus(assetId: string): Promise<AssetStatusResponse> {
  return request<AssetStatusResponse>(`/api/mux/asset/${encodeURIComponent(assetId)}`);
}

/**
 * Delete a Mux asset, best-effort.
 *
 * The caller is removing a lesson; failing to delete the remote asset must not
 * block the local removal, so this resolves rather than throwing.
 */
export async function deleteMuxAsset(assetId: string): Promise<boolean> {
  try {
    const result = await request<DeleteAssetResponse>(
      `/api/mux/asset/${encodeURIComponent(assetId)}`,
      { method: "DELETE" },
    );

    return result.deleted === true;
  } catch {
    return false;
  }
}

/** Sign playback, thumbnail and storyboard tokens for a protected asset. */
export function createPlaybackTokens(playbackId: string): Promise<CreateTokenResponse> {
  const body: CreateTokenRequest = { playbackId };

  return request<CreateTokenResponse>("/api/mux/token", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export type { PlaybackTokens };