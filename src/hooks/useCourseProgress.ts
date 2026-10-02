"use client";

/**
 * Progress across a whole course.
 *
 * Course completion is counted by lesson, not by watched seconds: many lessons
 * have no known duration until they have been played once (decision D5), and a
 * percentage that silently means "of the lessons we happen to know" would be a
 * worse answer than a count the learner can verify.
 */

import { useMemo } from "react";

import {
  completedLessonCount,
  coursePercent,
  isCourseComplete,
  lessonCount,
} from "@/lib/domain/progress";
import { flattenCourse } from "@/lib/domain/curriculum";
import { progressStore } from "@/lib/storage/stores";
import { useStore } from "@/lib/storage/useStore";
import { useHydrated } from "@/lib/storage/useHydrated";
import { progressKey } from "@/lib/utils/ids";
import type { Course, LessonProgress } from "@/lib/types";

export interface UseCourseProgressResult {
  /** This course's records, still keyed `${courseId}:${lessonId}`. */
  progressMap: Record<string, LessonProgress>;
  /** The same records keyed by lesson id, which is what the UI looks up. */
  byLesson: Record<string, LessonProgress>;
  percent: number;
  completedCount: number;
  totalCount: number;
  complete: boolean;
  hydrated: boolean;
}

const EMPTY: Record<string, LessonProgress> = {};

export function useCourseProgress(course: Course | null | undefined): UseCourseProgressResult {
  const hydrated = useHydrated();

  /*
   * The store is keyed `${courseId}:${lessonId}`, so filtering it down is a
   * plain projection. `useStore` only recomputes when the store's own snapshot
   * reference changes, so writing progress elsewhere in the app does not
   * re-render a course that has no records for it.
   */
  const progressMap = useStore(progressStore, (snapshot) => {
    if (!course) return EMPTY;

    const keys = flattenCourse(course).map((entry) => progressKey(course.id, entry.lesson.id));
    let picked: Record<string, LessonProgress> | null = null;

    for (const key of keys) {
      const value = snapshot[key];
      if (!value) continue;
      picked ??= {};
      picked[key] = value;
    }

    return picked ?? EMPTY;
  });

  const byLesson = useMemo(() => {
    if (!course) return EMPTY;

    const next: Record<string, LessonProgress> = {};
    for (const [key, value] of Object.entries(progressMap)) {
      next[progressKeyToLessonId(key, course.id)] = value;
    }
    return next;
  }, [course, progressMap]);

  return useMemo(() => {
    if (!course) {
      return {
        progressMap: EMPTY,
        byLesson: EMPTY,
        percent: 0,
        completedCount: 0,
        totalCount: 0,
        complete: false,
        hydrated,
      };
    }

    return {
      progressMap,
      byLesson,
      percent: coursePercent(course, progressMap),
      completedCount: completedLessonCount(course, progressMap),
      totalCount: lessonCount(course),
      complete: isCourseComplete(course, progressMap),
      hydrated,
    };
  }, [byLesson, course, hydrated, progressMap]);
}

/** `"<courseId>:<lessonId>"` → `"<lessonId>"`, without trusting the split count. */
function progressKeyToLessonId(key: string, courseId: string): string {
  return key.startsWith(`${courseId}:`) ? key.slice(courseId.length + 1) : key;
}