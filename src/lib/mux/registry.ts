/**
 * Server-side registry of assets this deployment created.
 *
 * The browser keeps learner state in `localStorage`, so the server has no record
 * of what the Studio owns. Without something to check against, `DELETE
 * /api/mux/asset/[id]` accepts an arbitrary Mux asset id and will delete
 * anything in the account, including material this app never touched.
 *
 * The registry closes that gap with a capability rather than an account-wide
 * permission: `POST /api/mux/upload` mints a random token, binds it to the
 * upload it created, and hands it to the caller. Deleting an asset requires
 * presenting the token that was issued for it. Possession of a Mux asset id is
 * not enough; possession of the capability is.
 *
 * Bounded by construction: entries expire, and the sweep runs on every write, so
 * a long-lived process cannot accumulate entries indefinitely.
 */

import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * How long an issued capability stays valid.
 *
 * Comfortably longer than an upload takes to process, and short enough that a
 * forgotten registry cannot become a permanent liability. A caller that loses
 * its token can always upload again.
 */
export const REGISTRY_TTL_MS = 24 * 60 * 60 * 1000;

/** Tokens are compared by digest, so the map never holds a usable secret. */
interface RegistryEntry {
  tokenDigest: Buffer;
  assetId: string | null;
  expiresAt: number;
}

const uploadsById = new Map<string, RegistryEntry>();
const uploadsByAssetId = new Map<string, string>();

/** Drop every entry whose TTL has passed. */
function sweep(nowMs: number): void {
  for (const [uploadId, entry] of uploadsById) {
    if (entry.expiresAt > nowMs) continue;

    uploadsById.delete(uploadId);
    if (entry.assetId !== null && uploadsByAssetId.get(entry.assetId) === uploadId) {
      uploadsByAssetId.delete(entry.assetId);
    }
  }
}

/** Mint a capability for a newly created upload, and remember its digest. */
export function issueDeleteCapability(uploadId: string, nowMs: number = Date.now()): string {
  sweep(nowMs);

  const token = randomBytes(32).toString("hex");

  uploadsById.set(uploadId, {
    tokenDigest: digest(token),
    assetId: null,
    expiresAt: nowMs + REGISTRY_TTL_MS,
  });

  return token;
}

/** Bind a Mux asset id to the upload it came from. */
export function bindAssetToUpload(
  uploadId: string,
  assetId: string,
  nowMs: number = Date.now(),
): void {
  const entry = uploadsById.get(uploadId);
  if (entry === undefined) return;

  const previous = entry.assetId;
  if (previous !== null && previous !== assetId) uploadsByAssetId.delete(previous);

  entry.assetId = assetId;
  uploadsByAssetId.set(assetId, uploadId);

  sweep(nowMs);
}

/**
 * `true` when `token` is the capability issued for the upload behind `assetId`.
 *
 * Comparison is constant time over the digest, so a caller learns nothing about
 * how much of the token was correct.
 */
export function verifyDeleteCapability(
  assetId: string,
  token: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (typeof token !== "string" || token.length === 0) return false;

  sweep(nowMs);

  const uploadId = uploadsByAssetId.get(assetId);
  if (uploadId === undefined) return false;

  const entry = uploadsById.get(uploadId);
  if (entry === undefined || entry.expiresAt <= nowMs) return false;

  const presented = digest(token);
  const expected = entry.tokenDigest;

  return presented.length === expected.length && timingSafeEqual(presented, expected);
}

/** `true` when the registry holds a capability for this asset at all. */
export function isRegisteredAsset(assetId: string, nowMs: number = Date.now()): boolean {
  sweep(nowMs);
  return uploadsByAssetId.has(assetId);
}

/** Drop every record. Test seam. */
export function resetRegistry(): void {
  uploadsById.clear();
  uploadsByAssetId.clear();
}

/** Number of live records; exposed so the bound is observable in a test. */
export function registrySize(nowMs: number = Date.now()): number {
  sweep(nowMs);
  return uploadsById.size;
}

function digest(token: string): Buffer {
  // Hashed at rest so a heap dump or a stray log line cannot recover a capability.
  return createHash("sha256").update(token, "utf8").digest();
}