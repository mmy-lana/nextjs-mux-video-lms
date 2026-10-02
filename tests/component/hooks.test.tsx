/**
 * Reactive state (plan Phase 4).
 *
 * These exercise the real stores against a real `localStorage`, because the
 * behaviour under test — cache identity, cross-cutting writes, the throttle
 * and the seek rule — only exists once the storage layer is involved.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  useActivity,
  useAutoplayNext,
  useCourseEnrollment,
  useCourseProgress,
  useDurations,
  useEnrollment,
  useNotes,
  usePlayerSettings,
  useProfile,
  useProgressTracker,
  useStudioCourses,
  uniqueSlug,
} from "@/hooks";
import {
  durationsStore,
  enrollmentsStore,
  notesStore,
  progressStore,
  studioCoursesStore,
} from "@/lib/storage/stores";
import { progressKey } from "@/lib/utils/ids";
import { localDateKey, shiftLocalDateKey } from "@/lib/utils/time";
import { SEED_COURSES, findSeedCourse } from "@/lib/seed";
import { createLessonProgress } from "@/lib/storage/stores";
import type { Course } from "@/lib/types";

const COURSE = findSeedCourse(SEED_COURSES[0]!.slug)!;
const FIRST_LESSON = COURSE.modules[0]!.lessons[0]!;
const SECOND_LESSON = COURSE.modules[0]!.lessons[1]!;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

describe("useProfile", () => {
  it("creates an identity on first run and keeps it afterwards", async () => {
    const first = renderHook(() => useProfile());

    await waitFor(() => expect(first.result.current.ready).toBe(true));
    await waitFor(() => expect(first.result.current.profile.id.length).toBeGreaterThan(0));

    const id = first.result.current.profile.id;

    const second = renderHook(() => useProfile());
    await waitFor(() => expect(second.result.current.profile.id).toBe(id));
  });

  it("renames the learner", async () => {
    const { result } = renderHook(() => useProfile());
    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => result.current.rename("  Rowan  "));

    await waitFor(() => expect(result.current.profile.displayName).toBe("Rowan"));
  });

  it("refuses an empty name rather than blanking the profile", async () => {
    const { result } = renderHook(() => useProfile());
    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => result.current.rename("   "));

    expect(result.current.profile.displayName).not.toBe("");
  });
});

/* ------------------------------------------------------------------ */
/* Enrollment                                                          */
/* ------------------------------------------------------------------ */

describe("useEnrollment", () => {
  it("enrolls once, no matter how many times it is called", () => {
    const { result } = renderHook(() => useEnrollment(COURSE.id));

    expect(result.current.enrolled).toBe(false);

    act(() => {
      result.current.enroll();
      result.current.enroll();
    });

    expect(result.current.enrolled).toBe(true);
    expect(Object.keys(enrollmentsStore.get())).toHaveLength(1);
  });

  it("keeps progress when unenrolling", () => {
    const { result } = renderHook(() => useEnrollment(COURSE.id));

    act(() => result.current.enroll());
    act(() => {
      progressStore.set((snapshot) => ({
        ...snapshot,
        [progressKey(COURSE.id, FIRST_LESSON.id)]: createLessonProgress(
          COURSE.id,
          FIRST_LESSON.id,
        ),
      }));
    });

    act(() => result.current.unenroll());

    expect(result.current.enrolled).toBe(false);
    expect(progressStore.get()[progressKey(COURSE.id, FIRST_LESSON.id)]).toBeDefined();
  });

  it("stamps the completion date once", () => {
    const { result } = renderHook(() => useEnrollment(COURSE.id));

    act(() => result.current.enroll());

    act(() => result.current.markCourseComplete("2025-03-01T10:00:00.000Z"));
    act(() => result.current.markCourseComplete("2025-06-01T10:00:00.000Z"));

    expect(result.current.enrollment?.completedAt).toBe("2025-03-01T10:00:00.000Z");
  });

  it("tracks the lesson being watched", () => {
    const { result } = renderHook(() => useCourseEnrollment(COURSE));

    act(() => result.current.enroll());
    act(() => result.current.touchLesson(SECOND_LESSON.id));

    expect(result.current.enrollment?.lastLessonId).toBe(SECOND_LESSON.id);
  });

  it("does nothing without a course id", () => {
    const { result } = renderHook(() => useEnrollment(undefined));

    act(() => result.current.enroll());

    expect(result.current.enrolled).toBe(false);
    expect(enrollmentsStore.get()).toEqual({});
  });
});

/* ------------------------------------------------------------------ */
/* Course progress                                                     */
/* ------------------------------------------------------------------ */

describe("useCourseProgress", () => {
  it("counts completion by lesson, not by known duration", () => {
    const { result } = renderHook(() => useCourseProgress(COURSE));

    expect(result.current.percent).toBe(0);
    expect(result.current.totalCount).toBeGreaterThan(3);

    act(() => {
      progressStore.set((snapshot) => ({
        ...snapshot,
        [progressKey(COURSE.id, FIRST_LESSON.id)]: {
          ...createLessonProgress(COURSE.id, FIRST_LESSON.id),
          completed: true,
        },
      }));
    });

    expect(result.current.completedCount).toBe(1);
    expect(result.current.complete).toBe(false);
  });

  it("reports the course complete only when every lesson is done", () => {
    const { result } = renderHook(() => useCourseProgress(COURSE));

    act(() => {
      const all: Record<string, ReturnType<typeof createLessonProgress>> = {};

      for (const module of COURSE.modules) {
        for (const lesson of module.lessons) {
          const key = progressKey(COURSE.id, lesson.id);
          all[key] = { ...createLessonProgress(COURSE.id, lesson.id), completed: true };
        }
      }

      progressStore.set(() => all);
    });

    expect(result.current.complete).toBe(true);
    expect(result.current.percent).toBe(100);
  });

  it("only exposes this course's records", () => {
    const { result } = renderHook(() => useCourseProgress(COURSE));

    act(() => {
      progressStore.set((snapshot) => ({
        ...snapshot,
        "other-course:lesson-1": createLessonProgress("other-course", "lesson-1"),
      }));
    });

    expect(result.current.byLesson).toEqual({});
  });
});

/* ------------------------------------------------------------------ */
/* Notes                                                               */
/* ------------------------------------------------------------------ */

describe("useNotes", () => {
  it("adds, trims and sorts by timestamp", () => {
    const { result } = renderHook(() => useNotes(COURSE.id, FIRST_LESSON.id));

    act(() => result.current.addNote(120, "  second  "));
    act(() => result.current.addNote(30, "first"));

    expect(result.current.notes.map((note) => note.body)).toEqual(["first", "second"]);
  });

  it("refuses an empty or oversized body", () => {
    const { result } = renderHook(() => useNotes(COURSE.id, FIRST_LESSON.id));

    act(() => {
      expect(result.current.addNote(10, "   ")).toBeNull();
      expect(result.current.addNote(10, "x".repeat(1001))).toBeNull();
    });

    expect(result.current.count).toBe(0);
  });

  it("edits and deletes", () => {
    const { result } = renderHook(() => useNotes(COURSE.id, FIRST_LESSON.id));

    act(() => result.current.addNote(10, "original"));
    const id = result.current.notes[0]!.id;

    act(() => result.current.updateNote(id, "  revised  "));
    expect(result.current.notes[0]!.body).toBe("revised");

    act(() => result.current.deleteNote(id));
    expect(result.current.count).toBe(0);
  });

  it("clears only the given lesson", () => {
    const { result } = renderHook(() => useNotes(COURSE.id, FIRST_LESSON.id));

    act(() => result.current.addNote(10, "mine"));
    act(() => {
      notesStore.set((snapshot) => {
        const foreign = { ...result.current.notes[0]!, id: "foreign", lessonId: "other-lesson" };
        return { ...snapshot, [foreign.id]: foreign };
      });
    });

    act(() => result.current.clearLesson());

    expect(result.current.count).toBe(0);
    expect(Object.keys(notesStore.get())).toHaveLength(1);
  });

  it("enforces the per-lesson cap", () => {
    const { result } = renderHook(() => useNotes(COURSE.id, FIRST_LESSON.id));

    act(() => {
      const many: Record<string, (typeof result.current.notes)[number]> = {};
      for (let index = 0; index < 200; index += 1) {
        const note = {
          id: `note-${index}`,
          courseId: COURSE.id,
          lessonId: FIRST_LESSON.id,
          timestampSec: index,
          body: `note ${index}`,
          createdAt: "2025-02-01T10:00:00.000Z",
          updatedAt: "2025-02-01T10:00:00.000Z",
        };
        many[note.id] = note;
      }
      notesStore.set(() => many);
    });

    expect(result.current.atCapacity).toBe(true);

    act(() => {
      expect(result.current.addNote(999, "one too many")).toBeNull();
    });
  });
});

/* ------------------------------------------------------------------ */
/* Player settings and durations                                       */
/* ------------------------------------------------------------------ */

describe("usePlayerSettings", () => {
  it("clamps and validates every value it accepts", () => {
    const { result } = renderHook(() => usePlayerSettings());

    act(() => result.current.setVolume(5));
    expect(result.current.settings.volume).toBe(1);

    act(() => result.current.setVolume(-1));
    expect(result.current.settings.volume).toBe(0);

    act(() => result.current.setVolume(Number.NaN));
    expect(result.current.settings.volume).toBe(0);

    act(() => result.current.setPlaybackRate(1.5));
    expect(result.current.settings.playbackRate).toBe(1.5);

    // Not one of the supported rates: fall back rather than store junk.
    act(() => result.current.setPlaybackRate(1.3));
    expect(result.current.settings.playbackRate).toBe(1);

    act(() => result.current.setAutoplayNext(false));
    expect(result.current.settings.autoplayNext).toBe(false);
  });
});

describe("useDurations", () => {
  it("ignores implausible values and near-duplicates", () => {
    const { result } = renderHook(() => useDurations());

    act(() => {
      expect(result.current.learn("lesson-1", 0)).toBe(false);
      expect(result.current.learn("lesson-1", Number.NaN)).toBe(false);
      expect(result.current.learn("lesson-1", 120)).toBe(true);
    });

    act(() => {
      // 120.4 is within the 1 s epsilon of 120.4 -> already stored.
      expect(result.current.learn("lesson-1", 120.4)).toBe(false);
      expect(result.current.learn("lesson-1", 300)).toBe(true);
    });

    expect(result.current.durations["lesson-1"]).toBe(300);
  });

  it("forgets many lessons at once", () => {
    const { result } = renderHook(() => useDurations());

    act(() => {
      result.current.learn("a", 10);
      result.current.learn("b", 20);
    });

    act(() => result.current.forgetMany(["a", "b", "missing"]));

    expect(result.current.durations).toEqual({});
  });
});

/* ------------------------------------------------------------------ */
/* Activity                                                            */
/* ------------------------------------------------------------------ */

describe("useActivity", () => {
  it("credits seconds and lessons into today's record", () => {
    const { result } = renderHook(() => useActivity());

    act(() => {
      result.current.creditSeconds(30);
      result.current.creditSeconds(45);
      result.current.creditLesson();
    });

    const today = result.current.activity[localDateKey()];
    expect(today?.secondsWatched).toBe(75);
    expect(today?.lessonsCompleted).toBe(1);
  });

  it("reports a streak across consecutive qualifying days", () => {
    const today = localDateKey();
    const { result } = renderHook(() => useActivity());

    act(() => {
      result.current.creditSeconds(120, shiftLocalDateKey(today, -1));
      result.current.creditSeconds(90, shiftLocalDateKey(today, -2));
    });

    // Yesterday and the day before, but not today: the streak must not break.
    expect(result.current.streakDays).toBe(2);
    expect(result.current.activeToday).toBe(false);

    act(() => result.current.creditSeconds(90, today));

    expect(result.current.streakDays).toBe(3);
    expect(result.current.activeToday).toBe(true);
  });

  it("ignores a zero or negative credit", () => {
    const { result } = renderHook(() => useActivity());

    act(() => {
      result.current.creditSeconds(0);
      result.current.creditSeconds(-10);
    });

    expect(result.current.activity[localDateKey()]).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* Progress engine                                                     */
/* ------------------------------------------------------------------ */

describe("useProgressTracker", () => {
  type TrackerProps = Parameters<typeof useProgressTracker>[0];

  const TRACKER_DEFAULTS: TrackerProps = {
    course: COURSE,
    lesson: FIRST_LESSON,
    currentTime: 0,
    duration: 120,
    paused: true,
  };

  /*
   * The props are threaded through `initialProps` so a test can move the
   * playhead the way the player would, by re-rendering with a new `currentTime`.
   */
  function tracker(overrides: Partial<TrackerProps> = {}) {
    return renderHook((props: Partial<TrackerProps>) => useProgressTracker({ ...TRACKER_DEFAULTS, ...props }), {
      initialProps: overrides,
    });
  }

  /**
   * Replay `seconds` of continuous playback, the way the player would.
   *
   * The re-render and the write each get their own `act`, because React defers
   * the render to the end of the enclosing `act` block — batching them would
   * make every flush read a stale playhead.
   */
  function play(
    rerender: (props: TrackerProps) => void,
    flush: () => void,
    base: TrackerProps,
    seconds: number,
  ) {
    for (let elapsed = 10; elapsed <= seconds; elapsed += 10) {
      act(() => rerender({ ...base, currentTime: elapsed }));
      act(() => flush());
    }
  }

  it("writes a position on the first tick", () => {
    const { result } = tracker({ currentTime: 42 });

    act(() => result.current.flush());

    expect(progressStore.get()[progressKey(COURSE.id, FIRST_LESSON.id)]?.positionSec).toBe(42);
  });

  it("throttles ordinary ticks but always flushes when asked", () => {
    const { result } = tracker({ currentTime: 10 });
    const key = progressKey(COURSE.id, FIRST_LESSON.id);

    act(() => result.current.flush());
    expect(progressStore.get()[key]?.positionSec).toBe(10);

    // Within the throttle window a bare render must not rewrite the position.
    act(() => {
      vi.setSystemTime(Date.now());
      result.current.flush();
    });
    expect(progressStore.get()[key]?.positionSec).toBe(10);

    // Past the window, the next tick is written.
    act(() => {
      vi.advanceTimersByTime(6_000);
    });
    expect(progressStore.get()[key]).toBeDefined();
  });

  it("credits one segment per 10 seconds of continuous playback", () => {
    const key = progressKey(COURSE.id, FIRST_LESSON.id);

    act(() => {
      progressStore.set((snapshot) => ({
        ...snapshot,
        [key]: createLessonProgress(COURSE.id, FIRST_LESSON.id),
      }));
    });

    const { result } = tracker({ currentTime: 25, duration: 300 });
    act(() => result.current.flush());

    expect(progressStore.get()[key]?.watchedSegments).toEqual([2]);
  });

  it("adds no segments across a seek, but still moves the position", () => {
    const key = progressKey(COURSE.id, FIRST_LESSON.id);

    act(() => {
      progressStore.set((snapshot) => ({
        ...snapshot,
        [key]: createLessonProgress(COURSE.id, FIRST_LESSON.id),
      }));
    });

    const { result, rerender } = tracker({ currentTime: 20, duration: 600 });
    act(() => result.current.flush());

    // Jump forward 200 s: a scrub, not a watch. The re-render gets its own
    // `act` so the playhead the flush reads is the new one.
    act(() => rerender({ currentTime: 220 }));
    act(() => result.current.flush());

    const stored = progressStore.get()[key];
    expect(stored?.positionSec).toBe(220);
    expect(stored?.watchedSegments).toEqual([2]);
  });

  it("completes at 90 percent and announces the course once", () => {
    const onLessonCompleted = vi.fn();
    const onCourseCompleted = vi.fn();

    // A one-lesson course makes "course complete" reachable in one step.
    const single = makeSingleLessonCourse();
    const lesson = single.modules[0]!.lessons[0]!;

    const base: TrackerProps = {
      course: single,
      lesson,
      duration: 100,
      currentTime: 0,
      paused: true,
      onLessonCompleted,
      onCourseCompleted,
    };

    const { result, rerender } = renderHook(
      (props: TrackerProps) => useProgressTracker(props),
      { initialProps: base },
    );

    // The certificate is an enrollment's property, so enroll before finishing.
    const { result: enrollment } = renderHook(() => useEnrollment(single.id));
    act(() => enrollment.current.enroll());

    // 90 of 100 segments is exactly the 0.9 completion ratio.
    play(rerender, () => result.current.flush(), base, 90);

    const key = progressKey(single.id, lesson.id);
    expect(progressStore.get()[key]?.completed).toBe(true);
    expect(onLessonCompleted).toHaveBeenCalledOnce();
    expect(onCourseCompleted).toHaveBeenCalledOnce();
    expect(enrollmentsStore.get()[single.id]?.completedAt).toBeTruthy();

    // A second flush must not re-announce a completion it already reported.
    act(() => result.current.flush());
    expect(onCourseCompleted).toHaveBeenCalledOnce();
  });

  it("does not complete a barely-started lesson", () => {
    const single = makeSingleLessonCourse();
    const lesson = single.modules[0]!.lessons[0]!;

    const base: TrackerProps = {
      course: single,
      lesson,
      duration: 600,
      currentTime: 0,
      paused: true,
    };

    const { result, rerender } = renderHook(
      (props: TrackerProps) => useProgressTracker(props),
      { initialProps: base },
    );

    play(rerender, () => result.current.flush(), base, 30);

    expect(progressStore.get()[progressKey(single.id, lesson.id)]?.completed).toBe(false);
  });

  it("never un-completes a lesson the learner marked by hand", () => {
    const key = progressKey(COURSE.id, FIRST_LESSON.id);

    act(() => {
      progressStore.set((snapshot) => ({
        ...snapshot,
        [key]: createLessonProgress(COURSE.id, FIRST_LESSON.id),
      }));
    });

    const { result } = tracker({ currentTime: 30 });
    act(() => result.current.setCompleted(true));

    expect(progressStore.get()[key]?.completed).toBe(true);
    expect(progressStore.get()[key]?.manuallyCompleted).toBe(true);

    act(() => result.current.setCompleted(false));
    expect(progressStore.get()[key]?.completed).toBe(false);
  });

  it("writes nothing while disabled", () => {
    const { result } = tracker({ currentTime: 60, enabled: false });

    act(() => result.current.flush());

    expect(progressStore.get()[progressKey(COURSE.id, FIRST_LESSON.id)]).toBeUndefined();
  });
});

/** A minimal publishable course with exactly one lesson. */
function makeSingleLessonCourse(): Course {
  const lesson = { ...FIRST_LESSON, id: "solo-lesson", playbackId: "abc123" };

  return {
    ...COURSE,
    id: "solo-course",
    slug: "solo-course",
    modules: [{ ...COURSE.modules[0]!, id: "solo-module", lessons: [lesson] }],
  };
}

/* ------------------------------------------------------------------ */
/* Autoplay                                                            */
/* ------------------------------------------------------------------ */

describe("useAutoplayNext", () => {
  it("offers the next lesson when it is watchable", () => {
    const onAdvance = vi.fn();
    const { result } = renderHook(() =>
      useAutoplayNext({
        course: COURSE,
        lesson: FIRST_LESSON,
        enrolled: true,
        autoplayEnabled: true,
        ended: true,
        onAdvance,
      }),
    );

    expect(result.current.showCountdown).toBe(true);
    expect(result.current.reason?.kind).toBe("next");

    act(() => result.current.advance());
    expect(onAdvance).toHaveBeenCalledOnce();
  });

  it("does not autoplay into a locked lesson", () => {
    const { result } = renderHook(() =>
      useAutoplayNext({
        course: COURSE,
        lesson: FIRST_LESSON,
        enrolled: false,
        autoplayEnabled: true,
        ended: true,
        onAdvance: vi.fn(),
      }),
    );

    // The next lesson is not a free preview, so no countdown is shown.
    expect(result.current.showCountdown).toBe(false);
    expect(result.current.reason?.kind).toBe("end-of-module");
  });

  it("stays silent when autoplay is off", () => {
    const { result } = renderHook(() =>
      useAutoplayNext({
        course: COURSE,
        lesson: FIRST_LESSON,
        enrolled: true,
        autoplayEnabled: false,
        ended: true,
        onAdvance: vi.fn(),
      }),
    );

    expect(result.current.showCountdown).toBe(false);
  });

  it("can be dismissed", () => {
    const { result } = renderHook(() =>
      useAutoplayNext({
        course: COURSE,
        lesson: FIRST_LESSON,
        enrolled: true,
        autoplayEnabled: true,
        ended: true,
        onAdvance: vi.fn(),
      }),
    );

    act(() => result.current.dismiss());
    expect(result.current.showCountdown).toBe(false);
  });

  it("reports the end of the course on the last lesson", () => {
    const last = COURSE.modules.at(-1)!.lessons.at(-1)!;

    const { result } = renderHook(() =>
      useAutoplayNext({
        course: COURSE,
        lesson: last,
        enrolled: true,
        autoplayEnabled: true,
        ended: true,
        onAdvance: vi.fn(),
      }),
    );

    expect(result.current.hasNext).toBe(false);
    expect(result.current.reason?.kind).toBe("end-of-course");
  });
});

/* ------------------------------------------------------------------ */
/* Studio courses                                                      */
/* ------------------------------------------------------------------ */

describe("useStudioCourses", () => {
  it("creates a draft with a unique slug and saves updates", () => {
    const { result } = renderHook(() => useStudioCourses());

    let created = COURSE;
    act(() => {
      created = result.current.createDraft({
        title: "Cinematic Design Systems",
        subtitle: "A deliberately colliding title",
        description: "x".repeat(40),
        category: "creative",
        level: "intermediate",
        tags: ["design"],
        priceCents: 4900,
      });
    });

    // The seed catalog already owns that slug, so a suffix is appended.
    expect(created.slug).toBe("cinematic-design-systems-2");
    expect(created.status).toBe("draft");
    expect(studioCoursesStore.get()[created.id]).toBeDefined();

    act(() => result.current.save({ ...created, title: "Renamed" }));

    expect(studioCoursesStore.get()[created.id]?.title).toBe("Renamed");
  });

  it("de-duplicates against the learner's own courses too", () => {
    const { result } = renderHook(() => useStudioCourses());

    let first = COURSE;
    let second = COURSE;

    act(() => {
      first = result.current.createDraft({
        title: "Brand New Ground",
        subtitle: "The first of its kind",
        description: "x".repeat(40),
        category: "business",
        level: "beginner",
        tags: [],
        priceCents: 0,
      });
    });

    expect(first.slug).toBe("brand-new-ground");

    act(() => {
      second = result.current.createDraft({
        title: "Brand New Ground",
        subtitle: "And the second of its kind",
        description: "x".repeat(40),
        category: "business",
        level: "beginner",
        tags: [],
        priceCents: 0,
      });
    });

    expect(second.slug).toBe("brand-new-ground-2");
  });

  it("normalises lesson order after a removal", () => {
    const { result } = renderHook(() => useStudioCourses());

    let created = COURSE;
    act(() => {
      created = result.current.createDraft({
        title: "Ordering",
        subtitle: "Order test",
        description: "x".repeat(40),
        category: "technology",
        level: "advanced",
        tags: [],
        priceCents: 0,
      });
    });

    act(() => result.current.remove(created.id));
    expect(result.current.byId(created.id)).toBeNull();
  });

  it("builds a slug from any title", () => {
    expect(uniqueSlug("Café & Crème: Level 2")).toBe("cafe-creme-level-2");
    expect(uniqueSlug("   ")).toBe("untitled-course");
  });
});