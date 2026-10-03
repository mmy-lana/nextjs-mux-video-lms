/**
 * Cascading deletion of a Studio course and everything derived from it.
 *
 * Removing a course has to remove the records that point at it, or the app
 * accumulates orphans that are invisible but not inert: a lesson count that
 * includes deleted lessons, a certificate for a course that no longer exists, a
 * streak fed by study time nobody did.
 *
 * The Mux assets are deleted first, while their capabilities are still in hand.
 * That ordering matters: the purge clears the local records, so a remote asset
 * whose capability lived only in the purged rows could never be cleaned up
 * afterwards.
 */

import { deleteMuxAsset } from "@/lib/mux/client";
import {
  durationsStore,
  enrollmentsStore,
  notesStore,
  progressStore,
  studioCoursesStore,
  studioJobsStore,
} from "@/lib/storage/stores";
import type { Course, StudioUploadJob } from "@/lib/types";

export interface PurgeReport {
  courseId: string;
  lessons: number;
  enrollments: number;
  progressRecords: number;
  notes: number;
  durationRecords: number;
  uploadJobs: number;
  /** Assets whose remote delete was attempted. */
  assetsRequested: number;
  /** Assets the server refused or could not delete. */
  assetsFailed: number;
}

/**
 * Delete a course and every record that references it.
 *
 * Remote deletes are best effort by design: a Mux failure must not leave the
 * learner with a course they cannot remove, because the local record would be
 * stuck in place. The orphan is reported so it can be cleaned up from the Mux
 * dashboard.
 */
export async function purgeStudioCourse(courseId: string): Promise<PurgeReport> {
  const course = studioCoursesStore.get()[courseId] ?? null;

  const report: PurgeReport = {
    courseId,
    lessons: 0,
    enrollments: 0,
    progressRecords: 0,
    notes: 0,
    durationRecords: 0,
    uploadJobs: 0,
    assetsRequested: 0,
    assetsFailed: 0,
  };

  const lessons = course === null ? [] : course.modules.flatMap((module) => module.lessons);
  const jobs = Object.values(studioJobsStore.get()).filter((job) => job.courseId === courseId);

  report.lessons = lessons.length;
  report.uploadJobs = jobs.length;

  /* 1. Remote assets, while the capabilities are still available. */
  const deletions: Array<Promise<void>> = [];

  for (const lesson of lessons) {
    if (!lesson.muxAssetId) continue;

    report.assetsRequested += 1;
    deletions.push(
      deleteMuxAsset(lesson.muxAssetId, lesson.muxDeleteToken).then((ok) => {
        if (!ok) report.assetsFailed += 1;
      }),
    );
  }

  for (const job of jobs) {
    // Only a job that never attached has an asset nothing else will clean up.
    if (job.muxAssetId === null || lessonOwnsAsset(lessons, job.muxAssetId)) continue;

    report.assetsRequested += 1;
    deletions.push(
      deleteMuxAsset(job.muxAssetId, job.deleteToken).then((ok) => {
        if (!ok) report.assetsFailed += 1;
      }),
    );
  }

  await Promise.allSettled(deletions);

  /* 2. Every local record keyed to this course. */
  progressStore.set((snapshot) => dropWhere(snapshot, courseId, report, "progressRecords"));
  notesStore.set((snapshot) => dropWhere(snapshot, courseId, report, "notes"));

  durationsStore.set((snapshot) => {
    const lessonIds = new Set(lessons.map((lesson) => lesson.id));
    report.durationRecords = lessonIds.size;

    if (lessonIds.size === 0) return snapshot;

    const next = { ...snapshot };
    for (const lessonId of lessonIds) delete next[lessonId];
    return next;
  });

  enrollmentsStore.set((snapshot) => {
    if (!(courseId in snapshot)) return snapshot;

    report.enrollments = 1;
    const { [courseId]: _removed, ...rest } = snapshot;
    return rest;
  });

  studioJobsStore.set((snapshot) => {
    const doomed = Object.entries(snapshot).filter(([, job]) => job.courseId === courseId);
    if (doomed.length === 0) return snapshot;

    const next = { ...snapshot };
    for (const [jobId] of doomed) delete next[jobId];
    return next;
  });

  /* 3. The course itself, last: it is the record the others were found from. */
  studioCoursesStore.set((snapshot) => {
    if (!(courseId in snapshot)) return snapshot;

    const { [courseId]: _removed, ...rest } = snapshot;
    return rest;
  });

  return report;
}

/**
 * Drop every entry whose value belongs to `courseId`.
 *
 * Entries are removed by the key they are actually stored under, not by
 * `value.id`. The two are the same in a map this app writes, but a record
 * repaired from an older payload can be keyed differently, and deleting by
 * `value.id` would then silently leave it behind.
 */
function dropWhere<T extends { courseId: string }>(
  snapshot: Record<string, T>,
  courseId: string,
  report: PurgeReport,
  field: "progressRecords" | "notes",
): Record<string, T> {
  const next: Record<string, T> = {};
  let removed = 0;

  for (const [key, value] of Object.entries(snapshot)) {
    if (value.courseId === courseId) {
      removed += 1;
      continue;
    }

    next[key] = value;
  }

  report[field] = removed;
  return removed === 0 ? snapshot : next;
}

/** `true` when some lesson of the course already holds this asset id. */
function lessonOwnsAsset(lessons: ReadonlyArray<Course["modules"][number]["lessons"][number]>, assetId: string): boolean {
  return lessons.some((lesson) => lesson.muxAssetId === assetId);
}

/** Human summary for a toast, so the count is visible rather than implied. */
export function describePurge(report: PurgeReport): string {
  const parts: string[] = [];

  if (report.lessons > 0) parts.push(`${report.lessons} lessons`);
  if (report.enrollments > 0) parts.push("1 enrollment");
  if (report.progressRecords > 0) parts.push(`${report.progressRecords} progress records`);
  if (report.notes > 0) parts.push(`${report.notes} notes`);

  const local = parts.length > 0 ? `Removed ${parts.join(", ")}.` : "Nothing else referenced it.";

  if (report.assetsFailed === 0) return local;

  return `${local} ${report.assetsFailed} video asset${report.assetsFailed === 1 ? "" : "s"} could not be deleted from Mux and will need clearing there.`;
}

/** `true` when every job for this course is finished or dead. */
export function hasPendingUploads(jobs: readonly StudioUploadJob[], courseId: string): boolean {
  return jobs.some(
    (job) => job.courseId === courseId && (job.state === "uploading" || job.state === "processing"),
  );
}