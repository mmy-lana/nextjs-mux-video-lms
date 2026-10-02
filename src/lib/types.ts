/**
 * Canonical domain types for the LMS.
 *
 * Every persisted entity carries `id`, `createdAt` and `updatedAt` (ISO 8601 UTC
 * strings) so records can be round-tripped through localStorage and merged with
 * the static seed catalog without losing provenance.
 *
 * The zod mirrors of these interfaces live in `lib/schemas.ts`; the two files are
 * kept in lockstep and the ranges documented here are enforced there.
 */

/** ISO 8601 timestamp in UTC, e.g. `2026-01-31T09:15:00.000Z`. */
export type ISODate = string;

/** Opaque identifier. Seed ids are stable slugs; runtime ids use `crypto.randomUUID()`. */
export type ID = string;

export type CourseLevel = "beginner" | "intermediate" | "advanced";

export type CourseCategory =
  | "creative"
  | "business"
  | "technology"
  | "writing"
  | "music"
  | "food"
  | "wellness"
  | "science";

export type PlaybackPolicy = "public" | "signed";

export type CourseStatus = "draft" | "published";

export type CourseSource = "seed" | "studio";

export interface Instructor {
  id: ID;
  /** 2–60 chars. */
  name: string;
  /** 5–120 chars. */
  headline: string;
  /** 20–800 chars. */
  bio: string;
  /** Two hex colors rendered as a gradient initials avatar. */
  avatarGradient: [string, string];
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type LessonResourceKind = "pdf" | "link" | "worksheet";

export interface LessonResource {
  id: ID;
  /** 1–80 chars. */
  label: string;
  /** Absolute https URL. */
  url: string;
  kind: LessonResourceKind;
}

export interface Lesson {
  id: ID;
  /** 3–120 chars. */
  title: string;
  /** 0–400 chars. */
  summary: string;
  /** 0-based within its module, contiguous after `normalizeOrder`. */
  order: number;
  /** Mux playback ID, 1–200 chars, `[A-Za-z0-9]+`. */
  playbackId: string;
  playbackPolicy: PlaybackPolicy;
  /** Present for studio uploads. */
  muxAssetId: string | null;
  /** `null` until the real duration is learned from the player (see D5). */
  durationSec: number | null;
  isFreePreview: boolean;
  resources: LessonResource[];
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface Module {
  id: ID;
  /** 3–100 chars. */
  title: string;
  /** 0-based on the course, contiguous after `normalizeOrder`. */
  order: number;
  /** At least one lesson is required before a course may be published. */
  lessons: Lesson[];
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface Course {
  id: ID;
  /** kebab-case, 3–80 chars, unique across seed + studio. */
  slug: string;
  /** 5–100 chars. */
  title: string;
  /** 10–160 chars. */
  subtitle: string;
  /** 30–2000 chars. */
  description: string;
  instructorId: ID;
  category: CourseCategory;
  level: CourseLevel;
  /** 0–6 items, each 2–24 chars, lowercase. */
  tags: string[];
  /** Playback ID used for the poster and the optional trailer. */
  heroPlaybackId: string;
  heroPolicy: PlaybackPolicy;
  /** Seconds into the hero video used for its poster frame; >= 0. */
  heroPosterTimeSec: number;
  /** Integer cents; `0` means free. */
  priceCents: number;
  /** 3–8 items, each 5–120 chars. */
  learnOutcomes: string[];
  /** At least one module is required to publish. */
  modules: Module[];
  status: CourseStatus;
  source: CourseSource;
  featured: boolean;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface LearnerProfile {
  id: ID;
  /** Also sent to Mux Data as `viewer_user_id`. */
  displayName: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface Enrollment {
  id: ID;
  courseId: ID;
  enrolledAt: ISODate;
  lastLessonId: ID | null;
  completedAt: ISODate | null;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface LessonProgress {
  /** `=== `${courseId}:${lessonId}``. */
  id: ID;
  courseId: ID;
  lessonId: ID;
  /** Last known playhead position, >= 0. */
  positionSec: number;
  /** Sorted, unique indexes of watched 10 second segments. */
  watchedSegments: number[];
  completed: boolean;
  completedAt: ISODate | null;
  /** True when the learner toggled the state by hand. */
  manuallyCompleted: boolean;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface Note {
  id: ID;
  courseId: ID;
  lessonId: ID;
  /** Playhead position the note was pinned to, >= 0. */
  timestampSec: number;
  /** 1–1000 chars. */
  body: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/** Playback rates offered by the player, in the order they are surfaced. */
export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export type PlaybackRate = (typeof PLAYBACK_RATES)[number];

export interface PlayerSettings {
  playbackRate: PlaybackRate;
  autoplayNext: boolean;
  /** 0–1. */
  volume: number;
  muted: boolean;
}

export interface ActivityDay {
  /** `=== YYYY-MM-DD` in the learner's local time zone. */
  id: ID;
  date: string;
  secondsWatched: number;
  lessonsCompleted: number;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type UploadJobState = "uploading" | "processing" | "ready" | "errored";

export interface StudioUploadJob {
  id: ID;
  courseId: ID;
  moduleId: ID;
  lessonTitle: string;
  muxUploadId: string;
  muxAssetId: ID | null;
  playbackId: ID | null;
  durationSec: number | null;
  state: UploadJobState;
  errorMessage: string | null;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type ApiErrorCode =
  | "MUX_NOT_CONFIGURED"
  | "VALIDATION_FAILED"
  | "FORBIDDEN_ORIGIN"
  | "NOT_FOUND"
  | "UPSTREAM_FAILED"
  | "RATE_LIMITED";

export interface ApiError {
  error: { code: ApiErrorCode; message: string };
}

/* ------------------------------------------------------------------ */
/* API request / response contracts                                     */
/* ------------------------------------------------------------------ */

export interface CreateUploadRequest {
  policy: PlaybackPolicy;
}

export interface CreateUploadResponse {
  uploadId: string;
  url: string;
}

export type UploadStatus =
  | "waiting"
  | "asset_created"
  | "errored"
  | "cancelled"
  | "timed_out";

export interface UploadStatusResponse {
  status: UploadStatus;
  assetId: string | null;
  errorMessage: string | null;
}

export type AssetStatus = "preparing" | "ready" | "errored";

export interface AssetStatusResponse {
  status: AssetStatus;
  playbackId: string | null;
  durationSec: number | null;
  errorMessage: string | null;
}

export interface DeleteAssetResponse {
  deleted: true;
}

export interface CreateTokenRequest {
  playbackId: string;
}

export interface PlaybackTokens {
  playback: string;
  thumbnail: string;
  storyboard: string;
}

export interface CreateTokenResponse extends PlaybackTokens {
  /** Unix seconds at which `playback` stops being accepted by Mux. */
  expiresAt: number;
}

/* ------------------------------------------------------------------ */
/* Query / view models                                                  */
/* ------------------------------------------------------------------ */

export const COURSE_CATEGORIES: readonly CourseCategory[] = [
  "creative",
  "business",
  "technology",
  "writing",
  "music",
  "food",
  "wellness",
  "science",
] as const;

export const COURSE_LEVELS: readonly CourseLevel[] = [
  "beginner",
  "intermediate",
  "advanced",
] as const;

export type CatalogSort = "relevance" | "newest" | "shortest" | "title";

export const CATALOG_SORTS: readonly CatalogSort[] = [
  "relevance",
  "newest",
  "shortest",
  "title",
] as const;

export interface CatalogQuery {
  q: string;
  category: CourseCategory | "all";
  level: CourseLevel | "all";
  sort: CatalogSort;
}

export const DEFAULT_CATALOG_QUERY: CatalogQuery = {
  q: "",
  category: "all",
  level: "all",
  sort: "relevance",
};

/** A lesson flattened in curriculum order, carrying its module context. */
export interface FlatLesson {
  lesson: Lesson;
  module: Module;
  moduleIndex: number;
  lessonIndex: number;
  /** 1-based position across the whole course, for "Lesson 4 of 21" copy. */
  position: number;
}

export interface CourseTotals {
  moduleCount: number;
  lessonCount: number;
  /** Sum of known lesson durations, or `null` while any duration is unknown. */
  totalDurationSec: number | null;
  knownDurationCount: number;
}

export interface CourseWithInstructor extends Course {
  instructor: Instructor;
}
