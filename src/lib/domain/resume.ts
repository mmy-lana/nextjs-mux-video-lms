/**
 * Resume, next-lesson and course-completion routing (plan §6.3, §6.6).
 */

import type { Course, Enrollment, FlatLesson, Lesson, LessonProgress } from "../types";
import { progressKey } from "../utils/ids";
import { flattenCourse } from "./curriculum";
import { RESUME_MIN_SEC, RESUME_TAIL_SEC } from "./progress";

/**
 * Where playback should begin for a lesson.
 *
 * Returns `0` when there is no progress, when the learner is barely started
 * (restarting is less confusing than resuming 3 s in) or when the saved
 * position is inside the final moments of the lesson.
 */
export function resumeStart(
  progress: Pick<LessonProgress, "positionSec"> | null | undefined,
  durationSec: number | null | undefined,
): number {
  if (!progress) return 0;

  const position = progress.positionSec;
  if (!Number.isFinite(position) || position <= 0) return 0;
  if (position < RESUME_MIN_SEC) return 0;

  if (durationSec !== null && durationSec !== undefined && durationSec > 0) {
    if (position > durationSec - RESUME_TAIL_SEC) return 0;
  }

  return position;
}

/** The following lesson in curriculum order, or `null` at the end. */
export function nextLesson(
  course: Pick<Course, "modules">,
  lessonId: string,
): FlatLesson | null {
  const flat = flattenCourse(course);
  const index = flat.findIndex((entry) => entry.lesson.id === lessonId);
  if (index === -1) return null;

  return flat[index + 1] ?? null;
}

/** The preceding lesson in curriculum order, or `null` at the start. */
export function previousLesson(
  course: Pick<Course, "modules">,
  lessonId: string,
): FlatLesson | null {
  const flat = flattenCourse(course);
  const index = flat.findIndex((entry) => entry.lesson.id === lessonId);
  if (index <= 0) return null;

  return flat[index - 1] ?? null;
}

/** The first lesson of a course, or `null` when it has none. */
export function firstLesson(course: Pick<Course, "modules">): FlatLesson | null {
  return flattenCourse(course)[0] ?? null;
}

/**
 * Where `/learn/[slug]` should send the learner.
 *
 * Preference order: the last lesson they watched if it is not finished, then
 * the first incomplete lesson, then the very first lesson. An empty course
 * yields `null` so the page can render its EmptyState.
 */
export function resolveResumeLesson(
  course: Pick<Course, "id" | "modules">,
  progressMap: Record<string, LessonProgress>,
  enrollment: Pick<Enrollment, "lastLessonId" | "completedAt"> | null | undefined,
): FlatLesson | null {
  const flat = flattenCourse(course);
  if (flat.length === 0) return null;

  const isComplete = (lesson: Lesson): boolean =>
    progressMap[progressKey(course.id, lesson.id)]?.completed ?? false;

  if (enrollment?.lastLessonId) {
    const last = flat.find((entry) => entry.lesson.id === enrollment.lastLessonId);
    if (last && !isComplete(last.lesson)) return last;
  }

  const firstIncomplete = flat.find((entry) => !isComplete(entry.lesson));
  if (firstIncomplete) return firstIncomplete;

  return flat[0];
}

/**
 * Can the learner watch this lesson right now?
 *
 * Free previews are open to everyone; everything else needs an enrollment.
 */
export function canAccessLesson(
  lesson: Pick<Lesson, "isFreePreview">,
  enrolled: boolean,
): boolean {
  return lesson.isFreePreview || enrolled;
}

/**
 * The first lesson that needs an enrollment but is not free, used to build an
 * honest "what happens next" line on the course detail page.
 */
export function firstLockedLesson(
  course: Pick<Course, "modules">,
  enrolled: boolean,
): FlatLesson | null {
  if (enrolled) return null;
  return flattenCourse(course).find((entry) => !entry.lesson.isFreePreview) ?? null;
}
