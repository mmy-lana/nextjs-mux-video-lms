"use client";

/**
 * Enrollment for one course, plus the actions that change it.
 *
 * Enrollment is local and simulated (decision D4): it writes to storage so the
 * whole learner journey works end to end, but anyone with access to this
 * browser's storage can edit it. The UI says so rather than implying security.
 */

import { useCallback } from "react";

import { createEnrollment, enrollmentsStore } from "@/lib/storage/stores";
import { useStore } from "@/lib/storage/useStore";
import type { Course, Enrollment } from "@/lib/types";

/** The actions the UI triggers: join, leave, resume, finish. */
export interface UseEnrollmentResult {
  enrollment: Enrollment | null;
  enrolled: boolean;
  enroll: () => Enrollment | null;
  unenroll: () => void;
  /** Record the lesson the learner is currently on, for resume. */
  touchLesson: (lessonId: string) => void;
  /** Stamp the completion time once, the first time the course finishes. */
  markCourseComplete: (completedAt: string) => void;
}

export function useEnrollment(courseId: string | null | undefined): UseEnrollmentResult {
  const enrollment = useStore(enrollmentsStore, (snapshot) =>
    courseId ? (snapshot[courseId] ?? null) : null,
  );

  const write = useCallback(
    (mutate: (current: Enrollment | null) => Enrollment | null) => {
      if (!courseId) return;

      enrollmentsStore.set((snapshot) => {
        const next = mutate(snapshot[courseId] ?? null);

        if (next === null) {
          if (!(courseId in snapshot)) return snapshot;

          const { [courseId]: _removed, ...rest } = snapshot;
          return rest;
        }

        return { ...snapshot, [courseId]: next };
      });
    },
    [courseId],
  );

  const enroll = useCallback((): Enrollment | null => {
    if (!courseId) return null;

    // Enrolling twice is a no-op rather than a duplicate record.
    const existing = enrollmentsStore.get()[courseId];
    if (existing) return existing;

    const created = createEnrollment(courseId);
    write(() => created);

    return created;
  }, [courseId, write]);

  const unenroll = useCallback(() => {
    // Progress is deliberately retained: leaving a course does not erase it.
    write(() => null);
  }, [write]);

  const touchLesson = useCallback(
    (lessonId: string) => {
      write((current) =>
        current ? { ...current, lastLessonId: lessonId, updatedAt: new Date().toISOString() } : current,
      );
    },
    [write],
  );

  const markCourseComplete = useCallback(
    (completedAt: string) => {
      write((current) =>
        // One-time: re-watching must not move the date a learner earned.
        current && current.completedAt === null
          ? { ...current, completedAt, updatedAt: completedAt }
          : current,
      );
    },
    [write],
  );

  return {
    enrollment,
    enrolled: enrollment !== null,
    enroll,
    unenroll,
    touchLesson,
    markCourseComplete,
  };
}

/** Convenience wrapper for screens that already hold a `Course`. */
export function useCourseEnrollment(
  course: Pick<Course, "id"> | null | undefined,
): UseEnrollmentResult {
  return useEnrollment(course?.id);
}