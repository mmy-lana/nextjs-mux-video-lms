/**
 * Domain feature components.
 *
 * These take their data through props and never read the stores, so each one is
 * testable in isolation and reusable from a Server Component. The hooks that
 * wire them to real data land in Phase 4.
 */

export { AppShell } from "./AppShell";
export type { AppShellProps } from "./AppShell";

export { activeFilterCount, CatalogFilters, SEARCH_DEBOUNCE_MS } from "./CatalogFilters";
export type { CatalogFiltersProps } from "./CatalogFilters";

export { ContinueWatchingRail } from "./ContinueWatchingRail";
export type { ContinueEntry, ContinueWatchingRailProps } from "./ContinueWatchingRail";

export { CourseCard, CourseRail } from "./CourseCard";
export type { CourseCardProps, CourseRailProps } from "./CourseCard";

export { CoursePoster } from "./CoursePoster";
export type { CoursePosterProps } from "./CoursePoster";

export { CurriculumList, LessonSidebar } from "./CurriculumList";
export type {
  CurriculumListProps,
  LessonSidebarProps,
  LessonState,
} from "./CurriculumList";

export { EnrollPanel } from "./EnrollPanel";
export type { EnrollPanelProps } from "./EnrollPanel";

export { HeroBillboard } from "./HeroBillboard";
export type { HeroBillboardProps } from "./HeroBillboard";

export { LessonTabs } from "./LessonTabs";
export type { LessonTabValue, LessonTabsProps } from "./LessonTabs";

export {
  AutoplayCountdown,
  MAX_NOTES_PER_LESSON,
  NotesPanel,
} from "./NotesPanel";
export type { AutoplayCountdownProps, NotesPanelProps } from "./NotesPanel";

export {
  attachedLessonIds,
  LessonResources,
  LessonUploader,
  ModuleEditor,
  PublishChecklist,
  StudioCourseForm,
  UploadJobList,
  useSlugSuggestion,
} from "./Studio";
export type {
  LessonResourcesProps,
  LessonUploaderProps,
  ModuleEditorProps,
  PublishChecklistProps,
  StudioCourseFormProps,
  StudioCourseFormValues,
  UploadJobListProps,
} from "./Studio";

export { default as VideoPlayer, PlayerSkeleton, describePlaybackError } from "./VideoPlayer";
export type { VideoPlayerProps } from "./VideoPlayer";

export {
  CertificateActions,
  CertificateView,
  InstructorCard,
  MuxNotConfigured,
  StreakCard,
} from "./Panels";
export type {
  CertificateActionsProps,
  CertificateViewProps,
  InstructorCardProps,
  StreakCardProps,
} from "./Panels";
