/**
 * Playback asset verification.
 *
 * A playback ID is only useful if it actually resolves, is long enough to be a
 * lesson, and has an aspect ratio the player can present. Those three checks
 * are what stand between "an ID copied from a web page" and a seed catalog that
 * works, so they live here as pure, testable code rather than as a shell one-liner.
 *
 * The checks are deliberately strict about duration and aspect ratio. Mux hosts
 * background-video loops as public assets, and a ten-second square clip is a
 * perfectly valid playback ID that is useless as course material: it completes
 * before a learner can read the lesson title.
 */

/** Mux's streaming CDN. */
export const STREAM_ORIGIN = "https://stream.mux.com";

/** Mux's image CDN, used for poster frames. */
export const IMAGE_ORIGIN = "https://image.mux.com";

/**
 * A playback ID is an opaque base62 token.
 *
 * Validated before any request is made so a malformed value produces a clear
 * message instead of a confusing 404 from the CDN.
 */
export const PLAYBACK_ID_PATTERN = /^[A-Za-z0-9]{1,200}$/;

/** Shortest clip that can carry a lesson. */
export const MIN_LESSON_DURATION_SEC = 30;

/**
 * Aspect ratios a 16:9 lesson player can present without heavy letterboxing.
 *
 * Square and portrait are deliberately absent. Both are perfectly good ratios
 * for their own players, but here they put bars down each side of the video and
 * shrink the picture — which on a 360px phone is most of the screen.
 */
export const SUPPORTED_ASPECT_RATIOS = [
  { label: "16:9", value: 16 / 9 },
  { label: "4:3", value: 4 / 3 },
  { label: "21:9", value: 21 / 9 },
] as const;

/** How far an aspect ratio may drift before it counts as unsupported. */
const ASPECT_TOLERANCE = 0.02;

export interface PlaybackVerification {
  playbackId: string;
  /** `true` only when every check below passed. */
  ok: boolean;
  /** The stream manifest responded and was parsed. */
  streamAvailable: boolean;
  /** A poster frame could be generated. */
  thumbnailAvailable: boolean;
  /** Total duration in seconds, when it could be determined. */
  durationSec: number | null;
  /** Width and height of the highest rendition offered. */
  width: number | null;
  height: number | null;
  aspectRatioLabel: string | null;
  /** Human-readable reasons the asset is unusable, empty when it is usable. */
  problems: string[];
}

export interface FetchLike {
  (input: string, init?: { signal?: AbortSignal }): Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
}

/** `fetch`, with the platform default, so the module works in Node and the browser. */
const defaultFetch: FetchLike = (input, init) =>
  fetch(input, init as RequestInit) as ReturnType<FetchLike>;

/**
 * Verify a playback ID end to end.
 *
 * Checks, in order: the ID is well formed, the HLS manifest resolves, the poster
 * CDN can render a frame, the clip is long enough to be a lesson, and it is not
 * an extreme aspect ratio the player would letterbox badly.
 */
export async function verifyPlaybackAsset(
  playbackId: string,
  options: { fetchImpl?: FetchLike; signal?: AbortSignal } = {},
): Promise<PlaybackVerification> {
  const doFetch = options.fetchImpl ?? defaultFetch;
  const id = playbackId.trim();

  const result: PlaybackVerification = {
    playbackId: id,
    ok: false,
    streamAvailable: false,
    thumbnailAvailable: false,
    durationSec: null,
    width: null,
    height: null,
    aspectRatioLabel: null,
    problems: [],
  };

  if (!PLAYBACK_ID_PATTERN.test(id)) {
    result.problems.push(
      "Playback IDs are letters and digits only. This value contains other characters or is empty.",
    );
    return result;
  }

  // 1. The master manifest, which lists the renditions.
  const masterUrl = `${STREAM_ORIGIN}/${encodeURIComponent(id)}.m3u8`;
  let master: string;

  try {
    const response = await doFetch(masterUrl, { signal: options.signal });
    if (!response.ok) {
      result.problems.push(
        `The HLS manifest is not served (HTTP ${response.status}). Check the playback ID and that the asset is ready.`,
      );
      return result;
    }
    master = await response.text();
  } catch (cause) {
    result.problems.push(`The HLS manifest could not be fetched: ${describe(cause)}`);
    return result;
  }

  result.streamAvailable = true;

  // 2. The poster CDN, which is a separate service from streaming.
  try {
    const response = await doFetch(
      `${IMAGE_ORIGIN}/${encodeURIComponent(id)}/thumbnail.webp?time=2&width=640`,
      { signal: options.signal },
    );
    result.thumbnailAvailable = response.ok;

    if (!response.ok) {
      result.problems.push(
        `No poster frame could be generated (HTTP ${response.status}). Catalog cards would render a gradient fallback.`,
      );
    }
  } catch (cause) {
    result.problems.push(`The poster CDN could not be reached: ${describe(cause)}`);
  }

  // 3. Resolution of the highest rendition the manifest advertises.
  const resolution = bestResolution(master);
  result.width = resolution.width;
  result.height = resolution.height;
  result.aspectRatioLabel = resolution.label;

  // 4. Duration, which needs the rendition playlist rather than the master.
  const renditionUrl = firstRenditionUrl(master);
  if (renditionUrl === null) {
    result.problems.push("The manifest advertises no playable rendition.");
  } else {
    const duration = await readDuration(renditionUrl, doFetch, options.signal);

    if (duration === null) {
      result.problems.push("The clip duration could not be determined.");
    } else {
      result.durationSec = duration;

      if (duration < MIN_LESSON_DURATION_SEC) {
        result.problems.push(
          `The clip is ${duration.toFixed(1)}s long, which is too short to be a lesson (minimum ${MIN_LESSON_DURATION_SEC}s). Short public assets are usually background-video loops, not course material.`,
        );
      }
    }
  }

  // 5. Aspect ratio: a square or portrait clip letterboxes badly in a 16:9 player.
  if (resolution.label !== null && !isSupportedAspect(resolution.width, resolution.height)) {
    result.problems.push(
      `The asset is ${resolution.label}, which a 16:9 player will letterbox. Widescreen source material is expected.`,
    );
  }

  result.ok = result.problems.length === 0;
  return result;
}

/** Parse the `RESOLUTION=` of the highest-bandwidth rendition. */
function bestResolution(master: string): {
  width: number | null;
  height: number | null;
  label: string | null;
} {
  let best = 0;
  let width: number | null = null;
  let height: number | null = null;

  const lines = master.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!line.startsWith("#EXT-X-STREAM-INF")) continue;

    const bandwidth = Number.parseInt(readAttribute(line, "BANDWIDTH") ?? "0", 10);
    if (!Number.isFinite(bandwidth) || bandwidth <= best) continue;

    const declared = readAttribute(line, "RESOLUTION");
    if (declared === null) continue;

    const parsed = /^(\d+)x(\d+)$/.exec(declared);
    if (parsed === null) continue;

    best = bandwidth;
    width = Number.parseInt(parsed[1] as string, 10);
    height = Number.parseInt(parsed[2] as string, 10);
  }

  if (width === null || height === null) {
    return { width: null, height: null, label: null };
  }

  return { width, height, label: simplify(width / height) };
}

/** Read one `KEY=value` attribute out of an `#EXT-X` line. */
function readAttribute(line: string, key: string): string | null {
  const match = new RegExp(`${key}=(?:"([^"]*)"|([^,]*))`).exec(line);
  const value = match?.[1] ?? match?.[2];
  return value === undefined || value === "" ? null : value;
}

/** The URL of the first rendition playlist in a master manifest. */
function firstRenditionUrl(master: string): string | null {
  const lines = master.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!line.startsWith("#EXT-X-STREAM-INF")) continue;

    const next = lines[index + 1]?.trim();
    if (next && !next.startsWith("#")) return next;
  }

  return null;
}

/**
 * Sum `#EXTINF` durations from a media playlist.
 *
 * Chunked encoding puts the real durations in the manifest, so this is exact
 * rather than an estimate from `#EXT-X-TARGETDURATION`.
 */
async function readDuration(
  playlistUrl: string,
  doFetch: FetchLike,
  signal: AbortSignal | undefined,
): Promise<number | null> {
  try {
    const response = await doFetch(playlistUrl, { signal });

    // A media playlist ends with #EXT-X-ENDLIST for VOD. A live one has none,
    // and its duration genuinely is unknown.
    if (!response.ok) return null;

    const body = await response.text();
    if (!body.includes("#EXT-X-ENDLIST")) return null;

    let total = 0;

    for (const line of body.split(/\r?\n/)) {
      if (!line.startsWith("#EXTINF:")) continue;
      const seconds = Number.parseFloat(line.slice("#EXTINF:".length));
      if (Number.isFinite(seconds) && seconds > 0) total += seconds;
    }

    return total > 0 ? Number(total.toFixed(3)) : null;
  } catch {
    return null;
  }
}

/** Reduce a ratio to a human label, falling back to a rounded decimal. */
function simplify(ratio: number): string {
  for (const supported of SUPPORTED_ASPECT_RATIOS) {
    if (Math.abs(ratio - supported.value) < 0.01) return supported.label;
  }

  return `${ratio.toFixed(2)}:1`;
}

/** `true` when a clip can be shown in a 16:9 player without heavy letterboxing. */
export function isSupportedAspect(width: number | null, height: number | null): boolean {
  if (width === null || height === null || width <= 0 || height <= 0) return false;

  const ratio = width / height;

  return SUPPORTED_ASPECT_RATIOS.some(
    (supported) => Math.abs(ratio - supported.value) <= ASPECT_TOLERANCE * supported.value,
  );
}

function describe(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return String(cause);
}

/** Format a verification result as lines suitable for a terminal or a log. */
export function formatVerification(result: PlaybackVerification): string {
  const lines: string[] = [];

  lines.push(`Playback ID: ${result.playbackId || "(empty)"}`);
  lines.push(`  stream manifest: ${result.streamAvailable ? "ok" : "unavailable"}`);
  lines.push(`  poster thumbnail: ${result.thumbnailAvailable ? "ok" : "unavailable"}`);

  if (result.durationSec !== null) lines.push(`  duration: ${result.durationSec}s`);
  if (result.aspectRatioLabel !== null) {
    lines.push(`  aspect ratio: ${result.aspectRatioLabel} (${result.width}x${result.height})`);
  }

  lines.push(result.ok ? "  result: usable as course material" : "  result: unusable");

  for (const problem of result.problems) lines.push(`  - ${problem}`);

  return lines.join("\n");
}