/**
 * Concrete stores, one per localStorage key from plan §2.2.
 *
 * Every store is created at module scope so a tab has exactly one cache and one
 * cross-tab listener per key. Consumers reach them through the hooks in
 * `lib/storage/useStore.ts` and `lib/storage/useHydrated.ts`.
 */

import { z } from "zod";

import {
  activityDaySchema,
  activityRecordSchema,
  courseSchema,
  durationRecordSchema,
  enrollmentRecordSchema,
  enrollmentSchema,
  learnerProfileSchema,
  lessonProgressSchema,
  noteRecordSchema,
  noteSchema,
  playerSettingsSchema,
  progressRecordSchema,
  studioCourseRecordSchema,
  studioJobRecordSchema,
  studioUploadJobSchema,
} from "../schemas";
import type {
  ActivityDay,
  Course,
  Enrollment,
  LearnerProfile,
  LessonProgress,
  Note,
  PlayerSettings,
  PlaybackRate,
  StudioUploadJob,
} from "../types";
import { progressKey, uid } from "../utils/ids";
import { localDateKey } from "../utils/time";
import { createStore, parseMapSafely, type Store } from "./createStore";
import { STORAGE_KEYS, ACTIVITY_QUOTA_PRUNE_DAYS, type StorageKey } from "./keys";
import { pruneActivityMap } from "./migrations";

/** Notified when a write is refused because the origin is out of quota. */
type QuotaListener = (key: StorageKey) => void;

const quotaListeners = new Set<QuotaListener>();

/** Subscribe to quota-exceeded notifications; used by the toast provider. */
export function onQuotaExceeded(listener: QuotaListener): () => void {
  quotaListeners.add(listener);
  return () => {
    quotaListeners.delete(listener);
  };
}

function withQuota(key: StorageKey) {
  return () => {
    for (const listener of quotaListeners) listener(key);
  };
}

/* ------------------------------------------------------------------ */
/* Defaults                                                            */
/* ------------------------------------------------------------------ */

const EPOCH = "1970-01-01T00:00:00.000Z";

export const DEFAULT_PLAYER_SETTINGS: PlayerSettings = {
  playbackRate: 1,
  autoplayNext: true,
  volume: 1,
  muted: false,
};

/**
 * Build the anonymous-local learner profile created on first visit.
 *
 * The id doubles as the Mux `viewer_user_id`, which is what makes per-viewer
 * analytics work without an auth system (decision D8).
 */
export function createLearnerProfile(now: string = new Date().toISOString()): LearnerProfile {
  return {
    id: uid("learner"),
    displayName: "Learner",
    createdAt: now,
    updatedAt: now,
  };
}

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

export const profileStore: Store<LearnerProfile> = createStore<LearnerProfile>({
  key: STORAGE_KEYS.profile,
  defaultValue: createLearnerProfile(EPOCH),
  schema: learnerProfileSchema,
  repair: (_raw, fallback) => fallback,
  onQuotaExceeded: withQuota(STORAGE_KEYS.profile),
});

/**
 * Ensure a learner profile exists, writing one on first run.
 *
 * Called from the app shell *after* hydration — never during render, because a
 * render-time write would differ between the server and the client.
 */
export function ensureProfile(): LearnerProfile {
  const current = profileStore.get();
  if (current.id.length > 0) return current;

  const created = createLearnerProfile();
  profileStore.set(created);
  return created;
}

/** Rename the learner (profile card in My Learning). */
export function setDisplayName(displayName: string): void {
  const trimmed = displayName.trim().slice(0, 40);
  if (trimmed.length === 0) return;

  profileStore.set((prev) => ({ ...prev, displayName: trimmed, updatedAt: new Date().toISOString() }));
}

/* ------------------------------------------------------------------ */
/* Enrollments                                                         */
/* ------------------------------------------------------------------ */

export const enrollmentsStore: Store<Record<string, Enrollment>> =
  createStore<Record<string, Enrollment>>({
    key: STORAGE_KEYS.enrollments,
    defaultValue: {},
    schema: enrollmentRecordSchema,
    repair: (raw) => parseMapSafely(raw, enrollmentSchema, STORAGE_KEYS.enrollments),
    onQuotaExceeded: withQuota(STORAGE_KEYS.enrollments),
  });

/* ------------------------------------------------------------------ */
/* Progress                                                            */
/* ------------------------------------------------------------------ */

export const progressStore: Store<Record<string, LessonProgress>> =
  createStore<Record<string, LessonProgress>>({
    key: STORAGE_KEYS.progress,
    defaultValue: {},
    schema: progressRecordSchema,
    repair: (raw) => parseMapSafely(raw, lessonProgressSchema, STORAGE_KEYS.progress),
    onQuotaExceeded: withQuota(STORAGE_KEYS.progress),
  });

/* ------------------------------------------------------------------ */
/* Notes                                                               */
/* ------------------------------------------------------------------ */

export const notesStore: Store<Record<string, Note>> = createStore<Record<string, Note>>({
  key: STORAGE_KEYS.notes,
  defaultValue: {},
  schema: noteRecordSchema,
  repair: (raw) => parseMapSafely(raw, noteSchema, STORAGE_KEYS.notes),
  onQuotaExceeded: withQuota(STORAGE_KEYS.notes),
});

/* ------------------------------------------------------------------ */
/* Player settings                                                     */
/* ------------------------------------------------------------------ */

export const settingsStore: Store<PlayerSettings> = createStore<PlayerSettings>({
  key: STORAGE_KEYS.settings,
  defaultValue: DEFAULT_PLAYER_SETTINGS,
  schema: playerSettingsSchema,
  repair: (_raw, fallback) => fallback,
  onQuotaExceeded: withQuota(STORAGE_KEYS.settings),
});

/* ------------------------------------------------------------------ */
/* Learned durations (decision D5)                                     */
/* ------------------------------------------------------------------ */

export const durationsStore: Store<Record<string, number>> = createStore<Record<string, number>>({
  key: STORAGE_KEYS.durations,
  defaultValue: {},
  schema: durationRecordSchema,
  repair: (raw) => parseMapSafely(raw, durationEntrySchema, STORAGE_KEYS.durations),
  onQuotaExceeded: withQuota(STORAGE_KEYS.durations),
});

/** A single learned duration: seconds, positive, finite. */
const durationEntrySchema = z.number().positive().finite();

/* ------------------------------------------------------------------ */
/* Activity                                                            */
/* ------------------------------------------------------------------ */

export const activityStore: Store<Record<string, ActivityDay>> =
  createStore<Record<string, ActivityDay>>({
    key: STORAGE_KEYS.activity,
    defaultValue: {},
    schema: activityRecordSchema,
    repair: (raw) => pruneActivityMap(parseMapSafely(raw, activityDaySchema, STORAGE_KEYS.activity)),
    // The activity log is the only dataset the app sheds: on a quota failure it
    // drops everything older than 90 days and the write is retried once.
    onQuotaPrune: (current) => pruneActivityMap(current, ACTIVITY_QUOTA_PRUNE_DAYS),
    onQuotaExceeded: withQuota(STORAGE_KEYS.activity),
  });

/* ------------------------------------------------------------------ */
/* Studio                                                              */
/* ------------------------------------------------------------------ */

export const studioCoursesStore: Store<Record<string, Course>> = createStore<Record<string, Course>>({
  key: STORAGE_KEYS.studioCourses,
  defaultValue: {},
  schema: studioCourseRecordSchema,
  repair: (raw) => parseMapSafely(raw, courseSchema, STORAGE_KEYS.studioCourses),
  onQuotaExceeded: withQuota(STORAGE_KEYS.studioCourses),
});

export const studioJobsStore: Store<Record<string, StudioUploadJob>> =
  createStore<Record<string, StudioUploadJob>>({
    key: STORAGE_KEYS.studioJobs,
    defaultValue: {},
    schema: studioJobRecordSchema,
    repair: (raw) => parseMapSafely(raw, studioUploadJobSchema, STORAGE_KEYS.studioJobs),
    onQuotaExceeded: withQuota(STORAGE_KEYS.studioJobs),
  });

/* ------------------------------------------------------------------ */
/* Record factories                                                    */
/* ------------------------------------------------------------------ */

export function createEnrollment(courseId: string, now = new Date().toISOString()): Enrollment {
  return {
    id: uid("enrollment"),
    courseId,
    enrolledAt: now,
    lastLessonId: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function createLessonProgress(
  courseId: string,
  lessonId: string,
  now = new Date().toISOString(),
): LessonProgress {
  return {
    id: progressKey(courseId, lessonId),
    courseId,
    lessonId,
    positionSec: 0,
    watchedSegments: [],
    completed: false,
    completedAt: null,
    manuallyCompleted: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function createNote(
  courseId: string,
  lessonId: string,
  timestampSec: number,
  body: string,
  now = new Date().toISOString(),
): Note {
  return {
    id: uid("note"),
    courseId,
    lessonId,
    timestampSec,
    body,
    createdAt: now,
    updatedAt: now,
  };
}

export function createActivityDay(date: string = localDateKey()): ActivityDay {
  const now = new Date().toISOString();
  return {
    id: date,
    date,
    secondsWatched: 0,
    lessonsCompleted: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function createStudioUploadJob(
  courseId: string,
  moduleId: string,
  lessonTitle: string,
  muxUploadId: string,
  now = new Date().toISOString(),
): StudioUploadJob {
  return {
    id: uid("job"),
    courseId,
    moduleId,
    lessonTitle,
    muxUploadId,
    muxAssetId: null,
    playbackId: null,
    durationSec: null,
    state: "uploading",
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Narrow a persisted setting value back to the supported rate union. */
export function asPlaybackRate(value: number): PlaybackRate {
  const candidate = playerSettingsSchema.safeParse({
    ...DEFAULT_PLAYER_SETTINGS,
    playbackRate: value,
  });

  return candidate.success ? candidate.data.playbackRate : DEFAULT_PLAYER_SETTINGS.playbackRate;
}

export type { Store };
