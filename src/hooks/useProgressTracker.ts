"use client";

/**
 * The progress engine (plan §6.3).
 *
 * Three things make this correct rather than merely working:
 *
 * 1. **Segments, not max position.** Watched time is a set of 10-second segment
 *    indexes. Scrubbing to the end credits one segment, not the whole video.
 * 2. **Seek detection.** A jump larger than `SEEK_THRESHOLD_SEC` between ticks
 *    credits no segments at all, so dragging the scrub bar cannot inflate
 *    progress.
 * 3. **Forced flush.** Writes are throttled to one per 5 s, but the position is
 *    flushed on pause, on `ended`, when the tab is hidden, on `pagehide` and on
 *    unmount — the four ways a learner actually leaves a lesson.
 */

import { useCallback, useEffect, useRef } from "react";

import { TICK_THROTTLE_MS, applyProgressTick, isCourseComplete } from "@/lib/domain/progress";
import {
  createLessonProgress,
  enrollmentsStore,
  progressStore,
} from "@/lib/storage/stores";
import { progressKey } from "@/lib/utils/ids";
import { useActivity } from "@/hooks/useActivity";
import { useEnrollment } from "@/hooks/useEnrollment";
import type { Course, Lesson } from "@/lib/types";

export interface UseProgressTrackerInput {
  course: Course | null;
  lesson: Lesson | null;
  /** Playhead, in seconds. */
  currentTime: number;
  /** Duration reported by the player, or `null` until metadata loads. */
  duration: number | null;
  /** `true` while the video is paused. */
  paused: boolean;
  /** Fires once per transition into the completed state. */
  onLessonCompleted?: (lessonId: string) => void;
  /** Fires the first time every lesson in the course is complete. */
  onCourseCompleted?: (completedAt: string) => void;
  /** Suspends all writes, e.g. while a signed token is still loading. */
  enabled?: boolean;
}

export interface UseProgressTrackerResult {
  /** Write immediately, ignoring the throttle. Used by pause and unmount. */
  flush: () => void;
  /** Mark the lesson complete by hand; the auto rule never undoes this. */
  setCompleted: (completed: boolean) => void;
}

/** Playhead bookkeeping: where the last write landed, and when it happened. */
interface TrackerState {
  lastTickSec: number;
  lastWriteAt: number;
}

export function useProgressTracker({
  course,
  lesson,
  currentTime,
  duration,
  paused,
  onLessonCompleted,
  onCourseCompleted,
  enabled = true,
}: UseProgressTrackerInput): UseProgressTrackerResult {
  const { creditLesson, creditSeconds } = useActivity();
  const { markCourseComplete, touchLesson } = useEnrollment(course?.id);

  const stateRef = useRef<TrackerState>({ lastTickSec: 0, lastWriteAt: 0 });

  /*
   * The playhead lives in a ref, not in `write`'s dependency list.
   *
   * `timeupdate` fires about four times a second. If `currentTime` were a
   * dependency, every tick would tear down and rebuild the throttle interval,
   * and the "flush on unmount" effect would re-arm on each one — so progress
   * would be written far more often than the throttle allows.
   */
  const live = useRef({ currentTime, duration, paused });
  live.current = { currentTime, duration, paused };

  // Callbacks are read through a ref so a parent re-render cannot re-arm timers.
  const callbacks = useRef({ onLessonCompleted, onCourseCompleted });
  callbacks.current = { onLessonCompleted, onCourseCompleted };

  /* A new lesson starts a new position: never inherit the previous playhead. */
  const lessonId = lesson?.id ?? null;
  const courseId = course?.id ?? null;

  useEffect(() => {
    stateRef.current = { lastTickSec: 0, lastWriteAt: 0 };
  }, [courseId, lessonId]);

  /** Credit the completion, then check whether that finished the whole course. */
  const settleCompletion = useCallback(
    (now: number) => {
      if (!course || !lessonId) return;

      creditLesson();
      callbacks.current.onLessonCompleted?.(lessonId);

      if (!isCourseComplete(course, progressStore.get())) return;

      const completedAt = new Date(now).toISOString();
      markCourseComplete(completedAt);
      callbacks.current.onCourseCompleted?.(completedAt);
    },
    [course, creditLesson, lessonId, markCourseComplete],
  );

  const write = useCallback(
    (ended: boolean, force: boolean) => {
      if (!course || !lesson || !enabled) return;

      /*
       * Nothing is written before the player knows its duration.
       *
       * The first tick arrives while the playhead is still 0, before metadata
       * has loaded. Writing then would overwrite the saved resume position with
       * zero — and because that re-render feeds the player's `startTime`, the
       * learner would be dropped back at the beginning of the lesson they asked
       * to resume.
       */
      if (live.current.duration === null) return;

      const state = stateRef.current;
      const now = Date.now();

      // A tick that is neither a flush, an end, nor past the throttle is dropped.
      if (!force && !ended && now - state.lastWriteAt < TICK_THROTTLE_MS) return;

      const time = ended ? Math.max(live.current.currentTime, 0) : live.current.currentTime;
      const key = progressKey(course.id, lesson.id);
      const existing = progressStore.get()[key] ?? createLessonProgress(course.id, lesson.id);

      /*
       * The real previous tick is passed through: `applyProgressTick` decides
       * whether this step was a seek and refuses to credit segments for it.
       * Rebasing the value first would erase exactly the signal it looks for.
       */
      const result = applyProgressTick({
        current: existing,
        currentTime: time,
        durationSec: live.current.duration,
        lastTickSec: state.lastTickSec,
        ended,
        now: new Date(now).toISOString(),
      });

      state.lastTickSec = time;
      state.lastWriteAt = now;

      if (!result.changed && !result.justCompleted) return;

      progressStore.set((snapshot) => ({ ...snapshot, [key]: result.next }));

      if (result.creditedSeconds > 0) creditSeconds(result.creditedSeconds);

      // Keep "resume where I left off" pointing at what is on screen.
      if (enrollmentsStore.get()[course.id]) touchLesson(lesson.id);

      if (result.justCompleted) settleCompletion(now);
    },
    [course, creditSeconds, enabled, lesson, settleCompletion, touchLesson],
  );

  /* Follow the playhead, throttled: one write per TICK_THROTTLE_MS at most. */
  useEffect(() => {
    if (!enabled || !lesson || !course) return;

    write(false, false);
    const timer = window.setInterval(() => write(false, false), TICK_THROTTLE_MS);

    return () => window.clearInterval(timer);
  }, [course, enabled, lesson, write]);

  /* Pausing is the most common reason to leave a lesson: write immediately. */
  useEffect(() => {
    if (paused) write(false, true);
  }, [paused, write]);

  /*
   * Leaving the page. `pagehide` covers a closed tab and the back/forward
   * cache; `visibilitychange` covers switching apps; unmount covers a route
   * change, which fires neither.
   */
  useEffect(() => {
    if (!enabled || !lesson) return;

    const flush = () => write(false, true);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [enabled, lesson, write]);

  const flush = useCallback(() => write(false, true), [write]);

  const setCompleted = useCallback(
    (completed: boolean) => {
      if (!course || !lesson) return;

      const key = progressKey(course.id, lesson.id);
      const now = Date.now();
      const iso = new Date(now).toISOString();

      progressStore.set((snapshot) => {
        const current = snapshot[key] ?? createLessonProgress(course.id, lesson.id);

        return {
          ...snapshot,
          [key]: {
            ...current,
            completed,
            // The manual toggle owns this state; the auto rule never undoes it.
            manuallyCompleted: true,
            completedAt: completed ? (current.completedAt ?? iso) : null,
            updatedAt: iso,
          },
        };
      });

      // Marking complete by hand should still resolve the course if it was last.
      if (completed) settleCompletion(now);
    },
    [course, lesson, settleCompletion],
  );

  return { flush, setCompleted };
}

export { TICK_THROTTLE_MS };