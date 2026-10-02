/**
 * The app's hooks: stores in, reactive view models out.
 *
 * Everything here is client-side by necessity — they read `localStorage` and
 * browser APIs — so Server Components receive their data as props and mount
 * these only at the leaves that need live state.
 */

export { useActivity } from "./useActivity";
export type { UseActivityResult } from "./useActivity";

export { useAutoplayNext } from "./useAutoplayNext";
export type {
  AutoplayReason,
  UseAutoplayNextInput,
  UseAutoplayNextResult,
} from "./useAutoplayNext";

export { useCatalog } from "./useCatalog";
export type { UseCatalogResult } from "./useCatalog";

export { useCourseProgress } from "./useCourseProgress";
export type { UseCourseProgressResult } from "./useCourseProgress";

export { useDurations, useLessonDuration, DURATION_EPSILON_SEC } from "./useDurations";
export type { UseDurationsResult } from "./useDurations";

export { useCourseEnrollment, useEnrollment } from "./useEnrollment";
export type { UseEnrollmentResult } from "./useEnrollment";

export { useHydrated } from "./useHydrated";

export { useLessonProgress } from "./useLessonProgress";
export type { UseLessonProgressResult } from "./useLessonProgress";

export { useNotes } from "./useNotes";
export type { UseNotesResult } from "./useNotes";

export { usePlayerSettings } from "./usePlayerSettings";
export type { UsePlayerSettingsResult } from "./usePlayerSettings";

export type { PlaybackRate } from "./usePlayerSettings";

export { useProfile } from "./useProfile";
export type { UseProfileResult } from "./useProfile";

export { useProgressTracker, TICK_THROTTLE_MS } from "./useProgressTracker";
export type { UseProgressTrackerInput, UseProgressTrackerResult } from "./useProgressTracker";

export { useStudioCourse, useStudioCourses, useTakenSlugs, uniqueSlug } from "./useStudioCourse";
export type { CreateDraftInput, UseStudioCoursesResult } from "./useStudioCourse";

export { useQuotaToasts, useToast } from "./useToast";
export type { Toast, ToastInput, ToastTone } from "./useToast";

export {
  TOKEN_REFRESH_MARGIN_MS,
  TOKEN_TTL_SEC,
  useUploadJobs,
} from "./useUploadJobs";
export type {
  ReadyLessonPayload,
  UseUploadJobsOptions,
  UseUploadJobsResult,
} from "./useUploadJobs";