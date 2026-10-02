"use client";

/**
 * Learned lesson durations (decision D5).
 *
 * Seed lessons ship with `durationSec: null` rather than an invented number, so
 * the runtime stays "—" until the player reports the real duration from
 * `loadedmetadata`. These are cached here, per lesson, and shared across the
 * app so a course's total becomes known once the learner has watched any of it.
 */

import { useCallback, useMemo } from "react";

import { durationsStore } from "@/lib/storage/stores";
import { useStore } from "@/lib/storage/useStore";
import type { Lesson } from "@/lib/types";

/**
 * Durations are only accepted when they differ materially from what is already
 * known. A player that reports 603.21 and then 603.19 would otherwise rewrite
 * storage every single tick.
 */
export const DURATION_EPSILON_SEC = 1;

export interface UseDurationsResult {
  /** Lesson id → seconds. */
  durations: Record<string, number>;
  /**
   * Record a duration learned from the player.
   *
   * @returns `true` when the value was written, `false` when it was redundant
   *          or not a plausible duration.
   */
  learn: (lessonId: string, seconds: number) => boolean;
  /** Drop a lesson's duration (used when a lesson is deleted). */
  forget: (lessonId: string) => void;
  forgetMany: (lessonIds: readonly string[]) => void;
}

export function useDurations(): UseDurationsResult {
  const durations = useStore(durationsStore, (snapshot) => snapshot);

  const learn = useCallback((lessonId: string, seconds: number): boolean => {
    if (!Number.isFinite(seconds) || seconds <= 0) return false;

    const rounded = Math.round(seconds * 10) / 10;
    const existing = durationsStore.get()[lessonId];

    if (typeof existing === "number" && Math.abs(existing - rounded) <= DURATION_EPSILON_SEC) {
      return false;
    }

    durationsStore.set((snapshot) => ({ ...snapshot, [lessonId]: rounded }));
    return true;
  }, []);

  const forget = useCallback((lessonId: string) => {
    durationsStore.set((snapshot) => {
      if (!(lessonId in snapshot)) return snapshot;

      const { [lessonId]: _removed, ...rest } = snapshot;
      return rest;
    });
  }, []);

  const forgetMany = useCallback((lessonIds: readonly string[]) => {
    if (lessonIds.length === 0) return;

    durationsStore.set((snapshot) => {
      let next = snapshot;

      for (const lessonId of lessonIds) {
        if (!(lessonId in next)) continue;
        const { [lessonId]: _removed, ...rest } = next;
        next = rest;
      }

      return next;
    });
  }, []);

  return useMemo(
    () => ({ durations, learn, forget, forgetMany }),
    [durations, forget, forgetMany, learn],
  );
}

/** Resolve a lesson's duration from its own value first, then the cache. */
export function useLessonDuration(
  lesson: Pick<Lesson, "id" | "durationSec"> | null | undefined,
): number | null {
  const durations = useStore(durationsStore, (snapshot) => snapshot);

  return useMemo(() => {
    if (!lesson) return null;
    if (typeof lesson.durationSec === "number" && lesson.durationSec > 0) return lesson.durationSec;

    const learned = durations[lesson.id];
    return typeof learned === "number" && learned > 0 ? learned : null;
  }, [durations, lesson]);
}