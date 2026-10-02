/**
 * Study streak derived from the local activity log (plan §6.3).
 *
 * A day counts when the learner watched at least a minute or finished a lesson.
 * The streak is anchored on today, or on yesterday when today is still empty —
 * so an active learner never sees their streak zero out at midnight before
 * they have watched anything.
 */

import type { ActivityDay } from "../types";
import { daysBetweenLocalKeys, localDateKey, shiftLocalDateKey } from "../utils/time";

/** A day with at least this many watched seconds counts toward the streak. */
export const MIN_SECONDS_FOR_STREAK = 60;

/** `true` when an activity day qualifies for the streak. */
export function isQualifyingDay(day: ActivityDay | null | undefined): boolean {
  if (!day) return false;
  return day.secondsWatched >= MIN_SECONDS_FOR_STREAK || day.lessonsCompleted >= 1;
}

export interface StreakResult {
  /** Consecutive qualifying days ending today or yesterday. */
  days: number;
  /** The most recent qualifying day key, or `null` for an empty history. */
  lastActiveDate: string | null;
  /** `true` when the streak is alive as of `today` itself. */
  activeToday: boolean;
}

/**
 * Compute the current streak.
 *
 * `activity` is keyed by `YYYY-MM-DD` local date; unknown keys are ignored
 * rather than treated as gaps so a partially pruned log still counts.
 */
export function streak(
  activity: Record<string, ActivityDay>,
  today: string = localDateKey(),
): StreakResult {
  const ordered = Object.values(activity)
    .filter(isQualifyingDay)
    .map((day) => day.date)
    .sort();

  const lastActiveDate = ordered.at(-1) ?? null;

  if (lastActiveDate === null) {
    return { days: 0, lastActiveDate: null, activeToday: false };
  }

  const gap = daysBetweenLocalKeys(lastActiveDate, today);
  const activeToday = gap === 0;

  // Older than yesterday means the streak is broken; report history, not a streak.
  if (gap > 1) {
    return { days: 0, lastActiveDate, activeToday: false };
  }

  let days = 0;
  let cursor = activeToday ? today : lastActiveDate;

  while (isQualifyingDay(activity[cursor])) {
    days += 1;
    cursor = shiftLocalDateKey(cursor, -1);
  }

  return { days, lastActiveDate, activeToday };
}

/**
 * Minutes watched per day for the last `days` days, oldest first.
 *
 * Drives the weekly mini-bars on the streak card. Days with no record are
 * reported as `0` rather than omitted, so the bars stay evenly spaced.
 */
export function activitySeries(
  activity: Record<string, ActivityDay>,
  days = 7,
  today: string = localDateKey(),
): Array<{ date: string; secondsWatched: number; lessonsCompleted: number }> {
  return Array.from({ length: days }, (_, index) => {
    const date = shiftLocalDateKey(today, index - (days - 1));
    const day = activity[date];

    return {
      date,
      secondsWatched: isQualifyingDay(day) ? Math.max(0, day.secondsWatched) : 0,
      lessonsCompleted: day?.lessonsCompleted ?? 0,
    };
  });
}

/** Total watched seconds across the supplied days. */
export function totalWatchedSeconds(
  activity: Record<string, ActivityDay>,
  days: number,
  today: string = localDateKey(),
): number {
  return activitySeries(activity, days, today).reduce(
    (total, day) => total + day.secondsWatched,
    0,
  );
}
