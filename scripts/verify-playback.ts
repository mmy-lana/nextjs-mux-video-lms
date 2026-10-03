/**
 * Playback asset verification.
 *
 * Checks a candidate Mux playback ID before it is wired into the seed catalog:
 * the manifest resolves, the poster CDN renders a frame, the clip is long enough
 * to be a lesson, and the aspect ratio suits a 16:9 player.
 *
 * This exists because Mux's CDN answers 200 for assets that are useless as
 * course material. A ten-second square background loop is a valid playback ID;
 * substituting it into the catalog silently breaks progress tracking, resume and
 * the certificate flow.
 *
 * Usage:
 *   pnpm run verify:playback -- <playback-id>
 *   pnpm run verify:playback                    # checks the bundled default
 *
 * Exits non-zero when the asset is unusable, so it can gate a deployment.
 */

import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);

// Imported after the resolver is registered: the application modules use
// extensionless imports, which Node's ESM resolver does not accept on its own.
const { formatVerification, verifyPlaybackAsset } = await import(
  "../src/lib/mux/playback-verifier.ts"
);
const { DEFAULT_SEED_PLAYBACK_ID } = await import("../src/lib/seed/playback.ts");

const candidate = process.argv[2] ?? DEFAULT_SEED_PLAYBACK_ID;
const isBundled = candidate === DEFAULT_SEED_PLAYBACK_ID;

console.log(`Verifying ${isBundled ? "the bundled demo asset" : candidate}...\n`);

const result = await verifyPlaybackAsset(candidate);
console.log(formatVerification(result));

if (!result.ok) {
  console.error("\nNot usable as course material. Resolve the problems above, or pick another asset.");
  process.exit(1);
}

if (isBundled) {
  console.log(
    "\nThis is the bundled demonstration asset. It works, but its licence is not stated by its\npublisher, so it is demo-only. Set NEXT_PUBLIC_SEED_PLAYBACK_ID to an asset you own or\nare licensed to publish before deploying.",
  );
} else {
  console.log(
    "\nUsable. Set NEXT_PUBLIC_SEED_PLAYBACK_ID to this value and confirm you hold the rights to\npublish it.",
  );
}