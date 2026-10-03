/**
 * Cascading deletion of a Studio course.
 *
 * The property under test is that nothing survives: a lesson count that still
 * includes deleted lessons, or a certificate for a course that no longer exists,
 * are the failure modes a non-cascading delete produces.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { describePurge, purgeStudioCourse } from "@/lib/domain/purge";
import { deleteMuxAsset } from "@/lib/mux/client";
import {
  durationsStore,
  enrollmentsStore,
  notesStore,
  progressStore,
  studioCoursesStore,
  studioJobsStore,
} from "@/lib/storage/stores";
import { createLessonProgress, createNote, createStudioUploadJob } from "@/lib/storage/stores";
import type { Course } from "@/lib/types";

vi.mock("@/lib/mux/client", () => ({
  deleteMuxAsset: vi.fn(async () => true),
}));

const deleteMuxAssetMock = vi.mocked(deleteMuxAsset);

const COURSE_ID = "course-to-delete";
const OTHER_COURSE_ID = "course-to-keep";

function makeCourse(id: string, playbackId: string, assetId: string | null): Course {
  return {
    id,
    slug: id,
    title: `Course ${id}`,
    subtitle: "A subtitle long enough to satisfy the schema",
    description: "A description long enough to satisfy the schema minimum length.",
    instructorId: "inst_1",
    category: "creative",
    level: "beginner",
    tags: [],
    heroPlaybackId: "",
    heroPolicy: "public",
    heroPosterTimeSec: 2,
    priceCents: 0,
    learnOutcomes: [
      "Outcome one that is long enough",
      "Outcome two that is long enough",
      "Outcome three that is long enough",
    ],
    modules: [
      {
        id: `${id}_m0`,
        title: "Module 1",
        order: 0,
        lessons: [
          {
            id: `${id}_l0`,
            title: "Lesson one",
            summary: "",
            order: 0,
            playbackId,
            playbackPolicy: "public",
            muxAssetId: assetId,
            muxDeleteToken: assetId === null ? null : "a".repeat(64),
            durationSec: 60,
            isFreePreview: true,
            resources: [],
            createdAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        ],
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
      },
    ],
    status: "draft",
    source: "studio",
    featured: false,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  };
}

function seed() {
  studioCoursesStore.set((snapshot) => ({
    ...snapshot,
    [COURSE_ID]: makeCourse(COURSE_ID, "playbackA1", "ast_a"),
    [OTHER_COURSE_ID]: makeCourse(OTHER_COURSE_ID, "playbackB1", "ast_b"),
  }));

  enrollmentsStore.set((snapshot) => ({
    ...snapshot,
    [COURSE_ID]: {
      id: "e1",
      courseId: COURSE_ID,
      enrolledAt: "2025-01-01T00:00:00.000Z",
      lastLessonId: null,
      completedAt: null,
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    },
    [OTHER_COURSE_ID]: {
      id: "e2",
      courseId: OTHER_COURSE_ID,
      enrolledAt: "2025-01-01T00:00:00.000Z",
      lastLessonId: null,
      completedAt: null,
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    },
  }));

  progressStore.set((snapshot) => ({
    ...snapshot,
    [createLessonProgress(COURSE_ID, `${COURSE_ID}_l0`).id]: createLessonProgress(
      COURSE_ID,
      `${COURSE_ID}_l0`,
    ),
    [createLessonProgress(OTHER_COURSE_ID, `${OTHER_COURSE_ID}_l0`).id]: createLessonProgress(
      OTHER_COURSE_ID,
      `${OTHER_COURSE_ID}_l0`,
    ),
  }));

  notesStore.set((snapshot) => ({
    ...snapshot,
    n1: createNote(COURSE_ID, `${COURSE_ID}_l0`, 10, "mine"),
    n2: createNote(OTHER_COURSE_ID, `${OTHER_COURSE_ID}_l0`, 10, "theirs"),
  }));

  durationsStore.set((snapshot) => ({
    ...snapshot,
    [`${COURSE_ID}_l0`]: 60,
    [`${OTHER_COURSE_ID}_l0`]: 60,
  }));

  const job = createStudioUploadJob(COURSE_ID, `${COURSE_ID}_m0`, "Lesson one", "upl_a", "public");
  studioJobsStore.set((snapshot) => ({ ...snapshot, [job.id]: job }));
}

describe("purgeStudioCourse", () => {
  beforeEach(() => {
    deleteMuxAssetMock.mockReset();
    deleteMuxAssetMock.mockResolvedValue(true);
    seed();
  });

  it("removes the course and every record that referenced it", async () => {
    // Confirm the fixtures actually landed: a store that silently rejected a
    // write would otherwise make this test vacuous.
    expect(studioCoursesStore.get()[COURSE_ID]).toBeDefined();
    expect(enrollmentsStore.get()[COURSE_ID]).toBeDefined();

    const report = await purgeStudioCourse(COURSE_ID);

    expect(report.courseId).toBe(COURSE_ID);
    expect(studioCoursesStore.get()[COURSE_ID]).toBeUndefined();
    expect(enrollmentsStore.get()[COURSE_ID]).toBeUndefined();
    expect(notesStore.get().n1).toBeUndefined();
    expect(durationsStore.get()[`${COURSE_ID}_l0`]).toBeUndefined();

    expect(Object.values(progressStore.get()).every((r) => r.courseId !== COURSE_ID)).toBe(true);
    expect(Object.values(studioJobsStore.get()).every((j) => j.courseId !== COURSE_ID)).toBe(true);

    expect(report.lessons).toBe(1);
    expect(report.enrollments).toBe(1);
    expect(report.notes).toBe(1);
  });

  it("leaves an unrelated course completely untouched", async () => {
    await purgeStudioCourse(COURSE_ID);

    expect(studioCoursesStore.get()[OTHER_COURSE_ID]).toBeDefined();
    expect(enrollmentsStore.get()[OTHER_COURSE_ID]).toBeDefined();
    expect(notesStore.get().n2).toBeDefined();
    expect(durationsStore.get()[`${OTHER_COURSE_ID}_l0`]).toBe(60);
    expect(Object.values(progressStore.get()).some((r) => r.courseId === OTHER_COURSE_ID)).toBe(true);
  });

  it("deletes the remote asset with the capability issued for it", async () => {
    await purgeStudioCourse(COURSE_ID);

    expect(deleteMuxAssetMock).toHaveBeenCalledTimes(1);
    expect(deleteMuxAssetMock).toHaveBeenCalledWith("ast_a", "a".repeat(64));
  });

  it("still removes the local course when the remote delete fails", async () => {
    deleteMuxAssetMock.mockResolvedValue(false);

    const report = await purgeStudioCourse(COURSE_ID);

    // The learner's course must go regardless; an orphan in Mux is recoverable
    // from the dashboard, a course stuck behind a failed API call is not.
    expect(studioCoursesStore.get()[COURSE_ID]).toBeUndefined();
    expect(report.assetsFailed).toBe(1);
    expect(describePurge(report)).toMatch(/could not be deleted from Mux/);
  });

  it("reports nothing left over when the course was already gone", async () => {
    const report = await purgeStudioCourse("course_that_never_existed");

    expect(report.lessons).toBe(0);
    expect(report.assetsRequested).toBe(0);
    expect(describePurge(report)).toMatch(/Nothing else referenced it/);
  });

  it("does not attempt a remote delete for a lesson that never had a video", async () => {
    studioCoursesStore.set((snapshot) => ({
      ...snapshot,
      [COURSE_ID]: makeCourse(COURSE_ID, "", null),
    }));

    const report = await purgeStudioCourse(COURSE_ID);

    expect(report.assetsRequested).toBe(0);
    expect(deleteMuxAssetMock).not.toHaveBeenCalled();
    expect(studioCoursesStore.get()[COURSE_ID]).toBeUndefined();
  });
});

/** Tiny helper kept out of the assertions above for readability. */
function report0(courseId: string): Course | undefined {
  return studioCoursesStore.get()[courseId];
}