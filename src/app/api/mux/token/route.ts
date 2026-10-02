/**
 * `POST /api/mux/token` — mint signed playback tokens.
 *
 * A `signed` playback ID is useless without a short-lived JWT, and the signing
 * key can never reach the browser — this is the only place tokens are created.
 * Note the limitation from decision D4: because entitlement is local, these
 * tokens are a capability demonstration, not access control.
 */

import { UpstreamError } from "@/lib/mux/errors";
import { withMuxHandler } from "@/lib/mux/handler";
import { signPlaybackTokens } from "@/lib/mux/jwt";
import { createTokenRequestSchema } from "@/lib/schemas";
import type { CreateTokenResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withMuxHandler(createTokenRequestSchema, async ({ playbackId }) => {
  let tokens: CreateTokenResponse;

  try {
    tokens = await signPlaybackTokens(playbackId);
  } catch (cause) {
    // A missing signing key raises MuxSigningNotConfiguredError, which the
    // pipeline already maps to 503; only genuine signing failures become 502.
    if (cause instanceof UpstreamError) throw cause;
    throw new UpstreamError("Could not sign a playback token.", cause);
  }

  return { data: tokens };
});
