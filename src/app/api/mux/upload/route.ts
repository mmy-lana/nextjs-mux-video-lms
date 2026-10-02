/**
 * `POST /api/mux/upload` — create a Mux direct upload.
 *
 * Returns a one-time URL the browser PUTs the video file to. The Mux
 * credentials stay in this handler, so nothing it hands out is privileged
 * beyond the single upload it authorises.
 */

import { getAppUrl } from "@/lib/env";
import { UpstreamError } from "@/lib/mux/errors";
import { withMuxHandler } from "@/lib/mux/handler";
import { getMuxClient } from "@/lib/mux/server";
import { createUploadRequestSchema } from "@/lib/schemas";
import type { CreateUploadResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withMuxHandler(createUploadRequestSchema, async ({ policy }) => {
  const mux = getMuxClient();

  let upload;
  try {
    upload = await mux.video.uploads.create({
      // Mux rejects the browser's preflight unless this matches the page origin.
      cors_origin: getAppUrl(),
      new_asset_settings: { playback_policy: [policy] },
    });
  } catch (cause) {
    throw new UpstreamError("Could not create a Mux direct upload.", cause);
  }

  if (!upload.id || !upload.url) {
    throw new UpstreamError("Mux did not return an upload URL.");
  }

  const body: CreateUploadResponse = { uploadId: upload.id, url: upload.url };
  return { data: body, status: 201 };
});
