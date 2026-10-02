/**
 * Lazy, validated access to environment variables.
 *
 * Nothing is read at module scope: `next build` evaluates modules in
 * environments where the Studio secrets are absent, and the app must still
 * boot with only the public variables set (decision D3). Each getter parses
 * on first call, so a missing variable becomes a runtime `503`
 * (`MUX_NOT_CONFIGURED`) rather than a build failure.
 */

import { z } from "zod";

/** Parsed server-side Mux credentials. */
export interface MuxServerEnv {
  tokenId: string;
  tokenSecret: string;
}

/** Parsed Mux signing key used for signed playback tokens. */
export interface MuxSigningEnv {
  keyId: string;
  /** PEM text — the base64 `MUX_PRIVATE_KEY` already decoded. */
  privateKey: string;
}

const muxServerSchema = z.object({
  tokenId: z.string().min(1),
  tokenSecret: z.string().min(1),
});

const muxSigningSchema = z.object({
  keyId: z.string().min(1),
  privateKey: z.string().min(1),
});

/** The subset of the env the browser is allowed to see. */
export interface PublicEnv {
  appUrl: string;
  muxEnvKey: string | null;
  seedPlaybackId: string | null;
}

/**
 * `NEXT_PUBLIC_APP_URL` without a trailing slash, defaulting to the local
 * dev origin. Used for the direct-upload `cors_origin` and the origin check.
 */
export function getAppUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL;
  if (!raw || raw.trim().length === 0) return "http://localhost:3000";

  return raw.trim().replace(/\/+$/, "");
}

/** Mux Data environment key, when the account exposes one. */
export function getMuxEnvKey(): string | null {
  const raw = process.env.NEXT_PUBLIC_MUX_ENV_KEY;
  return raw && raw.trim().length > 0 ? raw.trim() : null;
}

/**
 * Playback ID for the seed catalog.
 *
 * The committed default is Mux's public demo asset, verified to serve both
 * `stream.mux.com/{id}.m3u8` and `image.mux.com/{id}/thumbnail.webp`. Setting
 * `NEXT_PUBLIC_SEED_PLAYBACK_ID` swaps in a real asset from the owner's
 * account without touching code.
 */
export function getSeedPlaybackId(fallback: string): string {
  const raw = process.env.NEXT_PUBLIC_SEED_PLAYBACK_ID;
  return raw && raw.trim().length > 0 ? raw.trim() : fallback;
}

/** API credentials, or `null` when either variable is missing or blank. */
export function getMuxServerEnv(): MuxServerEnv | null {
  const tokenId = process.env.MUX_TOKEN_ID;
  const tokenSecret = process.env.MUX_TOKEN_SECRET;

  if (!tokenId || !tokenSecret) return null;

  const parsed = muxServerSchema.safeParse({ tokenId, tokenSecret });
  return parsed.success ? parsed.data : null;
}

/** `true` when Studio features can talk to the Mux API. */
export function isMuxServerConfigured(): boolean {
  return getMuxServerEnv() !== null;
}

/**
 * Signing credentials, or `null` when the key is incomplete.
 *
 * `MUX_PRIVATE_KEY` is the base64 PEM exactly as shown in the Mux dashboard,
 * so it is decoded here rather than at each call site.
 */
export function getMuxSigningEnv(): MuxSigningEnv | null {
  const keyId = process.env.MUX_SIGNING_KEY_ID;
  const privateKeyBase64 = process.env.MUX_PRIVATE_KEY;

  if (!keyId || !privateKeyBase64) return null;

  const parsed = muxSigningSchema.safeParse({ keyId, privateKey: privateKeyBase64 });
  if (!parsed.success) return null;

  return { keyId: parsed.data.keyId, privateKey: decodePrivateKey(parsed.data.privateKey) };
}

/** `true` when signed playback tokens can be minted. */
export function isMuxSigningConfigured(): boolean {
  return getMuxSigningEnv() !== null;
}

/**
 * Decode `MUX_PRIVATE_KEY` from base64 into PEM text.
 *
 * The dashboard hands out a base64 blob and `@mux/mux-node` signs with PEM, so
 * the conversion is required. Values pasted as raw PEM or as a `file://` URL
 * are tolerated so a misconfigured deploy still mints usable tokens.
 */
export function decodePrivateKey(value: string): string {
  const trimmed = value.trim();

  if (trimmed.startsWith("-----BEGIN")) return trimmed;

  const withoutScheme = trimmed.startsWith("file://") ? trimmed.slice("file://".length) : trimmed;

  try {
    return Buffer.from(withoutScheme, "base64").toString("ascii");
  } catch {
    return withoutScheme;
  }
}

/** Everything the browser bundle needs, as a plain serialisable object. */
export function getPublicEnv(): PublicEnv {
  return {
    appUrl: getAppUrl(),
    muxEnvKey: getMuxEnvKey(),
    seedPlaybackId: process.env.NEXT_PUBLIC_SEED_PLAYBACK_ID?.trim() || null,
  };
}
