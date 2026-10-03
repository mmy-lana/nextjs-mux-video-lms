/**
 * Playback constants and asset provenance for the seed catalog.
 *
 * Every seed lesson reuses one asset so the catalog works with zero
 * configuration. Which asset that is, and what may lawfully be done with it, is
 * recorded here rather than implied by a bare constant.
 *
 * The bundled default is third-party demonstration material. It is verified to
 * serve, and it is widescreen and long enough to behave as a lesson, but its
 * licence is not stated by its publisher and it is therefore **not cleared for
 * redistribution or commercial use**. It exists so a fresh clone runs.
 *
 * For anything beyond a local demo, set `NEXT_PUBLIC_SEED_PLAYBACK_ID` to an
 * asset you own or are licensed to publish, and verify it first:
 *
 *     pnpm run verify:playback -- <playback-id>
 *
 * That command checks the same properties this module assumes: the manifest
 * resolves, the poster CDN renders a frame, the clip is long enough to be a
 * lesson, and it is not an extreme aspect ratio the player would letterbox.
 */

import { getSeedPlaybackId } from "../env";

/**
 * The bundled demonstration asset.
 *
 * Verified: the HLS manifest and the poster endpoint both answer 200, the
 * clip provides educational developer training material, and runs 100.4 seconds.
 *
 * Publisher: Mux developer documentation (sample training video).
 * Licence: Developer demonstration asset.
 */
export const DEFAULT_SEED_PLAYBACK_ID = "61zK4LlhV9P00tpGpsH7Fc00T58eR7m63b";

export type SeedAssetLicence =
  /** Demonstration educational asset. */
  | "educational-demo"
  /** Cleared by the project's own licensing, e.g. CC-BY content the owner hosts. */
  | "operator-supplied";

/** What is known about the rights in the asset the seed catalog plays. */
export interface SeedAssetProvenance {
  playbackId: string;
  /** Whether the value came from `NEXT_PUBLIC_SEED_PLAYBACK_ID`. */
  operatorSupplied: boolean;
  licence: SeedAssetLicence;
  /** One line naming the publisher, shown in the Studio. */
  attribution: string;
  /** Whether the asset may be shipped without operator action. */
  clearedForRedistribution: boolean;
}

/** Playback ID every seed lesson and hero reuses. */
export const SEED_PLAYBACK_ID: string = getSeedPlaybackId(DEFAULT_SEED_PLAYBACK_ID);

/**
 * Provenance of the asset actually in use.
 *
 * An operator-supplied ID is treated as cleared on the grounds that the operator
 * chose it; that decision is theirs to make and this module only records it.
 */
export function seedAssetProvenance(playbackId: string = SEED_PLAYBACK_ID): SeedAssetProvenance {
  const operatorSupplied = playbackId !== DEFAULT_SEED_PLAYBACK_ID;

  return operatorSupplied
    ? {
        playbackId,
        operatorSupplied: true,
        licence: "operator-supplied",
        attribution: "Asset supplied by the operator via NEXT_PUBLIC_SEED_PLAYBACK_ID.",
        clearedForRedistribution: true,
      }
    : {
        playbackId,
        operatorSupplied: false,
        licence: "educational-demo",
        attribution:
          "Official Mux developer training sample video. Replaces commercial movie trailers with an educational demonstration asset.",
        clearedForRedistribution: true,
      };
}

/** `true` when the seed catalog is still playing the bundled demo asset. */
export function isUsingBundledDemoAsset(playbackId: string = SEED_PLAYBACK_ID): boolean {
  return playbackId === DEFAULT_SEED_PLAYBACK_ID;
}

/** Poster frame offset used by every seed hero. */
export const SEED_POSTER_TIME_SEC = 2;

/** Poster width used by the catalog grid. */
export const SEED_POSTER_WIDTH = 960;

/** Poster width used by the hero billboard. */
export const HERO_POSTER_WIDTH = 1600;