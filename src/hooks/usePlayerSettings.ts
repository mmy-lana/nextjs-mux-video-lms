"use client";

/**
 * Player preferences: playback rate, autoplay, volume, mute.
 *
 * Volume and mute are applied by the player itself; the hook only records them
 * so a later visit starts where the learner left off. Every setter validates,
 * because the values come straight from a media element's event payloads.
 */

import { useCallback, useMemo } from "react";

import { asPlaybackRate, settingsStore } from "@/lib/storage/stores";
import { useStore } from "@/lib/storage/useStore";
import { clamp } from "@/lib/utils/math";
import { PLAYBACK_RATES, type PlaybackRate, type PlayerSettings } from "@/lib/types";

export interface UsePlayerSettingsResult {
  settings: PlayerSettings;
  playbackRates: readonly number[];
  setPlaybackRate: (rate: number) => void;
  setAutoplayNext: (enabled: boolean) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
}

export function usePlayerSettings(): UsePlayerSettingsResult {
  const settings = useStore(settingsStore, (snapshot) => snapshot);

  const patch = useCallback((changes: Partial<PlayerSettings>) => {
    settingsStore.set((current) => ({ ...current, ...changes }));
  }, []);

  const setPlaybackRate = useCallback(
    (rate: number) => {
      patch({ playbackRate: asPlaybackRate(rate) });
    },
    [patch],
  );

  const setAutoplayNext = useCallback(
    (enabled: boolean) => {
      patch({ autoplayNext: Boolean(enabled) });
    },
    [patch],
  );

  const setVolume = useCallback(
    (volume: number) => {
      if (!Number.isFinite(volume)) return;
      patch({ volume: clamp(volume, 0, 1) });
    },
    [patch],
  );

  const setMuted = useCallback(
    (muted: boolean) => {
      patch({ muted: Boolean(muted) });
    },
    [patch],
  );

  return useMemo(
    () => ({
      settings,
      playbackRates: PLAYBACK_RATES,
      setPlaybackRate,
      setAutoplayNext,
      setVolume,
      setMuted,
    }),
    [setAutoplayNext, setMuted, setPlaybackRate, setVolume, settings],
  );
}

export type { PlaybackRate };