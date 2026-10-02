/**
 * Progress tracking math (plan §6.3).
 *
 * Every function here is pure. The engine that feeds them lives in
 * `hooks/useProgressTracker.ts`; this module owns the arithmetic so it can be
 * tested exhaustively without a DOM, a player or a store.
 */

import type { Course, Lesson, LessonProgress } from "../types";
import { progressKey } from "../utils/ids";
import { clamp, roundTo } from "../utils/math";
import { flattenCourse } from "./curriculum";

/** Watched-segment granularity. */
export const SEGMENT_SEC = 10;

/** Watched ratio at which a lesson is considered complete automatically. */
export const COMPLETE_RATIO = 0.9;

/** Minimum writes: one progress write per this many milliseconds. */
export const TICK_THROTTLE_MS = 5_000;

/** Positions below this are treated as "start from the beginning". */
export const RESUME_MIN_SEC = 5;

/** Positions within this many seconds of the end are treated as finished. */
export const RESUME_TAIL_SEC = 10;

/** A jump larger than this is a seek, not watch time. */
export const SEEK_THRESHOLD_SEC = 15;

/** Per-tick cap on credited watch seconds, so a stall cannot inflate stats. */
export const MAX_CREDITED_SEC_PER_TICK = 6;

/**
 * Sorted-unique segment insert.
 *
 * The array is kept sorted and duplicate-free so it can be compared and stored
 * as a set: repeated ticks inside one segment never change it.
 */
export function insertSegment(segments: readonly number[], segment: number): number[] {
  if (!Number.isInteger(segment) || segment < 0) return [...segments];

  const index = segments.indexOf(segment);
  if (index !== -1) return segments as number[];

  const next = [...segments, segment];
  next.sort((a, b) => a - b);
  return next;
}

/**
 * `true` when the move from `lastTick` to `currentTime` is a seek.
 *
 * Seeking must not add watched segments — otherwise dragging the scrubber to
 * the end would mark a whole lesson complete (plan §12).
 */
export function isSeek(lastTick: number, currentTime: number): boolean {
  return Math.abs(currentTime - lastTick) > SEEK_THRESHOLD_SEC;
}

/** Total segment count for a duration of `durationSec` seconds. */
export function totalSegments(durationSec: number | null | undefined): number {
  if (!durationSec || !Number.isFinite(durationSec) || durationSec <= 0) return 1;
  return Math.max(1, Math.ceil(durationSec / SEGMENT_SEC));
}

/** Fraction of the lesson covered by the watched segment set. */
export function watchedRatio(
  progress: Pick<LessonProgress, "watchedSegments"> | null | undefined,
  durationSec: number | null | undefined,
): number {
  if (!progress) return 0;
  if (!durationSec || !Number.isFinite(durationSec) || durationSec <= 0) return 0;

  return clamp(progress.watchedSegments.length / totalSegments(durationSec), 0, 1);
}

/** 0–100 completion for one lesson. Completed lessons are always 100. */
export function lessonPercent(
  progress: Pick<LessonProgress, "completed" | "watchedSegments"> | null | undefined,
  durationSec: number | null | undefined,
): number {
  if (!progress) return 0;
  if (progress.completed) return 100;

  return Math.round(clamp(watchedRatio(progress, durationSec) * 100, 0, 100));
}

/**
 * 0–100 completion for a whole course, counted by lessons.
 *
 * Lesson counting (rather than seconds) is what makes the number meaningful
 * while durations are still unknown — decision D5.
 */
export function coursePercent(
  course: Pick<Course, "id" | "modules">,
  progressMap: Record<string, LessonProgress>,
): number {
  const flat = flattenCourse(course);
  if (flat.length === 0) return 0;

  const completed = flat.filter(
    (entry) => progressMap[progressKey(course.id, entry.lesson.id)]?.completed ?? false,
  ).length;

  return Math.round((completed / flat.length) * 100);
}

/** Number of completed lessons in a course. */
export function completedLessonCount(
  course: Pick<Course, "id" | "modules">,
  progressMap: Record<string, LessonProgress>,
): number {
  return flattenCourse(course).filter(
    (entry) => progressMap[progressKey(course.id, entry.lesson.id)]?.completed ?? false,
  ).length;
}

/** Total lessons in a course. */
export function lessonCount(course: Pick<Course, "modules">): number {
  return flattenCourse(course).length;
}

/** `true` when every lesson in the course is complete. */
export function isCourseComplete(
  course: Pick<Course, "id" | "modules">,
  progressMap: Record<string, LessonProgress>,
): boolean {
  const flat = flattenCourse(course);
  if (flat.length === 0) return false;

  return flat.every((entry) => progressMap[progressKey(course.id, entry.lesson.id)]?.completed ?? false);
}

/**
 * One progress write, given a tick.
 *
 * Returns the full next state so the caller can diff it: a write is only worth
 * persisting when `changed` is `true`. Auto-completion never un-completes a
 * lesson, and a manual toggle is always respected.
 */
export interface ProgressTickInput {
  current: LessonProgress;
  currentTime: number;
  durationSec: number | null;
  lastTickSec: number;
  ended: boolean;
  now: string;
}

export interface ProgressTickResult {
  next: LessonProgress;
  changed: boolean;
  /** `true` on the transition into the completed state. */
  justCompleted: boolean;
  /** Seconds credited to today's activity, already capped. */
  creditedSeconds: number;
}

export function applyProgressTick(input: ProgressTickInput): ProgressTickResult {
  const { current, currentTime, durationSec, lastTickSec, ended, now } = input;

  const positionSec = Math.max(0, Number.isFinite(currentTime) ? currentTime : 0);
  const seeked = isSeek(lastTickSec, positionSec);

  const watchedSegments = seeked
    ? current.watchedSegments
    : insertSegment(current.watchedSegments, Math.floor(positionSec / SEGMENT_SEC));

  const elapsed = positionSec - lastTickSec;
  const creditedSeconds =
    !seeked && Number.isFinite(elapsed) ? clamp(elapsed, 0, MAX_CREDITED_SEC_PER_TICK) : 0;

  const ratio = watchedRatio({ watchedSegments }, durationSec);
  const completedByRatio = durationSec !== null && durationSec > 0 && ratio >= COMPLETE_RATIO;

  const alreadyCompleted = current.completed;
  const completes = !alreadyCompleted && (completedByRatio || ended);
  const completed = alreadyCompleted || completes;

  const next: LessonProgress = {
    ...current,
    positionSec,
    watchedSegments,
    completed,
    completedAt: alreadyCompleted ? current.completedAt : completes ? now : current.completedAt,
    updatedAt: now,
  };

  const changed =
    next.positionSec !== current.positionSec ||
    next.completed !== current.completed ||
    next.watchedSegments !== current.watchedSegments ||
    next.completedAt !== current.completedAt;

  return {
    next,
    changed,
    justCompleted: completes,
    creditedSeconds,
  };
}

/**
 * Toggle completion by hand (plan §6.3, manual toggle).
 *
 * `manuallyCompleted` is set on both transitions so the auto-completion rule
 * knows the learner owns the state.
 */
export function setManualCompletion(
  current: LessonProgress,
  completed: boolean,
  now: string,
): LessonProgress {
  return {
    ...current,
    completed,
    completedAt: completed ? (current.completedAt ?? now) : null,
    manuallyCompleted: true,
    updatedAt: now,
  };
}

/**
 * Drop segment indexes that fall outside a known duration.
 *
 * Applied on load: a lesson whose duration was recorded as 5 minutes should not
 * keep segments 20–300 from an earlier, longer source file.
 */
export function clampSegmentsToDuration(
  segments: readonly number[],
  durationSec: number | null | undefined,
): number[] {
  if (!durationSec || !Number.isFinite(durationSec) || durationSec <= 0) {
    return [...new Set(segments)].sort((a, b) => a - b);
  }

  const max = totalSegments(durationSec);
  const filtered = [...new Set(segments)].filter((segment) => segment < max);

  return filtered.sort((a, b) => a - b);
}

/** Exact watched seconds, derived from the segment set. */
export function watchedSeconds(
  progress: Pick<LessonProgress, "watchedSegments"> | null | undefined,
  durationSec: number | null | undefined,
): number {
  if (!progress) return 0;
  if (!durationSec || !Number.isFinite(durationSec) || durationSec <= 0) return 0;

  return roundTo(Math.min(progress.watchedSegments.length, totalSegments(durationSec)) * SEGMENT_SEC, 0);
}

/** Resolve the effective duration of a lesson: seed value first, then cache. */
export function resolveDuration(
  lesson: Pick<Lesson, "id" | "durationSec">,
  durations: Record<string, number>,
): number | null {
  if (typeof lesson.durationSec === "number" && lesson.durationSec > 0) return lesson.durationSec;

  const learned = durations[lesson.id];
  return typeof learned === "number" && learned > 0 ? learned : null;
}
