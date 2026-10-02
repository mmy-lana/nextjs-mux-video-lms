"use client";

/**
 * Progress for a single lesson, plus the manual completion toggle.
 *
 * The heavy lifting (throttle, seek detection, completion rules) lives in
 * `useProgressTracker`; this hook is the read/write surface around one record.
 */

import { useCallback, useMemo } from "react";

import { setManualCompletion } from "@/lib/domain/progress";
import { createLessonProgress, progressStore } from "@/lib/storage/stores";
import { useStore } from "@/lib/storage/useStore";
import { progressKey } from "@/lib/utils/ids";
import type { LessonProgress } from "@/lib/types";

export interface UseLessonProgressResult {
  progress: LessonProgress | null;
  /** Replace the whole record — used by the progress engine. */
  write: (next: LessonProgress) => void;
  /** "Mark complete" / "Mark incomplete"; the auto rule never overrides this. */
  setCompleted: (completed: boolean) => void;
  /** Forget the record entirely. */
  reset: () => void;
  /** Ensure a record exists and return it. */
  ensure: () => LessonProgress;
}

export function useLessonProgress(
  courseId: string | null | undefined,
  lessonId: string | null | undefined,
): UseLessonProgressResult {
  const key = courseId && lessonId ? progressKey(courseId, lessonId) : null;

  const progress = useStore(progressStore, (snapshot) => (key ? (snapshot[key] ?? null) : null));

  const write = useCallback(
    (next: LessonProgress) => {
      if (!key) return;
      progressStore.set((snapshot) => ({ ...snapshot, [key]: next }));
    },
    [key],
  );

  const ensure = useCallback((): LessonProgress => {
    if (!courseId || !lessonId || !key) {
      throw new Error("useLessonProgress.ensure requires both a courseId and a lessonId");
    }

    const existing = progressStore.get()[key];
    if (existing) return existing;

    const created = createLessonProgress(courseId, lessonId);
    progressStore.set((snapshot) => ({ ...snapshot, [key]: created }));
    return created;
  }, [courseId, key, lessonId]);

  const setCompleted = useCallback(
    (completed: boolean) => {
      if (!courseId || !lessonId || !key) return;

      progressStore.set((snapshot) => {
        const current = snapshot[key] ?? createLessonProgress(courseId, lessonId);
        return { ...snapshot, [key]: setManualCompletion(current, completed, new Date().toISOString()) };
      });
    },
    [courseId, key, lessonId],
  );

  const reset = useCallback(() => {
    if (!key) return;

    progressStore.set((snapshot) => {
      if (!(key in snapshot)) return snapshot;

      const { [key]: _removed, ...rest } = snapshot;
      return rest;
    });
  }, [key]);

  return useMemo(
    () => ({ progress, write, setCompleted, reset, ensure }),
    [ensure, progress, reset, setCompleted, write],
  );
}