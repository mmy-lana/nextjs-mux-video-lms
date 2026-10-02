/**
 * `GET|DELETE /api/mux/asset/[id]` — inspect or remove a Mux asset.
 *
 * The Studio uses `GET` to wait for `ready` after an upload (a freshly created
 * asset spends a while in `preparing`), and `DELETE` when a lesson is removed
 * so orphaned video does not accumulate in the owner's account.
 */

import { NotFoundError, UpstreamError } from "@/lib/mux/errors";
import { withMuxParamsHandler } from "@/lib/mux/handler";
import { getMuxClient } from "@/lib/mux/server";
import { muxIdParamSchema } from "@/lib/schemas";
import type { AssetStatus, AssetStatusResponse, DeleteAssetResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Statuses Mux can report for an asset. */
const ASSET_STATUSES: ReadonlySet<string> = new Set<AssetStatus>(["preparing", "ready", "errored"]);

/** First message from Mux's `errors` object, if any. */
function assetErrorMessage(errors: unknown): string | null {
  if (!Array.isArray(errors) || errors.length === 0) return null;

  const first = errors[0];
  if (typeof first === "string") return first;
  if (typeof first !== "object" || first === null) return "Mux reported an asset error.";

  const record = first as Record<string, unknown>;
  if (typeof record.message === "string") return record.message;
  if (typeof record.type === "string") return record.type;

  return "Mux reported an asset error.";
}

/** Round Mux's float duration to whole seconds. */
function toDurationSec(duration: number | undefined): number | null {
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) return null;
  return Math.round(duration);
}

/** `true` for Mux's 404 and the SDK's own not-found error. */
function isNotFound(cause: unknown): boolean {
  if (typeof cause !== "object" || cause === null) return false;

  const record = cause as { status?: unknown; name?: unknown };
  return record.status === 404 || record.name === "NotFoundError";
}

export const GET = withMuxParamsHandler(muxIdParamSchema, async ({ id }) => {
  const mux = getMuxClient();

  let asset;
  try {
    asset = await mux.video.assets.retrieve(id);
  } catch (cause) {
    if (isNotFound(cause)) throw new NotFoundError("No such Mux asset.");
    throw new UpstreamError("Could not read the Mux asset.", cause);
  }

  const status: AssetStatus = ASSET_STATUSES.has(asset.status)
    ? (asset.status as AssetStatus)
    : "preparing";

  const body: AssetStatusResponse = {
    status,
    // The first playback id is the one the app stores on the lesson.
    playbackId: asset.playback_ids?.[0]?.id ?? null,
    durationSec: toDurationSec(asset.duration),
    errorMessage: status === "errored" ? (assetErrorMessage(asset.errors) ?? "Mux reported an asset error.") : null,
  };

  return { data: body };
});

export const DELETE = withMuxParamsHandler(muxIdParamSchema, async ({ id }) => {
  const mux = getMuxClient();

  try {
    await mux.video.assets.delete(id);
  } catch (cause) {
    // An asset that is already gone is the desired end state, so a 404 is a
    // success here rather than an error.
    if (isNotFound(cause)) {
      const alreadyGone: DeleteAssetResponse = { deleted: true };
      return { data: alreadyGone };
    }

    throw new UpstreamError("Could not delete the Mux asset.", cause);
  }

  const body: DeleteAssetResponse = { deleted: true };
  return { data: body };
});
