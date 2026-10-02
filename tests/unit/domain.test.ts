import { describe, expect, it } from "vitest";

import { SEED_COURSES } from "@/lib/seed/catalog";
import { flattenCourse, moveItem, normalizeOrder, removeById, updateById } from "@/lib/domain/curriculum";
import {
  applyProgressTick,
  clampSegmentsToDuration,
  coursePercent,
  insertSegment,
  isCourseComplete,
  isSeek,
  lessonPercent,
  resolveDuration,
  setManualCompletion,
  totalSegments,
  watchedRatio,
  watchedSeconds,
  MAX_CREDITED_SEC_PER_TICK,
  SEGMENT_SEC,
} from "@/lib/domain/progress";
import {
  canAccessLesson,
  firstLesson,
  firstLockedLesson,
  nextLesson,
  previousLesson,
  resolveResumeLesson,
  resumeStart,
} from "@/lib/domain/resume";
import { activitySeries, streak, totalWatchedSeconds } from "@/lib/domain/streak";
import { pollDelayMs, shouldGiveUp, sleep } from "@/lib/domain/backoff";
import { courseTotalsWithDurations, lessonProgressSummary, nextIncompleteLessonId } from "@/lib/domain/totals";
import type { ActivityDay, Course, LessonProgress } from "@/lib/types";
import { progressKey } from "@/lib/utils/ids";
import { shiftLocalDateKey } from "@/lib/utils/time";

const NOW = "2026-01-31T09:00:00.000Z";
const course = SEED_COURSES[0];

function progress(overrides: Partial<LessonProgress> = {}): LessonProgress {
  return {
    id: "c1:l1",
    courseId: "c1",
    lessonId: "l1",
    positionSec: 0,
    watchedSegments: [],
    completed: false,
    completedAt: null,
    manuallyCompleted: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */

describe("segment helpers", () => {
  it("inserts in sorted order without duplicates", () => {
    let segments: number[] = [];

    segments = insertSegment(segments, 5);
    segments = insertSegment(segments, 1);
    segments = insertSegment(segments, 3);
    segments = insertSegment(segments, 1);

    expect(segments).toEqual([1, 3, 5]);
  });

  it("returns the identical array when the segment already exists", () => {
    const segments = [1, 2, 3];
    expect(insertSegment(segments, 2)).toBe(segments);
  });

  it("ignores invalid segment indexes", () => {
    expect(insertSegment([1], -1)).toEqual([1]);
    expect(insertSegment([1], 1.5)).toEqual([1]);
  });

  it("derives total segments from a duration", () => {
    expect(totalSegments(null)).toBe(1);
    expect(totalSegments(0)).toBe(1);
    expect(totalSegments(100)).toBe(10);
    expect(totalSegments(101)).toBe(11);
  });
});

describe("seek detection", () => {
  it("treats a jump larger than 15 seconds as a seek", () => {
    expect(isSeek(10, 40)).toBe(true);
    expect(isSeek(40, 10)).toBe(true);
  });

  it("treats normal playback as a watch", () => {
    expect(isSeek(10, 15)).toBe(false);
    expect(isSeek(10, 24)).toBe(false);
  });
});

describe("applyProgressTick", () => {
  it("adds a segment for ordinary playback", () => {
    const result = applyProgressTick({
      current: progress(),
      currentTime: 12,
      durationSec: 100,
      lastTickSec: 5,
      ended: false,
      now: NOW,
    });

    expect(result.next.watchedSegments).toEqual([1]);
    expect(result.next.positionSec).toBe(12);
    expect(result.changed).toBe(true);
  });

  it("adds no segments when the learner scrubs", () => {
    const result = applyProgressTick({
      current: progress(),
      currentTime: 200,
      durationSec: 300,
      lastTickSec: 10,
      ended: false,
      now: NOW,
    });

    expect(result.next.watchedSegments).toEqual([]);
    expect(result.creditedSeconds).toBe(0);
  });

  it("caps credited seconds per tick", () => {
    // 10 s of real playback in one tick, capped at 6 s so a stall or a dropped
    // frame cannot inflate the watch-time total.
    const result = applyProgressTick({
      current: progress(),
      currentTime: 100,
      durationSec: 600,
      lastTickSec: 90,
      ended: false,
      now: NOW,
    });

    expect(result.creditedSeconds).toBe(MAX_CREDITED_SEC_PER_TICK);
  });

  it("does not complete without a known duration", () => {
    const result = applyProgressTick({
      current: progress(),
      currentTime: 30,
      durationSec: null,
      lastTickSec: 25,
      ended: false,
      now: NOW,
    });

    expect(result.next.completed).toBe(false);
    expect(watchedRatio(result.next, null)).toBe(0);
  });

  it("completes at a 0.9 watched ratio", () => {
    // 9 of 10 segments watched on a 100 s lesson.
    const current = progress({ watchedSegments: [0, 1, 2, 3, 4, 5, 6, 7] });
    const result = applyProgressTick({
      current,
      currentTime: 95,
      durationSec: 100,
      lastTickSec: 90,
      ended: false,
      now: NOW,
    });

    expect(result.next.watchedSegments).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 9]);
    expect(watchedRatio(result.next, 100)).toBe(0.9);
    expect(result.next.completed).toBe(true);
    expect(result.next.completedAt).toBe(NOW);
    expect(result.justCompleted).toBe(true);
  });

  it("completes on ended regardless of coverage", () => {
    const result = applyProgressTick({
      current: progress(),
      currentTime: 3,
      durationSec: 300,
      lastTickSec: 2,
      ended: true,
      now: NOW,
    });

    expect(result.next.completed).toBe(true);
    expect(result.justCompleted).toBe(true);
  });

  it("never un-completes an already complete lesson", () => {
    const current = progress({ completed: true, completedAt: NOW });
    const result = applyProgressTick({
      current,
      currentTime: 0,
      durationSec: 100,
      lastTickSec: 10,
      ended: false,
      now: NOW,
    });

    expect(result.next.completed).toBe(true);
    expect(result.justCompleted).toBe(false);
    expect(result.next.completedAt).toBe(NOW);
  });

  it("reports no change when nothing moved", () => {
    const current = progress({ positionSec: 10, watchedSegments: [1] });
    const result = applyProgressTick({
      current,
      currentTime: 10,
      durationSec: 100,
      lastTickSec: 10,
      ended: false,
      now: NOW,
    });

    expect(result.changed).toBe(false);
  });
});

describe("manual completion", () => {
  it("marks complete and records the timestamp", () => {
    const result = setManualCompletion(progress(), true, NOW);

    expect(result.completed).toBe(true);
    expect(result.completedAt).toBe(NOW);
    expect(result.manuallyCompleted).toBe(true);
  });

  it("clears completion when toggled back", () => {
    const current = progress({ completed: true, completedAt: NOW });
    const result = setManualCompletion(current, false, NOW);

    expect(result.completed).toBe(false);
    expect(result.completedAt).toBeNull();
  });
});

describe("derived percentages", () => {
  it("returns 100 for a completed lesson", () => {
    expect(lessonPercent(progress({ completed: true }), 100)).toBe(100);
  });

  it("returns 0 without progress", () => {
    expect(lessonPercent(null, 100)).toBe(0);
  });

  it("computes a percentage from watched segments", () => {
    const current = progress({ watchedSegments: [0, 1, 2, 3, 4] });
    expect(lessonPercent(current, 100)).toBe(50);
  });

  it("computes course percent by lesson count", () => {
    const flat = flattenCourse(course);
    const map: Record<string, LessonProgress> = {};

    for (const entry of flat.slice(0, 2)) {
      map[progressKey(course.id, entry.lesson.id)] = progress({ completed: true });
    }

    const summary = lessonProgressSummary(course, map);
    expect(summary.completed).toBe(2);
    expect(summary.total).toBe(flat.length);
    expect(coursePercent(course, map)).toBe(Math.round((2 / flat.length) * 100));
    expect(isCourseComplete(course, map)).toBe(false);
  });

  it("reports completion when every lesson is done", () => {
    const map: Record<string, LessonProgress> = {};

    for (const entry of flattenCourse(course)) {
      map[progressKey(course.id, entry.lesson.id)] = progress({ completed: true });
    }

    expect(isCourseComplete(course, map)).toBe(true);
    expect(coursePercent(course, map)).toBe(100);
    expect(nextIncompleteLessonId(course, map)).toBeNull();
  });

  it("returns 0 percent for a course with no lessons", () => {
    expect(coursePercent({ id: "x", modules: [] }, {})).toBe(0);
  });
});

describe("clampSegmentsToDuration", () => {
  it("drops out-of-range segments when the duration is known", () => {
    expect(clampSegmentsToDuration([0, 1, 2, 30], 100)).toEqual([0, 1, 2]);
  });

  it("keeps and dedupes when the duration is unknown", () => {
    expect(clampSegmentsToDuration([3, 1, 1], null)).toEqual([1, 3]);
  });
});

describe("resolveDuration", () => {
  it("prefers the stored lesson duration", () => {
    expect(resolveDuration({ id: "l1", durationSec: 30 }, { l1: 60 })).toBe(30);
  });

  it("falls back to the learned cache", () => {
    expect(resolveDuration({ id: "l1", durationSec: null }, { l1: 60 })).toBe(60);
  });

  it("returns null when nothing is known", () => {
    expect(resolveDuration({ id: "l1", durationSec: null }, {})).toBeNull();
  });

  it("feeds course totals once durations are learned", () => {
    const durations: Record<string, number> = {};
    for (const { lesson } of flattenCourse(course)) durations[lesson.id] = 120;

    const totals = courseTotalsWithDurations(course, durations);
    expect(totals.totalDurationSec).toBe(totals.lessonCount * 120);
  });
});

describe("watchedSeconds", () => {
  it("multiplies segments by the segment length", () => {
    expect(watchedSeconds(progress({ watchedSegments: [0, 1, 2] }), 100)).toBe(30);
    expect(watchedSeconds(progress({ watchedSegments: [0, 1, 2] }), null)).toBe(0);
    expect(SEGMENT_SEC).toBe(10);
  });
});

/* ------------------------------------------------------------------ */

describe("resumeStart", () => {
  it("returns 0 without progress", () => {
    expect(resumeStart(null, 100)).toBe(0);
  });

  it("returns 0 for a barely started lesson", () => {
    expect(resumeStart(progress({ positionSec: 3 }), 100)).toBe(0);
  });

  it("returns 0 near the end", () => {
    expect(resumeStart(progress({ positionSec: 95 }), 100)).toBe(0);
  });

  it("returns the saved position mid-lesson", () => {
    expect(resumeStart(progress({ positionSec: 42 }), 100)).toBe(42);
  });

  it("returns the position when the duration is unknown", () => {
    expect(resumeStart(progress({ positionSec: 42 }), null)).toBe(42);
  });
});

describe("lesson navigation", () => {
  const flat = flattenCourse(course);

  it("returns the following lesson", () => {
    const next = nextLesson(course, flat[0].lesson.id);
    expect(next?.lesson.id).toBe(flat[1].lesson.id);
  });

  it("returns null at the end of the course", () => {
    expect(nextLesson(course, flat.at(-1)!.lesson.id)).toBeNull();
  });

  it("returns null for an unknown lesson", () => {
    expect(nextLesson(course, "nope")).toBeNull();
  });

  it("returns the preceding lesson", () => {
    expect(previousLesson(course, flat[1].lesson.id)?.lesson.id).toBe(flat[0].lesson.id);
    expect(previousLesson(course, flat[0].lesson.id)).toBeNull();
  });

  it("returns the first lesson", () => {
    expect(firstLesson(course)?.lesson.id).toBe(flat[0].lesson.id);
  });
});

describe("resolveResumeLesson", () => {
  const flat = flattenCourse(course);
  const courseId = course.id;

  it("prefers the last watched unfinished lesson", () => {
    const result = resolveResumeLesson(
      course,
      {},
      { lastLessonId: flat[3].lesson.id, completedAt: null },
    );

    expect(result?.lesson.id).toBe(flat[3].lesson.id);
  });

  it("skips a completed last lesson and finds the first incomplete", () => {
    const map: Record<string, LessonProgress> = {
      [progressKey(courseId, flat[0].lesson.id)]: progress({ completed: true }),
      [progressKey(courseId, flat[1].lesson.id)]: progress({ completed: true }),
    };

    const result = resolveResumeLesson(
      course,
      map,
      { lastLessonId: flat[1].lesson.id, completedAt: null },
    );

    expect(result?.lesson.id).toBe(flat[2].lesson.id);
  });

  it("falls back to the first lesson when everything is complete", () => {
    const map: Record<string, LessonProgress> = {};
    for (const entry of flat) {
      map[progressKey(courseId, entry.lesson.id)] = progress({ completed: true });
    }

    const result = resolveResumeLesson(
      course,
      map,
      { lastLessonId: flat.at(-1)!.lesson.id, completedAt: NOW },
    );

    expect(result?.lesson.id).toBe(flat[0].lesson.id);
  });

  it("returns null for a course with no lessons", () => {
    const empty: Course = { ...course, modules: [] };
    expect(resolveResumeLesson(empty, {}, null)).toBeNull();
  });
});

describe("access control (simulated — see D4)", () => {
  it("lets anyone watch a free preview", () => {
    expect(canAccessLesson({ isFreePreview: true }, false)).toBe(true);
  });

  it("requires enrollment for a paid lesson", () => {
    expect(canAccessLesson({ isFreePreview: false }, false)).toBe(false);
    expect(canAccessLesson({ isFreePreview: false }, true)).toBe(true);
  });

  it("finds the first locked lesson when not enrolled", () => {
    const locked = firstLockedLesson(course, false);
    expect(locked?.lesson.isFreePreview).toBe(false);

    expect(firstLockedLesson(course, true)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */

describe("streak", () => {
  const today = "2026-01-31";

  function day(date: string, seconds = 300): ActivityDay {
    return {
      id: date,
      date,
      secondsWatched: seconds,
      lessonsCompleted: 1,
      createdAt: NOW,
      updatedAt: NOW,
    };
  }

  it("returns zero for an empty history", () => {
    expect(streak({}, today)).toEqual({ days: 0, lastActiveDate: null, activeToday: false });
  });

  it("counts consecutive days ending today", () => {
    const activity = {
      [today]: day(today),
      [shiftLocalDateKey(today, -1)]: day(shiftLocalDateKey(today, -1)),
      [shiftLocalDateKey(today, -2)]: day(shiftLocalDateKey(today, -2)),
    };

    const result = streak(activity, today);
    expect(result.days).toBe(3);
    expect(result.activeToday).toBe(true);
  });

  it("still counts a streak when today is empty but yesterday is not", () => {
    const yesterday = shiftLocalDateKey(today, -1);
    const result = streak({ [yesterday]: day(yesterday) }, today);

    expect(result.days).toBe(1);
    expect(result.activeToday).toBe(false);
  });

  it("breaks the streak after a missed day", () => {
    const activity = {
      [shiftLocalDateKey(today, -2)]: day(shiftLocalDateKey(today, -2)),
      [shiftLocalDateKey(today, -3)]: day(shiftLocalDateKey(today, -3)),
    };

    expect(streak(activity, today).days).toBe(0);
  });

  it("ignores days below the qualifying threshold", () => {
    // 10 seconds watched and no lesson finished is not a study day.
    const quiet = { ...day(today, 10), lessonsCompleted: 0 };

    expect(streak({ [today]: quiet }, today).days).toBe(0);
  });

  it("counts a day with only a completed lesson", () => {
    const activity = {
      [today]: { ...day(today, 0), lessonsCompleted: 1 },
    };

    expect(streak(activity, today).days).toBe(1);
  });

  it("builds an evenly spaced activity series", () => {
    const series = activitySeries({ [today]: day(today, 600) }, 7, today);

    expect(series).toHaveLength(7);
    expect(series[0].date).toBe(shiftLocalDateKey(today, -6));
    expect(series[6].date).toBe(today);
    expect(totalWatchedSeconds({ [today]: day(today, 600) }, 7, today)).toBe(600);
  });
});

/* ------------------------------------------------------------------ */

describe("poll backoff", () => {
  it("follows the documented schedule then caps", () => {
    expect(pollDelayMs(0)).toBe(2_000);
    expect(pollDelayMs(1)).toBe(3_000);
    expect(pollDelayMs(2)).toBe(5_000);
    expect(pollDelayMs(3)).toBe(8_000);
    expect(pollDelayMs(4)).toBe(10_000);
    expect(pollDelayMs(50)).toBe(10_000);
  });

  it("gives up after 15 minutes", () => {
    expect(shouldGiveUp(0, 14 * 60_000)).toBe(false);
    expect(shouldGiveUp(0, 15 * 60_000)).toBe(true);
  });

  it("sleeps and resolves early on abort", async () => {
    const controller = new AbortController();
    const started = Date.now();

    controller.abort();
    await sleep(5_000, controller.signal);

    expect(Date.now() - started).toBeLessThan(500);
  });
});

/* ------------------------------------------------------------------ */

describe("ordering", () => {
  const items = [
    { id: "a", order: 5 },
    { id: "b", order: 1 },
    { id: "c", order: 3 },
  ];

  it("renumbers contiguously while preserving sequence", () => {
    expect(normalizeOrder(items).map((item) => [item.id, item.order])).toEqual([
      ["b", 0],
      ["c", 1],
      ["a", 2],
    ]);
  });

  it("is idempotent", () => {
    const once = normalizeOrder(items);
    expect(normalizeOrder(once)).toEqual(once);
  });

  it("moves an item up or down and renormalises", () => {
    const ordered = normalizeOrder(items);
    expect(moveItem(ordered, 0, -1).map((item) => item.id)).toEqual(ordered.map((item) => item.id));
    expect(moveItem(ordered, 1, 1).map((item) => item.id)).toEqual(["b", "c", "a"]);
  });

  it("is a no-op when moving past either end", () => {
    const ordered = normalizeOrder(items);
    expect(moveItem(ordered, 0, -1).map((item) => item.id)).toEqual(ordered.map((item) => item.id));
    expect(moveItem(ordered, 2, 1).map((item) => item.id)).toEqual(ordered.map((item) => item.id));
  });

  it("removes and updates by id", () => {
    expect(removeById(items, "b").map((item) => item.id)).toEqual(["a", "c"]);
    expect(updateById(items, "a", (item) => ({ ...item, order: 0 }))[0].order).toBe(0);
  });
});
