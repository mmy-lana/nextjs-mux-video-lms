/**
 * `GET /api/mux/upload/[id]` — poll the state of a direct upload.
 *
 * The client polls this after a successful PUT until `assetId` appears, then
 * switches to the asset endpoint. There is no webhook in this architecture
 * (decision D2), so this is the only readiness signal.
 */

import { NotFoundError, UpstreamError } from "@/lib/mux/errors";
import { withMuxParamsHandler } from "@/lib/mux/handler";
import { bindAssetToUpload } from "@/lib/mux/registry";
import { getMuxClient } from "@/lib/mux/server";
import { muxIdParamSchema } from "@/lib/schemas";
import type { UploadStatus, UploadStatusResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Statuses Mux can report for a direct upload. */
const UPLOAD_STATUSES: ReadonlySet<string> = new Set<UploadStatus>([
  "waiting",
  "asset_created",
  "errored",
  "cancelled",
  "timed_out",
]);

/** Extract a human-readable message from Mux's upload error object. */
function uploadErrorMessage(error: unknown): string | null {
  if (typeof error === "string") return error;
  if (typeof error !== "object" || error === null) return null;

  const record = error as Record<string, unknown>;
  if (typeof record.message === "string") return record.message;
  if (typeof record.type === "string") return record.type;

  return "Mux reported an upload error.";
}

export const GET = withMuxParamsHandler(muxIdParamSchema, async ({ id }) => {
  const mux = getMuxClient();

  let upload;
  try {
    upload = await mux.video.uploads.retrieve(id);
  } catch (cause) {
    if (isNotFound(cause)) throw new NotFoundError("No such Mux upload.");
    throw new UpstreamError("Could not read the Mux upload.", cause);
  }

  const status: UploadStatus = UPLOAD_STATUSES.has(upload.status)
    ? (upload.status as UploadStatus)
    : "waiting";

  /*
   * This is the first point at which Mux reveals which asset the upload became.
   * Binding it here is what lets `DELETE /api/mux/asset/[id]` tell "created by
   * this deployment" from "some other asset in the same account".
   */
  if (upload.asset_id) bindAssetToUpload(id, upload.asset_id);

  const body: UploadStatusResponse = {
    status,
    assetId: upload.asset_id ?? null,
    errorMessage:
      status === "errored" || status === "cancelled" || status === "timed_out"
        ? uploadErrorMessage(upload.error) ?? `Upload ${status}.`
        : null,
  };

  return { data: body };
});

/** `true` for Mux's 404 and the SDK's own not-found error. */
function isNotFound(cause: unknown): boolean {
  if (typeof cause !== "object" || cause === null) return false;

  const record = cause as { status?: unknown; name?: unknown };
  return record.status === 404 || record.name === "NotFoundError";
}
