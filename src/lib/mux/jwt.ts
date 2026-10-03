/**
 * Signed playback token minting.
 *
 * Mux Player needs three tokens for a signed asset: one for video, one for
 * poster images and one for the storyboard sprite. They are signed with the
 * account's signing key and expire after two hours; the player refreshes them
 * five minutes before expiry (plan §6.2.3).
 */

import "server-only";

import { getMuxClient, getSigningKey } from "./server";
import { MuxSigningNotConfiguredError, UpstreamError } from "./errors";

/** Token lifetime in seconds. */
export const TOKEN_TTL_SEC = 2 * 60 * 60;

/**
 * How long a freshly minted token stays valid, as a Unix timestamp.
 *
 * The client uses this to schedule its refresh 5 minutes ahead of expiry.
 */
export function tokenExpiry(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 1000) + TOKEN_TTL_SEC;
}

export interface SignedTokens {
  playback: string;
  thumbnail: string;
  storyboard: string;
  expiresAt: number;
}

/**
 * Sign video, thumbnail and storyboard tokens for one playback ID.
 *
 * @throws {MuxSigningNotConfiguredError} when the signing key is absent.
 * @throws {UpstreamError} when signing fails.
 */
export async function signPlaybackTokens(
  playbackId: string,
  nowMs: number = Date.now(),
): Promise<SignedTokens> {
  const key = getSigningKey();
  const mux = getMuxClient();

  try {
    /*
     * The lifetime is stated explicitly on every token rather than left to the
     * SDK's default.
     *
     * The client schedules its refresh from `expiresAt`, so the two must agree:
     * an SDK default that differs from `TOKEN_TTL_SEC` would refresh against a
     * lifetime the token does not have, and the player would be rejected
     * part-way through a lesson.
     *
     * `expiresIn` is the SDK's option name (seconds, or an ms-style span); it
     * is the value that becomes the `exp` claim. `type` is supplied on every
     * call so the single-token overload is selected rather than the multi-token
     * one, which would return an object instead of a string.
     */
    const expiresAt = tokenExpiry(nowMs);
    const base = { keyId: key.keyId, keySecret: key.keySecret, expiresIn: TOKEN_TTL_SEC };

    // The SDK resolves PEM text for RS256; `getSigningKey` already decoded the
    // base64 blob into PEM so nothing else needs to be unwrapped here.
    const [playback, thumbnail, storyboard] = await Promise.all([
      mux.jwt.signPlaybackId(playbackId, { ...base, type: "video" }),
      mux.jwt.signPlaybackId(playbackId, { ...base, type: "thumbnail" }),
      mux.jwt.signPlaybackId(playbackId, { ...base, type: "storyboard" }),
    ]);

    return { playback, thumbnail, storyboard, expiresAt };
  } catch (cause) {
    throw new UpstreamError("Could not sign a playback token.", cause);
  }
}

export { MuxSigningNotConfiguredError };
