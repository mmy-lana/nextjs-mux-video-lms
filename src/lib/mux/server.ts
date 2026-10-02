/**
 * Server-only Mux SDK client.
 *
 * The client is constructed lazily from the environment so `next build` succeeds
 * without credentials (decision D3) and so secrets never reach a client
 * bundle. Importing this module from a Client Component throws at call time,
 * not at import time, which keeps the failure legible.
 */

import "server-only";

import Mux from "@mux/mux-node";

import { getMuxServerEnv, getMuxSigningEnv } from "../env";
import { MuxNotConfiguredError, MuxSigningNotConfiguredError } from "./errors";

let cached: Mux | null = null;

/**
 * The Mux API client.
 *
 * @throws {MuxNotConfiguredError} when `MUX_TOKEN_ID`/`MUX_TOKEN_SECRET` are
 * absent — handlers map this to `503 MUX_NOT_CONFIGURED`.
 */
export function getMuxClient(): Mux {
  if (cached) return cached;

  const env = getMuxServerEnv();
  if (!env) throw new MuxNotConfiguredError();

  cached = new Mux({ tokenId: env.tokenId, tokenSecret: env.tokenSecret });
  return cached;
}

/** `true` when Studio features can talk to the Mux API. */
export function isMuxConfigured(): boolean {
  return getMuxServerEnv() !== null;
}

/**
 * Test seam: forget the memoised client so a new environment takes effect.
 */
export function resetMuxClient(): void {
  cached = null;
}

/**
 * The signing key, ready for `@mux/mux-node`.
 *
 * `MUX_PRIVATE_KEY` arrives base64-encoded from the Mux dashboard and is
 * decoded to PEM exactly once, here.
 *
 * @throws {MuxSigningNotConfiguredError} when the key is incomplete.
 */
export function getSigningKey(): { keyId: string; keySecret: string } {
  const env = getMuxSigningEnv();
  if (!env) throw new MuxSigningNotConfiguredError();

  return { keyId: env.keyId, keySecret: env.privateKey };
}
