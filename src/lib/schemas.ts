/**
 * Zod mirrors of the interfaces in `lib/types.ts`.
 *
 * Every persisted record is parsed with these schemas before it is trusted
 * (see `lib/storage/createStore.ts`). Ranges documented in `types.ts` are
 * enforced here, and the cross-field rules from plan §2.1 live in
 * `validateCourseForPublish` / `coursePublishBlockers`.
 */

import { z } from "zod";

import {
  CATALOG_SORTS,
  COURSE_CATEGORIES,
  COURSE_LEVELS,
  PLAYBACK_RATES,
  type ApiErrorCode,
  type Course,
  type CourseCategory,
  type CourseLevel,
  type PlaybackRate,
} from "./types";

/**
 * Mux playback IDs are opaque base62 identifiers.
 *
 * The empty string is allowed on *stored* course data — a Studio draft lesson
 * or hero legitimately has no video yet — so the `min(1)` constraints that
 * matter live on the API payloads and on the publish checklist instead.
 */
const PLAYBACK_ID_PATTERN = /^$|^[A-Za-z0-9]+$/;

/** Kebab-case slugs, 3–80 chars, matching the generated shape. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** `YYYY-MM-DD` local calendar day. */
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const ISO_DATE = z.iso.datetime({ offset: true });

export const apiErrorCodeSchema = z.enum([
  "MUX_NOT_CONFIGURED",
  "VALIDATION_FAILED",
  "FORBIDDEN_ORIGIN",
  "NOT_FOUND",
  "UPSTREAM_FAILED",
  "RATE_LIMITED",
]) satisfies z.ZodType<ApiErrorCode>;

export const courseCategorySchema = z.enum(COURSE_CATEGORIES) satisfies z.ZodType<CourseCategory>;

export const courseLevelSchema = z.enum(COURSE_LEVELS) satisfies z.ZodType<CourseLevel>;

export const playbackPolicySchema = z.enum(["public", "signed"]);

export const courseStatusSchema = z.enum(["draft", "published"]);

export const courseSourceSchema = z.enum(["seed", "studio"]);

export const playbackRateSchema = z
  .number()
  .refine(
    (value): value is PlaybackRate =>
      (PLAYBACK_RATES as readonly number[]).includes(value),
    { message: "Unsupported playback rate" },
  );

export const localDateSchema = z.string().regex(LOCAL_DATE_PATTERN, "Expected YYYY-MM-DD");

/* ------------------------------------------------------------------ */
/* Entities                                                            */
/* ------------------------------------------------------------------ */

export const instructorSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().trim().min(2).max(60),
  headline: z.string().trim().min(5).max(120),
  bio: z.string().trim().min(20).max(800),
  avatarGradient: z.tuple([hexColorString(), hexColorString()]),
  createdAt: ISO_DATE,
  updatedAt: ISO_DATE,
});

function hexColorString() {
  return z.string().regex(HEX_COLOR_PATTERN, "Expected a hex color");
}

export const lessonResourceSchema = z.object({
  id: z.string().min(1).max(120),
  label: z.string().trim().min(1).max(80),
  url: z.string().url().startsWith("https://", "Resources must use https"),
  kind: z.enum(["pdf", "link", "worksheet"]),
});

export const lessonSchema = z.object({
  id: z.string().min(1).max(120),
  title: z.string().trim().min(3).max(120),
  summary: z.string().trim().max(400),
  order: z.number().int().min(0),
  /*
   * Empty means "no video attached yet", which is the normal state of a Studio
   * draft lesson (plan §6.7.6). Publishing is what requires a real ID; see
   * `publishBlockers`.
   */
  playbackId: z
    .string()
    .max(200)
    .regex(PLAYBACK_ID_PATTERN, "Playback IDs may only contain letters and digits"),
  // Hex token of variable length, or absent for a lesson with no upload.
  muxDeleteToken: z
    .string()
    .max(128)
    .regex(/^[a-f0-9]+$/, "Delete capabilities are lowercase hexadecimal")
    .nullable(),
  playbackPolicy: playbackPolicySchema,
  muxAssetId: z.string().min(1).max(200).nullable(),
  durationSec: z.number().positive().finite().nullable(),
  isFreePreview: z.boolean(),
  resources: z.array(lessonResourceSchema).max(20),
  createdAt: ISO_DATE,
  updatedAt: ISO_DATE,
});

export const moduleSchema = z.object({
  id: z.string().min(1).max(120),
  title: z.string().trim().min(3).max(100),
  order: z.number().int().min(0),
  lessons: z.array(lessonSchema),
  createdAt: ISO_DATE,
  updatedAt: ISO_DATE,
});

export const courseSchema = z.object({
  id: z.string().min(1).max(120),
  slug: z
    .string()
    .min(3)
    .max(80)
    .regex(SLUG_PATTERN, "Slugs must be kebab-case"),
  title: z.string().trim().min(5).max(100),
  subtitle: z.string().trim().min(10).max(160),
  description: z.string().trim().min(30).max(2000),
  instructorId: z.string().min(1).max(120),
  category: courseCategorySchema,
  level: courseLevelSchema,
  tags: z
    .array(z.string().trim().min(2).max(24).regex(/^[a-z0-9][a-z0-9-]*$/, "Tags must be lowercase"))
    .max(6),
  /*
   * A draft may have no hero yet. An empty string is valid here and resolves at
   * read time from the first lesson that has a video, so a course is never
   * published without a poster (see `heroPlaybackIdFor`).
   */
  heroPlaybackId: z
    .string()
    .max(200)
    .regex(PLAYBACK_ID_PATTERN, "Playback IDs may only contain letters and digits"),
  heroPolicy: playbackPolicySchema,
  heroPosterTimeSec: z.number().min(0).finite(),
  priceCents: z.number().int().min(0),
  learnOutcomes: z.array(z.string().trim().min(5).max(120)).min(3).max(8),
  modules: z.array(moduleSchema),
  status: courseStatusSchema,
  source: courseSourceSchema,
  featured: z.boolean(),
  createdAt: ISO_DATE,
  updatedAt: ISO_DATE,
});

export const learnerProfileSchema = z.object({
  id: z.string().min(1).max(120),
  displayName: z.string().trim().min(1).max(40),
  createdAt: ISO_DATE,
  updatedAt: ISO_DATE,
});

export const enrollmentSchema = z.object({
  id: z.string().min(1).max(120),
  courseId: z.string().min(1).max(120),
  enrolledAt: ISO_DATE,
  lastLessonId: z.string().min(1).max(120).nullable(),
  completedAt: ISO_DATE.nullable(),
  createdAt: ISO_DATE,
  updatedAt: ISO_DATE,
});

export const lessonProgressSchema = z.object({
  id: z.string().min(3).max(260),
  courseId: z.string().min(1).max(120),
  lessonId: z.string().min(1).max(120),
  positionSec: z.number().min(0).finite(),
  watchedSegments: z.array(z.number().int().min(0)).max(100_000),
  completed: z.boolean(),
  completedAt: ISO_DATE.nullable(),
  manuallyCompleted: z.boolean(),
  createdAt: ISO_DATE,
  updatedAt: ISO_DATE,
});

export const noteSchema = z.object({
  id: z.string().min(1).max(120),
  courseId: z.string().min(1).max(120),
  lessonId: z.string().min(1).max(120),
  timestampSec: z.number().min(0).finite(),
  body: z.string().trim().min(1).max(1000),
  createdAt: ISO_DATE,
  updatedAt: ISO_DATE,
});

export const playerSettingsSchema = z.object({
  playbackRate: playbackRateSchema,
  autoplayNext: z.boolean(),
  volume: z.number().min(0).max(1),
  muted: z.boolean(),
});

export const activityDaySchema = z.object({
  id: localDateSchema,
  date: localDateSchema,
  secondsWatched: z.number().min(0).finite(),
  lessonsCompleted: z.number().int().min(0),
  createdAt: ISO_DATE,
  updatedAt: ISO_DATE,
});

export const studioUploadJobSchema = z.object({
  id: z.string().min(1).max(120),
  courseId: z.string().min(1).max(120),
  moduleId: z.string().min(1).max(120),
  lessonTitle: z.string().trim().min(1).max(120),
  muxUploadId: z.string().min(1).max(200),
  muxAssetId: z.string().min(1).max(200).nullable(),
  playbackId: z.string().min(1).max(200).nullable(),
  durationSec: z.number().positive().finite().nullable(),
  state: z.enum(["uploading", "processing", "ready", "errored"]),
  errorMessage: z.string().max(500).nullable(),
  // Persisted because a job resumed after a refresh has to finish with the same
  // playback policy the upload was created with.
  policy: z.enum(["public", "signed"]),
  // Persisted because the delete happens long after the upload, possibly in a
  // different session, and the capability cannot be reissued.
  deleteToken: z
    .string()
    .max(128)
    .regex(/^[a-f0-9]+$/, "Delete capabilities are lowercase hexadecimal")
    .nullable(),
  createdAt: ISO_DATE,
  updatedAt: ISO_DATE,
});

/* ------------------------------------------------------------------ */
/* Persisted collections                                               */
/* ------------------------------------------------------------------ */

/** `Record<courseId, Enrollment>` */
export const enrollmentRecordSchema = z.record(
  z.string(),
  enrollmentSchema,
  { error: () => ({ message: "Malformed enrollment map" }) },
);

/** `Record<"courseId:lessonId", LessonProgress>` */
export const progressRecordSchema = z.record(z.string(), lessonProgressSchema, {
  error: () => ({ message: "Malformed progress map" }),
});

/** `Record<noteId, Note>` */
export const noteRecordSchema = z.record(z.string(), noteSchema, {
  error: () => ({ message: "Malformed note map" }),
});

/** `Record<lessonId, durationSeconds>` */
export const durationRecordSchema = z.record(
  z.string(),
  z.number().positive().finite(),
  { error: () => ({ message: "Malformed duration map" }) },
);

/** `Record<YYYY-MM-DD, ActivityDay>` */
export const activityRecordSchema = z.record(z.string(), activityDaySchema, {
  error: () => ({ message: "Malformed activity map" }),
});

/** `Record<courseId, Course>` for studio-created courses. */
export const studioCourseRecordSchema = z.record(z.string(), courseSchema, {
  error: () => ({ message: "Malformed studio course map" }),
});

/** `Record<jobId, StudioUploadJob>` */
export const studioJobRecordSchema = z.record(z.string(), studioUploadJobSchema, {
  error: () => ({ message: "Malformed upload job map" }),
});

/** `lms.v1.schema` migration cursor. */
export const schemaVersionSchema = z.object({ version: z.number().int().min(0) });

/* ------------------------------------------------------------------ */
/* API payloads                                                        */
/* ------------------------------------------------------------------ */

export const createUploadRequestSchema = z.object({ policy: playbackPolicySchema });

export const createTokenRequestSchema = z.object({
  playbackId: z
    .string()
    .min(1)
    .max(200)
    .regex(PLAYBACK_ID_PATTERN, "Playback IDs may only contain letters and digits"),
});

/**
 * A Mux resource id (upload, asset or playback).
 *
 * Playback IDs are strictly base62, but upload and asset ids may also contain
 * `-` and `_`. Underscores and dashes are allowed while path separators and
 * whitespace are not, so an id can never be used to traverse or inject into a
 * URL.
 */
export const muxIdParamSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9_-]+$/, "Invalid Mux identifier"),
});

export const catalogSortSchema = z.enum(CATALOG_SORTS);

export const catalogQuerySchema = z.object({
  q: z.string().max(120).default(""),
  category: z.union([courseCategorySchema, z.literal("all")]).default("all"),
  level: z.union([courseLevelSchema, z.literal("all")]).default("all"),
  sort: catalogSortSchema.default("relevance"),
});

/* ------------------------------------------------------------------ */
/* Record repair helpers                                                */
/* ------------------------------------------------------------------ */

/**
 * Validate a single record, returning `null` when it is unusable.
 *
 * Used by the storage layer so one bad entry never invalidates a whole map.
 */
export function parseRecord<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> | null {
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}

/** Keys of a record map that failed `schema` validation, for diagnostics. */
export function invalidRecordKeys<S extends z.ZodType>(
  schema: S,
  value: unknown,
): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [];
  }
  return Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => !schema.safeParse(entry).success)
    .map(([key]) => key);
}

/* ------------------------------------------------------------------ */
/* Cross-field rules (plan §2.1)                                       */
/* ------------------------------------------------------------------ */

export interface PublishBlocker {
  /** Stable machine key, used for test assertions and list keys. */
  code:
    | "no-modules"
    | "empty-module"
    | "missing-playback-id"
    | "outcomes-too-few"
    | "outcomes-too-many"
    | "order-not-contiguous";
  message: string;
  /** Module and lesson ids the blocker points at, when applicable. */
  path: { moduleId?: string; lessonId?: string };
}

/**
 * The checklist a course must satisfy to move to `published`.
 *
 * A course needs at least one module, every module needs at least one lesson,
 * every lesson needs a usable playback ID, and `order` values must be
 * contiguous from 0 in both dimensions.
 */
export function coursePublishBlockers(course: Course): PublishBlocker[] {
  const blockers: PublishBlocker[] = [];

  if (course.modules.length === 0) {
    blockers.push({
      code: "no-modules",
      message: "Add at least one module before publishing.",
      path: {},
    });
  }

  if (course.learnOutcomes.length < 3) {
    blockers.push({
      code: "outcomes-too-few",
      message: "List at least three learning outcomes.",
      path: {},
    });
  }

  if (course.learnOutcomes.length > 8) {
    blockers.push({
      code: "outcomes-too-many",
      message: "Keep learning outcomes to eight or fewer.",
      path: {},
    });
  }

  if (!isContiguous(course.modules.map((module) => module.order))) {
    blockers.push({
      code: "order-not-contiguous",
      message: "Module order values must run 0, 1, 2… with no gaps.",
      path: {},
    });
  }

  for (const module of course.modules) {
    if (module.lessons.length === 0) {
      blockers.push({
        code: "empty-module",
        message: `“${module.title}” has no lessons yet.`,
        path: { moduleId: module.id },
      });
    }

    if (!isContiguous(module.lessons.map((lesson) => lesson.order))) {
      blockers.push({
        code: "order-not-contiguous",
        message: `Lesson order inside “${module.title}” must run 0, 1, 2… with no gaps.`,
        path: { moduleId: module.id },
      });
    }

    for (const lesson of module.lessons) {
      if (lesson.playbackId.trim().length === 0) {
        blockers.push({
          code: "missing-playback-id",
          message: `“${lesson.title}” is missing a playback ID.`,
          path: { moduleId: module.id, lessonId: lesson.id },
        });
      }
    }
  }

  return blockers;
}

/** True when the course satisfies every publish requirement of plan §2.1. */
export function validateCourseForPublish(course: Course): boolean {
  return coursePublishBlockers(course).length === 0;
}

function isContiguous(values: number[]): boolean {
  return values.every((value, index) => value === index);
}

