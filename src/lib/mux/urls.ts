/**
 * Pure Mux URL builders.
 *
 * No SDK and no env access, so these are safe in Server Components and easy to
 * unit test. `next.config.ts` registers `image.mux.com` as a remote pattern to
 * match {@link posterUrl}.
 */

/** Mux's public image CDN. */
export const MUX_IMAGE_ORIGIN = "https://image.mux.com";

/** Mux's public streaming CDN. */
export const MUX_STREAM_ORIGIN = "https://stream.mux.com";

/** Widths the poster helper accepts, matching Mux's thumbnail renditions. */
export const POSTER_WIDTHS = [320, 480, 640, 960, 1280, 1600] as const;

export type PosterWidth = (typeof POSTER_WIDTHS)[number];

const DEFAULT_POSTER_WIDTH: PosterWidth = 960;
const DEFAULT_POSTER_TIME_SEC = 2;

/**
 * Poster image for a playback ID.
 *
 * `https://image.mux.com/{id}/thumbnail.webp?time=…&width=…`
 *
 * Signed assets need `token` appended; the caller supplies it when the lesson
 * policy is `signed`.
 */
export function posterUrl(
  playbackId: string,
  timeSec: number = DEFAULT_POSTER_TIME_SEC,
  width: PosterWidth = DEFAULT_POSTER_WIDTH,
  token?: string,
): string {
  const time = Number.isFinite(timeSec) && timeSec > 0 ? timeSec : DEFAULT_POSTER_TIME_SEC;
  const safeWidth: PosterWidth = (POSTER_WIDTHS as readonly number[]).includes(width)
    ? width
    : DEFAULT_POSTER_WIDTH;

  const params = new URLSearchParams({
    time: String(time),
    width: String(safeWidth),
  });

  if (token) params.set("token", token);

  return `${MUX_IMAGE_ORIGIN}/${playbackId}/thumbnail.webp?${params.toString()}`;
}

/** HLS manifest URL for a playback ID. */
export function streamUrl(playbackId: string, token?: string): string {
  const base = `${MUX_STREAM_ORIGIN}/${playbackId}.m3u8`;
  return token ? `${base}?token=${token}` : base;
}

/** Animated GIF preview URL, used for hover previews on course cards. */
export function gifUrl(playbackId: string, timeSec = DEFAULT_POSTER_TIME_SEC, token?: string): string {
  const params = new URLSearchParams({ time: String(timeSec) });
  if (token) params.set("token", token);

  return `${MUX_IMAGE_ORIGIN}/${playbackId}/animated.gif?${params.toString()}`;
}

/** Low-resolution storyboard sprite, used by the Mux player's timeline. */
export function storyboardUrl(playbackId: string, token?: string): string {
  return token
    ? `${MUX_IMAGE_ORIGIN}/${playbackId}/storyboard.jpg?token=${token}`
    : `${MUX_IMAGE_ORIGIN}/${playbackId}/storyboard.jpg`;
}

/** DASH manifest URL; Mux serves MP4 fallback renditions from the same origin. */
export function dashUrl(playbackId: string, token?: string): string {
  const base = `${MUX_STREAM_ORIGIN}/${playbackId}.mpd`;
  return token ? `${base}?token=${token}` : base;
}
