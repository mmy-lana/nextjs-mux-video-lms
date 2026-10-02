import { describe, expect, it } from "vitest";

import { SEED_COURSES } from "@/lib/seed/catalog";
import {
  coursePublishBlockers,
  courseSchema,
  createTokenRequestSchema,
  createUploadRequestSchema,
  invalidRecordKeys,
  lessonProgressSchema,
  lessonSchema,
  noteSchema,
  parseRecord,
  playerSettingsSchema,
  validateCourseForPublish,
} from "@/lib/schemas";
import type { Course, Lesson, LessonProgress, Note } from "@/lib/types";

const NOW = "2026-01-31T09:00:00.000Z";

function firstCourse(): Course {
  return structuredClone(SEED_COURSES[0]);
}

function firstLesson(course: Course): Lesson {
  return course.modules[0].lessons[0];
}

describe("lessonSchema", () => {
  it("accepts a valid lesson and rejects short titles", () => {
    const lesson = firstLesson(firstCourse());

    expect(lessonSchema.safeParse(lesson).success).toBe(true);
    expect(lessonSchema.safeParse({ ...lesson, title: "No" }).success).toBe(false);
  });

  it("rejects playback ids that are not alphanumeric", () => {
    const lesson = firstLesson(firstCourse());

    expect(lessonSchema.safeParse({ ...lesson, playbackId: "abc-123" }).success).toBe(false);
    expect(lessonSchema.safeParse({ ...lesson, playbackId: "abc_123" }).success).toBe(false);
    expect(lessonSchema.safeParse({ ...lesson, playbackId: "a".repeat(201) }).success).toBe(false);
  });

  it("requires a positive duration or null", () => {
    const lesson = firstLesson(firstCourse());

    expect(lessonSchema.safeParse({ ...lesson, durationSec: 0 }).success).toBe(false);
    expect(lessonSchema.safeParse({ ...lesson, durationSec: -1 }).success).toBe(false);
    expect(lessonSchema.safeParse({ ...lesson, durationSec: null }).success).toBe(true);
  });

  it("only accepts https resource urls", () => {
    const lesson = firstLesson(firstCourse());

    const withResource = {
      ...lesson,
      resources: [
        { id: "r1", label: "Notes", url: "http://example.com/a.pdf", kind: "pdf" as const },
      ],
    };

    expect(lessonSchema.safeParse(withResource).success).toBe(false);
  });
});

describe("courseSchema", () => {
  it("accepts every seed course", () => {
    for (const course of SEED_COURSES) {
      expect(courseSchema.safeParse(course).success).toBe(true);
    }
  });

  it("rejects non-kebab-case slugs", () => {
    const course = firstCourse();

    expect(courseSchema.safeParse({ ...course, slug: "Not Kebab" }).success).toBe(false);
    expect(courseSchema.safeParse({ ...course, slug: "trailing-" }).success).toBe(false);
    expect(courseSchema.safeParse({ ...course, slug: "ab" }).success).toBe(false);
  });

  it("requires between three and eight learning outcomes", () => {
    const course = firstCourse();

    expect(
      courseSchema.safeParse({ ...course, learnOutcomes: course.learnOutcomes.slice(0, 2) })
        .success,
    ).toBe(false);
    expect(
      courseSchema.safeParse({
        ...course,
        learnOutcomes: Array.from({ length: 9 }, (_, i) => `Outcome number ${i + 1}`),
      }).success,
    ).toBe(false);
  });

  it("caps tags at six and requires lowercase entries", () => {
    const course = firstCourse();

    expect(courseSchema.safeParse({ ...course, tags: ["Mixed", "Case"] }).success).toBe(false);
    expect(
      courseSchema.safeParse({ ...course, tags: Array.from({ length: 7 }, (_, i) => `tag-${i}`) })
        .success,
    ).toBe(false);
  });

  it("rejects a negative price or poster time", () => {
    const course = firstCourse();

    expect(courseSchema.safeParse({ ...course, priceCents: -1 }).success).toBe(false);
    expect(courseSchema.safeParse({ ...course, heroPosterTimeSec: -1 }).success).toBe(false);
  });
});

describe("coursePublishBlockers", () => {
  it("reports a course with no modules", () => {
    const course: Course = { ...firstCourse(), modules: [] };

    expect(coursePublishBlockers(course).map((blocker) => blocker.code)).toContain("no-modules");
    expect(validateCourseForPublish(course)).toBe(false);
  });

  it("reports an empty module and points at it", () => {
    const course = firstCourse();
    course.modules[1].lessons = [];

    const blockers = coursePublishBlockers(course);
    const emptyModule = blockers.find((blocker) => blocker.code === "empty-module");

    expect(emptyModule).toBeDefined();
    expect(emptyModule?.path.moduleId).toBe(course.modules[1].id);
  });

  it("reports a lesson with no playback id", () => {
    const course = firstCourse();
    course.modules[0].lessons[2].playbackId = "";

    const blockers = coursePublishBlockers(course);
    const missing = blockers.find((blocker) => blocker.code === "missing-playback-id");

    expect(missing?.path.lessonId).toBe(course.modules[0].lessons[2].id);
  });

  it("reports non-contiguous module order", () => {
    const course = firstCourse();
    course.modules[1].order = 7;

    expect(coursePublishBlockers(course).map((b) => b.code)).toContain("order-not-contiguous");
  });

  it("reports non-contiguous lesson order", () => {
    const course = firstCourse();
    course.modules[0].lessons[1].order = 4;

    expect(coursePublishBlockers(course).map((b) => b.code)).toContain("order-not-contiguous");
  });

  it("passes once every requirement is met", () => {
    const course = firstCourse();

    expect(coursePublishBlockers(course)).toEqual([]);
    expect(validateCourseForPublish(course)).toBe(true);
  });
});

describe("playerSettingsSchema", () => {
  it("accepts every documented playback rate and rejects others", () => {
    for (const rate of [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]) {
      expect(
        playerSettingsSchema.safeParse({
          playbackRate: rate,
          autoplayNext: true,
          volume: 1,
          muted: false,
        }).success,
      ).toBe(true);
    }

    expect(
      playerSettingsSchema.safeParse({
        playbackRate: 1.1,
        autoplayNext: true,
        volume: 1,
        muted: false,
      }).success,
    ).toBe(false);
  });

  it("keeps volume inside 0–1", () => {
    const base = { playbackRate: 1, autoplayNext: true, muted: false };

    expect(playerSettingsSchema.safeParse({ ...base, volume: 1.2 }).success).toBe(false);
    expect(playerSettingsSchema.safeParse({ ...base, volume: -0.1 }).success).toBe(false);
  });
});

describe("lessonProgressSchema and noteSchema", () => {
  it("rejects a negative position", () => {
    const progress: LessonProgress = {
      id: "c1:l1",
      courseId: "c1",
      lessonId: "l1",
      positionSec: -1,
      watchedSegments: [],
      completed: false,
      completedAt: null,
      manuallyCompleted: false,
      createdAt: NOW,
      updatedAt: NOW,
    };

    expect(lessonProgressSchema.safeParse(progress).success).toBe(false);
    expect(lessonProgressSchema.safeParse({ ...progress, positionSec: 0 }).success).toBe(true);
  });

  it("requires a non-empty note body and a non-negative timestamp", () => {
    const note: Note = {
      id: "n1",
      courseId: "c1",
      lessonId: "l1",
      timestampSec: 12,
      body: "Good bit",
      createdAt: NOW,
      updatedAt: NOW,
    };

    expect(noteSchema.safeParse(note).success).toBe(true);
    expect(noteSchema.safeParse({ ...note, body: "  " }).success).toBe(false);
    expect(noteSchema.safeParse({ ...note, body: "x".repeat(1001) }).success).toBe(false);
    expect(noteSchema.safeParse({ ...note, timestampSec: -1 }).success).toBe(false);
  });
});

describe("api payload schemas", () => {
  it("validates the direct-upload request", () => {
    expect(createUploadRequestSchema.safeParse({ policy: "public" }).success).toBe(true);
    expect(createUploadRequestSchema.safeParse({ policy: "signed" }).success).toBe(true);
    expect(createUploadRequestSchema.safeParse({ policy: "drm" }).success).toBe(false);
    expect(createUploadRequestSchema.safeParse({}).success).toBe(false);
  });

  it("validates the token request", () => {
    expect(createTokenRequestSchema.safeParse({ playbackId: "abc123" }).success).toBe(true);
    expect(createTokenRequestSchema.safeParse({ playbackId: "abc-123" }).success).toBe(false);
    expect(createTokenRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe("record repair helpers", () => {
  it("returns null for an unusable record instead of throwing", () => {
    expect(parseRecord(noteSchema, { id: "n1" })).toBeNull();

    const good: Note = {
      id: "n1",
      courseId: "c1",
      lessonId: "l1",
      timestampSec: 0,
      body: "ok",
      createdAt: NOW,
      updatedAt: NOW,
    };
    expect(parseRecord(noteSchema, good)).toEqual(good);
  });

  it("lists the keys that failed validation", () => {
    const map = {
      good: {
        id: "n1",
        courseId: "c1",
        lessonId: "l1",
        timestampSec: 0,
        body: "ok",
        createdAt: NOW,
        updatedAt: NOW,
      },
      bad: { id: "n2" },
    };

    expect(invalidRecordKeys(noteSchema, map)).toEqual(["bad"]);
  });
});
