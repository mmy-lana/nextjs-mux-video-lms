/**
 * Aggregate numbers the catalog and course pages display.
 *
 * Split out from `curriculum.ts` so the flattening/ordering primitives stay
 * free of presentation concerns.
 */

import type { CourseTotals, Course, Lesson, LessonProgress } from "../types";
import { progressKey } from "../utils/ids";
import { flattenCourse } from "./curriculum";
import { resolveDuration } from "./progress";

/** Module, lesson and duration totals for a course. */
export function courseTotals(course: Pick<Course, "modules">): CourseTotals {
  const flat = flattenCourse(course);
  let total = 0;
  let known = 0;

  for (const { lesson } of flat) {
    if (typeof lesson.durationSec === "number" && lesson.durationSec > 0) {
      total += lesson.durationSec;
      known += 1;
    }
  }

  return {
    moduleCount: course.modules.length,
    lessonCount: flat.length,
    totalDurationSec: known === flat.length && flat.length > 0 ? total : null,
    knownDurationCount: known,
  };
}

/**
 * Totals that account for durations learned at runtime.
 *
 * Seed lessons ship with `durationSec: null` (decision D5), so the displayed
 * runtime improves as the learner watches. A course counts as fully known only
 * once every lesson has a duration.
 */
export function courseTotalsWithDurations(
  course: Pick<Course, "modules">,
  durations: Record<string, number>,
): CourseTotals {
  const flat = flattenCourse(course);
  let total = 0;
  let known = 0;

  for (const { lesson } of flat) {
    const duration = resolveDuration(lesson, durations);
    if (duration !== null) {
      total += duration;
      known += 1;
    }
  }

  return {
    moduleCount: course.modules.length,
    lessonCount: flat.length,
    totalDurationSec: known === flat.length && flat.length > 0 ? total : null,
    knownDurationCount: known,
  };
}

/** Number of free-preview lessons in a course. */
export function freePreviewCount(course: Pick<Course, "modules">): number {
  return flattenCourse(course).filter((entry) => entry.lesson.isFreePreview).length;
}

/** Completed lessons and the course total, for "3 of 21 lessons" copy. */
export function lessonProgressSummary(
  course: Pick<Course, "id" | "modules">,
  progressMap: Record<string, LessonProgress>,
): { completed: number; total: number; percent: number } {
  const flat = flattenCourse(course);
  const total = flat.length;
  const completed = flat.filter(
    (entry) => progressMap[progressKey(course.id, entry.lesson.id)]?.completed ?? false,
  ).length;

  return {
    completed,
    total,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

/** The single next unfinished lesson, or `null` when the course is done. */
export function nextIncompleteLessonId(
  course: Pick<Course, "id" | "modules">,
  progressMap: Record<string, LessonProgress>,
): string | null {
  const flat = flattenCourse(course);
  const next = flat.find(
    (entry) => !(progressMap[progressKey(course.id, entry.lesson.id)]?.completed ?? false),
  );

  return next?.lesson.id ?? null;
}

/** Index of a lesson within its course, 1-based; `0` when unknown. */
export function lessonPosition(course: Pick<Course, "modules">, lessonId: string): number {
  return flattenCourse(course).find((entry) => entry.lesson.id === lessonId)?.position ?? 0;
}

/** The longest lesson in a course by known duration, for "longest lesson" copy. */
export function longestLesson(
  course: Pick<Course, "modules">,
  durations: Record<string, number>,
): { lesson: Lesson; durationSec: number } | null {
  let best: { lesson: Lesson; durationSec: number } | null = null;

  for (const { lesson } of flattenCourse(course)) {
    const duration = resolveDuration(lesson, durations);
    if (duration === null) continue;
    if (!best || duration > best.durationSec) best = { lesson, durationSec: duration };
  }

  return best;
}
