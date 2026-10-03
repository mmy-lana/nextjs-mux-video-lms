/**
 * `POST /api/mux/upload` — create a Mux direct upload.
 *
 * Returns a one-time URL the browser PUTs the video file to. The Mux
 * credentials stay in this handler, so nothing it hands out is privileged
 * beyond the single upload it authorises.
 *
 * `GET` on the same path reports whether Mux is configured. The Studio needs
 * that *before* the author clicks anything: without credentials it offers
 * text-only authoring rather than failing an upload halfway through.
 */

import { getAppUrl } from "@/lib/env";
import { isMuxSigningConfigured, isMuxServerConfigured } from "@/lib/env";
import { UpstreamError } from "@/lib/mux/errors";
import { withMuxHandler } from "@/lib/mux/handler";
import { issueDeleteCapability } from "@/lib/mux/registry";
import { getMuxClient } from "@/lib/mux/server";
import { createUploadRequestSchema } from "@/lib/schemas";
import type { CreateUploadResponse, MuxStatusResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withMuxHandler(null, async () => {
  const body: MuxStatusResponse = {
    configured: isMuxServerConfigured(),
    signing: isMuxSigningConfigured(),
  };

  return { data: body };
});

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

  /*
   * Mint the delete capability here, where this deployment is provably the
   * party that created the upload. `DELETE /api/mux/asset/[id]` will only accept
   * this token, which is what stops the endpoint from being a general-purpose
   * "delete anything in the Mux account" primitive.
   */
  const body: CreateUploadResponse = {
    uploadId: upload.id,
    url: upload.url,
    deleteToken: issueDeleteCapability(upload.id),
  };

  return { data: body, status: 201 };
});
