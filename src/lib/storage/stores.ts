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
  CourseCategory,
  CourseLevel,
  Enrollment,
  LearnerProfile,
  Lesson,
  LessonProgress,
  Module,
  Note,
  PlaybackPolicy,
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

/** Fields the Studio form collects; the rest of the shape is derived. */
export interface CreateStudioCourseInput {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  instructorId: string;
  category: CourseCategory;
  level: CourseLevel;
  tags: string[];
  priceCents: number;
}

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
  policy: PlaybackPolicy = "public",
  deleteToken: string | null = null,
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
    policy,
    deleteToken,
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

/**
 * A new Studio course, always created as a draft.
 *
 * The draft is schema-valid from the moment it is written — a course that
 * fails validation cannot be persisted at all — so it starts from a template
 * the author replaces. `publishBlockers` is what stops a half-written template
 * from reaching learners.
 *
 * The single empty lesson has no `playbackId`, which is exactly what keeps the
 * course from being publishable until a real video is attached (plan §2.1).
 */
export function createStudioCourse(
  input: CreateStudioCourseInput,
  now = new Date().toISOString(),
): Course {
  const courseId = uid("course");
  const moduleId = uid("module");

  const lesson: Lesson = {
    id: uid("lesson"),
    title: "Untitled lesson",
    summary: "",
    order: 0,
    playbackId: "",
    playbackPolicy: "public",
    muxAssetId: null,
    muxDeleteToken: null,
    durationSec: null,
    isFreePreview: true,
    resources: [],
    createdAt: now,
    updatedAt: now,
  };

  const module: Module = {
    id: moduleId,
    title: "Module 1",
    order: 0,
    lessons: [lesson],
    createdAt: now,
    updatedAt: now,
  };

  return {
    id: courseId,
    slug: input.slug,
    title: input.title,
    subtitle: input.subtitle,
    description: input.description,
    // Studio courses carry no instructor of their own; they reuse the first
    // seed instructor so cards and rails still have a name to show.
    instructorId: input.instructorId,
    category: input.category,
    level: input.level,
    tags: [...input.tags],
    // No hero until a lesson has a video; `heroPlaybackIdFor` fills the gap.
    heroPlaybackId: "",
    heroPolicy: "public",
    heroPosterTimeSec: 2,
    priceCents: input.priceCents,
    learnOutcomes: [...DRAFT_OUTCOMES],
    modules: [module],
    status: "draft",
    source: "studio",
    featured: false,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Placeholder outcomes for a new draft.
 *
 * Three entries, because that is the schema minimum; each one says plainly that
 * it is a placeholder, so an author cannot publish one by accident.
 */
const DRAFT_OUTCOMES: readonly string[] = [
  "Replace this outcome with something the learner can actually do",
  "Replace this outcome with something the learner can actually do",
  "Replace this outcome with something the learner can actually do",
];

export type { Store };
