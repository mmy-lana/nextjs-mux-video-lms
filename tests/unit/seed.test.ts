import { describe, expect, it } from "vitest";

import { INSTRUCTORS, SEED_EPOCH } from "@/lib/seed/instructors";
import { SEED_PLAYBACK_ID } from "@/lib/seed/playback";
import { SEED_COURSES, findSeedCourse, getSeedSlugs } from "@/lib/seed/catalog";
import {
  activityRecordSchema,
  coursePublishBlockers,
  courseSchema,
  instructorSchema,
  lessonSchema,
  validateCourseForPublish,
} from "@/lib/schemas";
import { flattenCourse, hasContiguousOrder } from "@/lib/domain/curriculum";
import { courseTotals, freePreviewCount } from "@/lib/domain/totals";
import { COURSE_CATEGORIES, COURSE_LEVELS } from "@/lib/types";

describe("seed catalog", () => {
  it("ships six published courses with unique slugs", () => {
    expect(SEED_COURSES).toHaveLength(6);

    const slugs = getSeedSlugs();
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("validates every course, instructor, module and lesson against the schemas", () => {
    for (const instructor of INSTRUCTORS) {
      expect(instructorSchema.safeParse(instructor).success).toBe(true);
    }

    for (const course of SEED_COURSES) {
      const result = courseSchema.safeParse(course);
      if (!result.success) {
        throw new Error(
          `Seed course "${course.slug}" failed validation: ${JSON.stringify(result.error.issues)}`,
        );
      }
      expect(result.success).toBe(true);
    }
  });

  it("references an instructor that exists", () => {
    const instructorIds = new Set(INSTRUCTORS.map((instructor) => instructor.id));

    for (const course of SEED_COURSES) {
      expect(instructorIds.has(course.instructorId)).toBe(true);
    }
  });

  it("spans at least four categories and uses known category/level values", () => {
    const categories = new Set(SEED_COURSES.map((course) => course.category));

    expect(categories.size).toBeGreaterThanOrEqual(4);
    for (const course of SEED_COURSES) {
      expect(COURSE_CATEGORIES).toContain(course.category);
      expect(COURSE_LEVELS).toContain(course.level);
    }
  });

  it("gives every course 3–4 modules of 3–5 lessons", () => {
    for (const course of SEED_COURSES) {
      expect(course.modules.length).toBeGreaterThanOrEqual(3);
      expect(course.modules.length).toBeLessThanOrEqual(4);

      for (const module of course.modules) {
        expect(module.lessons.length).toBeGreaterThanOrEqual(3);
        expect(module.lessons.length).toBeLessThanOrEqual(5);
      }
    }
  });

  it("keeps module and lesson order contiguous from zero", () => {
    for (const course of SEED_COURSES) {
      expect(hasContiguousOrder(course.modules)).toBe(true);

      for (const module of course.modules) {
        expect(hasContiguousOrder(module.lessons)).toBe(true);
      }
    }
  });

  it("marks the first lesson of module one free and offers 1–2 previews per course", () => {
    for (const course of SEED_COURSES) {
      const firstLesson = flattenCourse(course)[0];
      expect(firstLesson?.lesson.isFreePreview).toBe(true);

      const previews = freePreviewCount(course);
      expect(previews).toBeGreaterThanOrEqual(1);
      expect(previews).toBeLessThanOrEqual(2);
    }
  });

  it("leaves every duration unknown so the player teaches the truth (D5)", () => {
    for (const course of SEED_COURSES) {
      for (const { lesson } of flattenCourse(course)) {
        expect(lesson.durationSec).toBeNull();
      }
    }
  });

  it("reuses the shared playback id for heroes and lessons", () => {
    for (const course of SEED_COURSES) {
      expect(course.heroPlaybackId).toBe(SEED_PLAYBACK_ID);

      for (const { lesson } of flattenCourse(course)) {
        expect(lesson.playbackId).toBe(SEED_PLAYBACK_ID);
        expect(lessonSchema.safeParse(lesson).success).toBe(true);
      }
    }
  });

  it("uses fixed timestamps rather than the current clock", () => {
    for (const course of SEED_COURSES) {
      expect(course.createdAt).not.toBeUndefined();
      expect(Date.parse(course.createdAt)).not.toBeNaN();
      expect(course.updatedAt).toBe(course.createdAt);
    }

    expect(INSTRUCTORS[0].createdAt).toBe(SEED_EPOCH);
  });

  it("features exactly one course", () => {
    expect(SEED_COURSES.filter((course) => course.featured)).toHaveLength(1);
  });

  it("computes totals with a null duration until every lesson is known", () => {
    const course = SEED_COURSES[0];
    const totals = courseTotals(course);

    expect(totals.moduleCount).toBe(course.modules.length);
    expect(totals.lessonCount).toBeGreaterThan(0);
    expect(totals.totalDurationSec).toBeNull();
    expect(totals.knownDurationCount).toBe(0);
  });

  it("passes the publish checklist without blockers", () => {
    for (const course of SEED_COURSES) {
      expect(coursePublishBlockers(course)).toEqual([]);
      expect(validateCourseForPublish(course)).toBe(true);
    }
  });

  it("keeps slugs free of a collision with a lookup", () => {
    for (const slug of getSeedSlugs()) {
      expect(findSeedCourse(slug)?.slug).toBe(slug);
    }

    expect(findSeedCourse("no-such-course")).toBeNull();
  });

  it("uses a valid YYYY-MM-DD-free activity envelope", () => {
    expect(activityRecordSchema.safeParse({}).success).toBe(true);
  });
});
