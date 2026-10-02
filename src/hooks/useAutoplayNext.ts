"use client";

/**
 * The autoplay-next controller (plan §6.6).
 *
 * When a lesson ends, the next one starts after a grace period — but only when
 * autoplay is on, a next lesson exists, and that lesson is actually watchable.
 * A learner who has not enrolled must not be marched into a locked lesson by a
 * timer they did not start.
 *
 * The hook decides *what* should be shown; `AutoplayCountdown` owns the timer.
 * Two timers for one countdown would drift, and the overlay is the only thing
 * the learner can actually see.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { canAccessLesson, nextLesson, previousLesson } from "@/lib/domain/resume";
import type { Course, FlatLesson, Lesson } from "@/lib/types";

export type AutoplayReason =
  | { kind: "next"; lesson: FlatLesson }
  | { kind: "end-of-module" }
  | { kind: "end-of-course" };

export interface UseAutoplayNextInput {
  course: Course | null;
  lesson: Lesson | null;
  /** `true` once the learner has an enrollment. */
  enrolled: boolean;
  autoplayEnabled: boolean;
  /** Flips to `true` each time the current lesson ends. */
  ended: boolean;
  /** Notified when the countdown runs out or "Play now" is pressed. */
  onAdvance: (lesson: FlatLesson) => void;
}

export interface UseAutoplayNextResult {
  /** What to show over the player once the lesson has ended. */
  reason: AutoplayReason | null;
  /** True only while the autoplay countdown overlay should be visible. */
  showCountdown: boolean;
  next: FlatLesson | null;
  previous: FlatLesson | null;
  hasNext: boolean;
  hasPrevious: boolean;
  /** Dismiss the overlay. */
  dismiss: () => void;
  /** The countdown ran out, or the learner pressed "Play now". */
  advance: () => void;
}

export function useAutoplayNext({
  course,
  lesson,
  enrolled,
  autoplayEnabled,
  ended,
  onAdvance,
}: UseAutoplayNextInput): UseAutoplayNextResult {
  const [dismissed, setDismissed] = useState(false);
  const [armed, setArmed] = useState(false);

  const onAdvanceRef = useRef(onAdvance);
  onAdvanceRef.current = onAdvance;

  const next = useMemo(
    () => (course && lesson ? nextLesson(course, lesson.id) : null),
    [course, lesson],
  );

  const previous = useMemo(
    () => (course && lesson ? previousLesson(course, lesson.id) : null),
    [course, lesson],
  );

  const reason = useMemo<AutoplayReason | null>(() => {
    if (!next) return { kind: "end-of-course" };
    // A free preview is watchable without an enrollment; anything else is not.
    return canAccessLesson(next.lesson, enrolled)
      ? { kind: "next", lesson: next }
      : { kind: "end-of-module" };
  }, [enrolled, next]);

  const lessonId = lesson?.id ?? null;

  /* Dismiss on lesson change, before the effect below re-arms for the new one. */
  useEffect(() => {
    setDismissed(false);
    setArmed(false);
  }, [lessonId]);

  /* Arm on the `ended` transition only; autoplay off means no overlay at all. */
  useEffect(() => {
    if (!ended || !lesson || !autoplayEnabled) return;
    setArmed(true);
  }, [autoplayEnabled, ended, lessonId]);

  const dismiss = useCallback(() => setDismissed(true), []);

  const advance = useCallback(() => {
    const target = next;
    if (!target) return;

    setDismissed(true);
    onAdvanceRef.current(target);
  }, [next]);

  const showCountdown = armed && !dismissed && reason?.kind === "next";

  return {
    reason: ended ? reason : null,
    showCountdown,
    next,
    previous,
    hasNext: next !== null,
    hasPrevious: previous !== null,
    dismiss,
    advance,
  };
}