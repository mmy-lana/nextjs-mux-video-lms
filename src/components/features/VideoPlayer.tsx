"use client";

/**
 * VideoPlayer.
 *
 * A thin, fully-typed skin over `@mux/mux-player-react`. The player is loaded
 * with `next/dynamic` and `ssr: false`: Mux Player is a custom element that
 * registers itself at import time, which does not survive server rendering and
 * would produce a hydration mismatch under React 19.
 *
 * Everything the learner can do here is also a visible control. The keyboard
 * shortcuts mirror buttons that are already on screen — no action is reachable
 * only by key.
 */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { MuxPlayerRefAttributes } from "@mux/mux-player-react";
import {
  Keyboard,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";

import { Button, IconButton } from "@/components/ui";
import { Skeleton } from "@/components/ui/Progress";
import { Text, VisuallyHidden } from "@/components/ui/Layout";
import { Dialog, OverlayBody, OverlayHeader } from "@/components/compound/Overlay";
import { getMuxEnvKey } from "@/lib/env";
import { ApiRequestError, createPlaybackTokens } from "@/lib/mux/client";
import { posterUrl } from "@/lib/mux/urls";
import { cn } from "@/lib/utils/cn";
import { isTextEntryTarget } from "@/lib/utils/a11y";
import { formatClock } from "@/lib/utils/time";
import { TOKEN_REFRESH_MARGIN_MS } from "@/hooks/useUploadJobs";
import { PLAYBACK_RATES, type Course, type Lesson, type PlaybackTokens } from "@/lib/types";

/*
 * `MediaError` is a *type* import here on purpose.
 *
 * Importing the class as a value would evaluate `@mux/mux-player-react` — and
 * with it the whole custom-element bundle — in any module that touches this
 * file, defeating the `next/dynamic` boundary entirely (plan §12). The codes
 * below are the standard `HTMLMediaElement` ones Mux reuses.
 */
const MEDIA_ERR_NETWORK = 2;
const MEDIA_ERR_DECODE = 3;
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;
const MEDIA_ERR_ENCRYPTED = 5;

/** Seek offsets, in seconds. */
const FORWARD_SEC = 10;
const BACKWARD_SEC = 10;
const NUDGE_SEC = 5;

const MuxPlayer = dynamic(() => import("@mux/mux-player-react"), {
  ssr: false,
  loading: () => <PlayerSkeleton />,
});

/**
 * Imperative transport controls.
 *
 * Notes need to seek, and "pause while typing" needs to pause — neither can be
 * expressed as a prop, so the player publishes these once it has an element.
 */
export interface VideoPlayerControls {
  seekTo: (seconds: number) => void;
  play: () => void;
  pause: () => void;
  toggleFullscreen: () => void;
  getCurrentTime: () => number;
}

export interface VideoPlayerProps {
  course: Pick<Course, "id" | "title">;
  lesson: Lesson;
  /** Resume position, from `resumeStart`. */
  startTimeSec: number;
  /** Stable id used as the Mux Data `viewer_user_id` (decision D8). */
  viewerUserId: string;
  /** Playback rate applied on load and persisted on change. */
  playbackRate?: number;
  autoplay?: boolean;
  muted?: boolean;
  /** `false` hides the lesson-to-lesson controls (no neighbours). */
  hasPrevious?: boolean;
  hasNext?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  onTimeUpdate?: (currentTime: number) => void;
  onDuration?: (durationSec: number) => void;
  onEnded?: () => void;
  onPlayStateChange?: (paused: boolean) => void;
  onRateChange?: (rate: number) => void;
  onVolumeChange?: (volume: number, muted: boolean) => void;
  onError?: (message: string | null) => void;
  /**
   * Receives the transport controls once the player element exists.
   *
   * A ref rather than a callback so the handle has a stable identity and the
   * parent can call it from an event handler without re-subscribing.
   */
  controlsRef?: RefObject<VideoPlayerControls | null>;
  className?: string;
}

export function PlayerSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative aspect-video w-full overflow-hidden rounded-lg border border-line bg-elevated",
        className,
      )}
    >
      <Skeleton className="absolute inset-0" shape="block" />
      <span className="sr-only">Loading the video player…</span>
    </div>
  );
}

export default function VideoPlayer(props: VideoPlayerProps) {
  const {
    course,
    lesson,
    startTimeSec,
    viewerUserId,
    playbackRate = 1,
    autoplay = false,
    muted = false,
    hasPrevious = false,
    hasNext = false,
    onPrevious,
    onNext,
    onTimeUpdate,
    onDuration,
    onEnded,
    onPlayStateChange,
    onRateChange,
    onVolumeChange,
    onError,
    controlsRef,
    className,
  } = props;

  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const [paused, setPaused] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(muted);
  const [tokens, setTokens] = useState<PlaybackTokens | null>(null);
  const [tokenState, setTokenState] = useState<"idle" | "loading" | "error">("idle");
  const [tokenMessage, setTokenMessage] = useState("");
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Bumped to re-create the element: this is what "Try again" does.
  const [reloadKey, setReloadKey] = useState(0);

  const envKey = getMuxEnvKey();
  const isSigned = lesson.playbackPolicy === "signed";

  /*
   * `next/dynamic` cannot forward a ref reliably, and the player is a custom
   * element anyway, so the instance is read from the DOM. This is also the only
   * accessor that is correct after a retry re-mounts the element.
   */
  const player = useCallback((): MuxPlayerRefAttributes | null => {
    const element = stage?.querySelector("mux-player");
    return (element as MuxPlayerRefAttributes | null) ?? null;
  }, [stage]);

  /* ---------------------------------------------------------------- */
  /* Signed playback                                                   */
  /* ---------------------------------------------------------------- */

  const fetchTokens = useCallback(async () => {
    setTokenState("loading");
    setPlaybackError(null);

    try {
      const result = await createPlaybackTokens(lesson.playbackId);
      setTokens({
        playback: result.playback,
        thumbnail: result.thumbnail,
        storyboard: result.storyboard,
      });
      setTokenState("idle");
    } catch (cause) {
      const message =
        cause instanceof ApiRequestError
          ? cause.message
          : "Could not get a playback token for this lesson.";

      setTokenState("error");
      setTokenMessage(message);
      onError?.(message);
    }
  }, [lesson.playbackId, onError]);

  useEffect(() => {
    if (!isSigned) {
      setTokens(null);
      setTokenState("idle");
      return;
    }

    void fetchTokens();
  }, [fetchTokens, isSigned]);

  /*
   * Refresh before expiry rather than after failure.
   *
   * `expiresAt` is Unix seconds; the margin leaves room for a slow start on a
   * phone. A signed asset that rejects mid-lesson is a worse experience than a
   * token request the learner never sees.
   */
  useEffect(() => {
    if (!isSigned || !tokens) return;

    const msUntilExpiry = expiryInMs(tokens.playback);
    const wait = Math.max(15_000, msUntilExpiry - TOKEN_REFRESH_MARGIN_MS);

    const timer = window.setTimeout(() => void fetchTokens(), wait);
    return () => window.clearTimeout(timer);
  }, [fetchTokens, isSigned, tokens]);

  /* ---------------------------------------------------------------- */
  /* Player events                                                     */
  /* ---------------------------------------------------------------- */

  /*
   * The resume position is read through a ref, not a closure.
   *
   * The player can mount before storage has been read — `startTimeSec` is 0 on
   * the first render and the real position arrives a tick later — and the
   * `start-time` attribute is only applied at element creation. Reading a ref
   * means whichever of the two handlers fires last uses the value that is
   * current, not the one that happened to exist at mount.
   */
  const startRef = useRef(startTimeSec);
  startRef.current = startTimeSec;
  const seekAppliedRef = useRef(false);

  /* A new lesson is a new position. */
  useEffect(() => {
    seekAppliedRef.current = false;
  }, [lesson.id]);

  const applyResumePosition = useCallback((element: MuxPlayerRefAttributes, durationSec: number) => {
    if (seekAppliedRef.current) return;

    const start = Math.min(Math.max(0, startRef.current), Math.max(0, durationSec - 1));
    if (start <= 0) return;

    seekAppliedRef.current = true;

    /*
     * Deferred by a frame on purpose.
     *
     * Mux Player applies its own `startTime` inside its `loadedmetadata`
     * handler. A listener registered later in the same dispatch runs after
     * that one, so seeking synchronously here is undone a microsecond later —
     * the lesson silently restarts from zero every time.
     */
    requestAnimationFrame(() => {
      if (element.duration > 0) element.currentTime = start;
    });
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const element = player();
    const seconds = element?.duration ?? 0;
    if (!element || !Number.isFinite(seconds) || seconds <= 0) return;

    setDuration(seconds);
    onDuration?.(seconds);

    // Resume only once the duration is known: seeking against an unknown length
    // clamps to zero and silently loses the position.
    applyResumePosition(element, seconds);
  }, [applyResumePosition, onDuration, player]);

  /*
   * Metadata may already have loaded by the time the resume position arrives
   * from storage, in which case `loadedmetadata` will not fire again.
   */
  useEffect(() => {
    if (seekAppliedRef.current || startTimeSec <= 0) return;

    const element = player();
    const seconds = element?.duration ?? 0;
    if (!element || !Number.isFinite(seconds) || seconds <= 0) return;

    applyResumePosition(element, seconds);
  }, [applyResumePosition, player, startTimeSec]);

  const handleTimeUpdate = useCallback(() => {
    const time = player()?.currentTime ?? 0;
    setCurrentTime(time);
    onTimeUpdate?.(time);
  }, [onTimeUpdate, player]);

  const handleEnded = useCallback(() => {
    setPaused(true);
    onPlayStateChange?.(true);
    onTimeUpdate?.(duration);
    onEnded?.();
  }, [duration, onEnded, onPlayStateChange, onTimeUpdate]);

  const handleError = useCallback(
    (event: CustomEvent<{ detail?: unknown }>) => {
      // Mux dispatches the `MediaError` as the event's detail, not as a
      // property on the element.
      const message = describePlaybackError(readMediaError(event.detail));
      setPlaybackError(message);
      onError?.(message);
    },
    [onError],
  );

  const handleVolumeChange = useCallback(() => {
    const element = player();
    if (!element) return;

    setIsMuted(element.muted);
    onVolumeChange?.(element.volume, element.muted);
  }, [onVolumeChange, player]);

  const handleRateChange = useCallback(() => {
    onRateChange?.(player()?.playbackRate ?? 1);
  }, [onRateChange, player]);

  /* ---------------------------------------------------------------- */
  /* Transport                                                         */
  /* ---------------------------------------------------------------- */

  const togglePlay = useCallback(() => {
    const element = player();
    if (!element) return;

    if (element.paused) void element.play();
    else element.pause();
  }, [player]);

  const seekTo = useCallback(
    (seconds: number) => {
      const element = player();
      if (!element) return;

      const max = Number.isFinite(element.duration) ? element.duration : Number.POSITIVE_INFINITY;
      const next = Math.min(Math.max(0, seconds), max);

      element.currentTime = next;
      setCurrentTime(next);
    },
    [player],
  );

  const seekBy = useCallback(
    (delta: number) => {
      const element = player();
      if (!element) return;

      seekTo((element.currentTime ?? 0) + delta);
    },
    [player, seekTo],
  );

  const toggleMute = useCallback(() => {
    const element = player();
    if (!element) return;

    element.muted = !element.muted;
    setIsMuted(element.muted);
  }, [player]);

  const toggleFullscreen = useCallback(() => {
    if (!stage) return;

    if (document.fullscreenElement) void document.exitFullscreen();
    else void stage.requestFullscreen?.();
  }, [stage]);

  const retry = useCallback(() => {
    setPlaybackError(null);
    onError?.(null);
    setReloadKey((key) => key + 1);
  }, [onError]);

  /**
   * Media Session, so the OS lock screen and hardware keys control playback.
   *
   * Absent in every browser that does not implement it, hence the guard.
   */
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

    const session = navigator.mediaSession;
    const artwork = posterUrl(lesson.playbackId, 2, 320);

    session.metadata = new MediaMetadata({
      title: lesson.title,
      artist: course.title,
      album: "Aura",
      artwork: [{ src: artwork, sizes: "320x180", type: "image/webp" }],
    });

    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ["play", () => void player()?.play()],
      ["pause", () => player()?.pause()],
      ["seekbackward", () => seekBy(-FORWARD_SEC)],
      ["seekforward", () => seekBy(FORWARD_SEC)],
    ];

    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Not every browser implements every action; skip the ones it lacks.
      }
    }

    return () => {
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null);
        } catch {
          // Same reason as above.
        }
      }
      session.metadata = null;
    };
  }, [course.title, lesson.playbackId, lesson.title, player, seekBy]);

  /* ---------------------------------------------------------------- */
  /* Keyboard                                                          */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // Never steal a keystroke from a field the learner is typing in.
      if (isTextEntryTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (!player()) return;

      switch (event.key) {
        case " ":
        case "k":
        case "K":
          event.preventDefault();
          togglePlay();
          break;
        case "j":
        case "J":
          event.preventDefault();
          seekBy(-BACKWARD_SEC);
          break;
        case "l":
        case "L":
          event.preventDefault();
          seekBy(FORWARD_SEC);
          break;
        case "ArrowLeft":
          event.preventDefault();
          seekBy(-NUDGE_SEC);
          break;
        case "ArrowRight":
          event.preventDefault();
          seekBy(NUDGE_SEC);
          break;
        case "m":
        case "M":
          event.preventDefault();
          toggleMute();
          break;
        case "f":
        case "F":
          event.preventDefault();
          toggleFullscreen();
          break;
        case "n":
        case "N":
          if (hasNext && onNext) {
            event.preventDefault();
            onNext();
          }
          break;
        case "p":
        case "P":
          if (hasPrevious && onPrevious) {
            event.preventDefault();
            onPrevious();
          }
          break;
        case "?":
          event.preventDefault();
          setShortcutsOpen(true);
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    hasNext,
    hasPrevious,
    onNext,
    onPrevious,
    player,
    seekBy,
    toggleFullscreen,
    toggleMute,
    togglePlay,
  ]);

  /* Publish the transport handle once every command it wraps exists. */
  useEffect(() => {
    if (!controlsRef) return;

    controlsRef.current = {
      seekTo,
      play: () => void player()?.play(),
      pause: () => player()?.pause(),
      toggleFullscreen,
      getCurrentTime: () => player()?.currentTime ?? 0,
    };

    return () => {
      controlsRef.current = null;
    };
  }, [controlsRef, player, seekTo, toggleFullscreen]);

  const poster = useMemo(
    () => posterUrl(lesson.playbackId, 2, 960, tokens?.thumbnail),
    [lesson.playbackId, tokens?.thumbnail],
  );

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  const tokenLoading = isSigned && tokenState === "loading";
  const tokenFailed = isSigned && tokenState === "error";

  return (
    <div className={cn("flex flex-col gap-3 bg-bg", className)}>
      <div
        ref={setStage}
        className="relative overflow-hidden rounded-lg border border-line bg-elevated"
      >
        {tokenLoading ? (
          <PlayerSkeleton />
        ) : tokenFailed ? (
          <div
            role="alert"
            className="flex aspect-video w-full flex-col items-center justify-center gap-3 p-6 text-center"
          >
            <Text tone="danger" className="font-medium">
              This lesson could not be unlocked
            </Text>
            <Text tone="muted" size="sm" className="max-w-sm">
              {tokenMessage}
            </Text>
            <Button variant="secondary" onClick={() => void fetchTokens()}>
              Try again
            </Button>
          </div>
        ) : (
          <MuxPlayer
            key={`${lesson.id}-${reloadKey}`}
            playbackId={lesson.playbackId}
            streamType="on-demand"
            tokens={tokens ?? undefined}
            poster={poster}
            accentColor="var(--color-gold)"
            metadata={{
              video_id: lesson.id,
              video_title: lesson.title,
              viewer_user_id: viewerUserId,
            }}
            envKey={envKey ?? undefined}
            startTime={Math.max(0, startTimeSec)}
            playbackRates={[...PLAYBACK_RATES]}
            playbackRate={playbackRate}
            forwardSeekOffset={FORWARD_SEC}
            backwardSeekOffset={BACKWARD_SEC}
            muted={muted}
            autoPlay={autoplay ? "muted" : false}
            playsInline
            style={{
              width: "100%",
              aspectRatio: "16 / 9",
              display: "block",
              "--controls-backdrop-color": "rgba(11, 11, 13, 0.6)",
            }}
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleEnded}
            onError={handleError}
            onVolumeChange={handleVolumeChange}
            onRateChange={handleRateChange}
            onPlay={() => {
              setPaused(false);
              onPlayStateChange?.(false);
            }}
            onPause={() => {
              setPaused(true);
              onPlayStateChange?.(true);
            }}
          />
        )}

        {playbackError && !tokenLoading && !tokenFailed ? (
          <div
            role="alert"
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bg/92 p-6 text-center backdrop-blur-sm"
          >
            <Text tone="danger" className="font-medium">
              Playback stopped
            </Text>
            <Text tone="muted" size="sm" className="max-w-sm">
              {playbackError}
            </Text>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button onClick={retry}>Try again</Button>
              {/*
                Reporting needs a backend this project deliberately does not
                have, so the control is present and disabled rather than absent
                — a missing button would read as an oversight.
              */}
              <Button variant="ghost" disabled title="Reporting is unavailable without a backend">
                Report a problem
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {/*
        Transport controls, deliberately duplicated from the player's own bar:
        they are reachable with a keyboard and a screen reader, and they are
        what makes the shortcut list in the dialog true rather than aspirational.
      */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={togglePlay}
          disabled={tokenLoading || tokenFailed}
          leftIcon={paused ? <Play className="size-4" /> : <Pause className="size-4" />}
        >
          {paused ? "Play" : "Pause"}
          <VisuallyHidden> {lesson.title}</VisuallyHidden>
        </Button>

        <IconButton
          size="sm"
          aria-label={`Back ${BACKWARD_SEC} seconds`}
          icon={<RotateCcw className="size-4" />}
          onClick={() => seekBy(-BACKWARD_SEC)}
        />
        <IconButton
          size="sm"
          aria-label={`Forward ${FORWARD_SEC} seconds`}
          icon={<RotateCw className="size-4" />}
          onClick={() => seekBy(FORWARD_SEC)}
        />

        <IconButton
          size="sm"
          aria-label={isMuted ? "Unmute" : "Mute"}
          icon={isMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          onClick={toggleMute}
        />

        {hasPrevious ? (
          <IconButton
            size="sm"
            aria-label="Previous lesson"
            icon={<SkipBack className="size-4" />}
            onClick={onPrevious}
          />
        ) : null}
        {hasNext ? (
          <IconButton
            size="sm"
            aria-label="Next lesson"
            icon={<SkipForward className="size-4" />}
            onClick={onNext}
          />
        ) : null}

        <IconButton
          size="sm"
          aria-label="Enter fullscreen"
          icon={<Maximize className="size-4" />}
          onClick={toggleFullscreen}
        />
        <IconButton
          size="sm"
          aria-label="Keyboard shortcuts"
          icon={<Keyboard className="size-4" />}
          onClick={() => setShortcutsOpen(true)}
        />

        <span className="ml-auto text-sm text-muted tabular-nums">
          {formatClock(currentTime)} / {formatClock(duration || null)}
        </span>
      </div>

      <Dialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)}>
        <OverlayHeader
          title="Keyboard shortcuts"
          description="Every shortcut has a matching button on screen."
        />
        <OverlayBody>
          <dl className="grid gap-3 text-sm">
            {SHORTCUTS.filter(([keys]) => {
              if (keys.startsWith("N")) return hasNext;
              if (keys.startsWith("P")) return hasPrevious;
              return true;
            }).map(([keys, description]) => (
              <div
                key={keys}
                className="grid grid-cols-[7rem_1fr] items-baseline gap-4 border-b border-line/60 pb-3 last:border-b-0 last:pb-0"
              >
                <dt>
                  <kbd className="rounded-sm border border-line bg-elevated px-2 py-1 font-mono text-xs text-ink">
                    {keys}
                  </kbd>
                </dt>
                <dd className="min-w-0 text-muted">{description}</dd>
              </div>
            ))}
          </dl>
        </OverlayBody>
      </Dialog>
    </div>
  );
}

const SHORTCUTS: ReadonlyArray<readonly [string, string]> = [
  ["Space / K", "Play or pause"],
  ["J / L", "Back or forward 10 seconds"],
  ["← / →", "Back or forward 5 seconds"],
  ["M", "Mute or unmute"],
  ["F", "Toggle fullscreen"],
  ["N", "Next lesson"],
  ["P", "Previous lesson"],
  ["?", "Show this list"],
];

/**
 * Turn a Mux playback error into something a learner can act on.
 *
 * The element's own message is preferred; the fallbacks name the likely cause
 * rather than echoing an internal code.
 */
export function describePlaybackError(error: MediaErrorLike | null): string {
  if (!error) return "The video stopped unexpectedly. Reloading usually clears it.";

  const code = error.code;
  const detail = error.message ?? "";

  if (code === MEDIA_ERR_SRC_NOT_SUPPORTED || /not found/i.test(detail)) {
    return "This video is no longer available. Try another lesson from the curriculum.";
  }

  if (code === MEDIA_ERR_DECODE || /decode/i.test(detail)) {
    return "This video could not be decoded. Reloading usually clears it.";
  }

  if (code === MEDIA_ERR_NETWORK || /network|failed to load/i.test(detail)) {
    return "The connection dropped. Check your network, then try again.";
  }

  if (code === MEDIA_ERR_ENCRYPTED) {
    return "This video could not be unlocked. Its playback token may have expired.";
  }

  return detail || "The video stopped unexpectedly. Reloading usually clears it.";
}

/** The parts of `MediaError` this component reads. */
export interface MediaErrorLike {
  code: number;
  message: string;
}

/**
 * Narrow an unknown event detail to the error fields we use.
 *
 * The event payload is typed as `any` upstream, so it is checked rather than
 * asserted.
 */
function readMediaError(detail: unknown): MediaErrorLike | null {
  if (typeof detail !== "object" || detail === null) return null;

  const record = detail as { code?: unknown; message?: unknown };
  if (typeof record.code !== "number" && typeof record.message !== "string") return null;

  return {
    code: typeof record.code === "number" ? record.code : 0,
    message: typeof record.message === "string" ? record.message : "",
  };
}

/** Milliseconds until a JWT expires, decoded from its own payload. */
export function expiryInMs(token: string): number {
  try {
    const payload = token.split(".")[1];
    if (!payload) return Number.POSITIVE_INFINITY;

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(normalized)) as { exp?: number };

    if (typeof claims.exp !== "number") return Number.POSITIVE_INFINITY;

    return claims.exp * 1000 - Date.now();
  } catch {
    /*
     * An unparseable token is treated as never expiring. Refreshing on a timer
     * would be harmless, but failing here would silently disable refresh
     * altogether — and a request that fails will report the real problem.
     */
    return Number.POSITIVE_INFINITY;
  }
}

export type { MuxPlayerRefAttributes };