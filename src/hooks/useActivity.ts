"use client";

/**
 * Study activity: the daily log, the streak it produces, and the writer the
 * progress engine calls on every tick.
 *
 * The log is the only dataset the app sheds under storage pressure, so writes
 * are small and idempotent: crediting seconds twice in one day is an addition
 * to the same record, not a new one.
 */

import { useCallback, useMemo } from "react";

import { activitySeries, streak, totalWatchedSeconds } from "@/lib/domain/streak";
import { activityStore, createActivityDay } from "@/lib/storage/stores";
import { useStore } from "@/lib/storage/useStore";
import { localDateKey } from "@/lib/utils/time";
import type { ActivityDay } from "@/lib/types";

export interface UseActivityResult {
  /** The whole log, keyed `YYYY-MM-DD`. */
  activity: Record<string, ActivityDay>;
  /** Current streak in days. */
  streakDays: number;
  activeToday: boolean;
  /** Last `days` days, oldest first, for the weekly bars. */
  series: Array<{ date: string; secondsWatched: number; lessonsCompleted: number }>;
  totalSeconds: number;
  lessonsCompleted: number;
  /** Credit watched seconds to a day; called by the progress engine. */
  creditSeconds: (seconds: number, date?: string) => void;
  /** Credit a completed lesson; called once per completion transition. */
  creditLesson: (date?: string) => void;
}

export function useActivity(windowDays = 7): UseActivityResult {
  const activity = useStore(activityStore, (snapshot) => snapshot);

  const creditSeconds = useCallback((seconds: number, date = localDateKey()) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return;

    activityStore.set((snapshot) => {
      const current = snapshot[date] ?? createActivityDay(date);

      return {
        ...snapshot,
        [date]: {
          ...current,
          secondsWatched: current.secondsWatched + seconds,
          updatedAt: new Date().toISOString(),
        },
      };
    });
  }, []);

  const creditLesson = useCallback((date = localDateKey()) => {
    activityStore.set((snapshot) => {
      const current = snapshot[date] ?? createActivityDay(date);

      return {
        ...snapshot,
        [date]: {
          ...current,
          lessonsCompleted: current.lessonsCompleted + 1,
          updatedAt: new Date().toISOString(),
        },
      };
    });
  }, []);

  return useMemo(() => {
    const today = localDateKey();
    const result = streak(activity, today);
    const series = activitySeries(activity, windowDays, today);

    return {
      activity,
      streakDays: result.days,
      activeToday: result.activeToday,
      series,
      totalSeconds: totalWatchedSeconds(activity, windowDays, today),
      lessonsCompleted: series.reduce((total, day) => total + day.lessonsCompleted, 0),
      creditSeconds,
      creditLesson,
    };
  }, [activity, creditLesson, creditSeconds, windowDays]);
}