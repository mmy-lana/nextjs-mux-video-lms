/**
 * Playback constants for the seed catalog.
 *
 * The default is Mux's own public demo asset, so the catalog is watchable with
 * zero configuration. Set `NEXT_PUBLIC_SEED_PLAYBACK_ID` to point the seed at a
 * real asset from the owner's Mux account instead.
 */

import { getSeedPlaybackId } from "../env";

/**
 * Mux's public demo playback ID.
 *
 * Verified to serve `https://stream.mux.com/{id}.m3u8` and
 * `https://image.mux.com/{id}/thumbnail.webp`, which is what every poster and
 * the player need.
 */
export const DEFAULT_SEED_PLAYBACK_ID = "DS00Spx1CV902MCtPj5WknGlR102V5HFkDe";

/** Playback ID every seed lesson and hero reuses. */
export const SEED_PLAYBACK_ID: string = getSeedPlaybackId(DEFAULT_SEED_PLAYBACK_ID);

/** Poster frame offset used by every seed hero. */
export const SEED_POSTER_TIME_SEC = 2;

/** Poster width used by the catalog grid. */
export const SEED_POSTER_WIDTH = 960;

/** Poster width used by the hero billboard. */
export const HERO_POSTER_WIDTH = 1600;
