"use client";

/**
 * Studio authoring surfaces.
 *
 * Reordering uses visible Up/Down buttons rather than drag handles: a drag
 * interaction has no keyboard equivalent and no touch equivalent that works
 * reliably inside a scrollable list, so it would exclude a large share of the
 * people this app is built for (plan §6.7.2, §12).
 *
 * Every component here takes its data through props and reports intent through
 * callbacks, so the editor route stays a thin wiring layer.
 */

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  CircleAlert,
  Film,
  Link2,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Heading, Text } from "@/components/ui/Layout";
import { ProgressBar, Spinner } from "@/components/ui/Progress";
import { Stepper } from "@/components/compound/States";
import { EmptyState } from "@/components/compound/States";
import { cn } from "@/lib/utils/cn";
import { formatDuration } from "@/lib/utils/time";
import { uid } from "@/lib/utils/ids";
import {
  moveItem,
  normalizeOrder,
  removeById,
  updateById,
} from "@/lib/domain/curriculum";
import {
  COURSE_CATEGORIES,
  COURSE_LEVELS,
  type Course,
  type CourseCategory,
  type CourseLevel,
  type Lesson,
  type Module,
  type PlaybackPolicy,
  type StudioUploadJob,
} from "@/lib/types";

/* ------------------------------------------------------------------ */
/* StudioCourseForm                                                    */
/* ------------------------------------------------------------------ */

export interface StudioCourseFormValues {
  title: string;
  subtitle: string;
  description: string;
  category: CourseCategory;
  level: CourseLevel;
  priceCents: number;
  tags: string;
  slug: string;
}

export interface StudioCourseFormProps {
  values: StudioCourseFormValues;
  errors: Partial<Record<keyof StudioCourseFormValues, string>>;
  onChange: (values: StudioCourseFormValues) => void;
  onSubmit: () => void;
  submitting?: boolean;
  submitLabel: string;
  className?: string;
}

const PRICE_PRESETS: ReadonlyArray<{ label: string; cents: number }> = [
  { label: "Free", cents: 0 },
  { label: "$19", cents: 1900 },
  { label: "$49", cents: 4900 },
  { label: "$99", cents: 9900 },
  { label: "$149", cents: 14900 },
];

export function StudioCourseForm({
  values,
  errors,
  onChange,
  onSubmit,
  submitting = false,
  submitLabel,
  className,
}: StudioCourseFormProps) {
  const set = <K extends keyof StudioCourseFormValues>(key: K, value: StudioCourseFormValues[K]) =>
    onChange({ ...values, [key]: value });

  return (
    <form
      className={cn("flex flex-col gap-5", className)}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <Field label="Course title" error={errors.title} required>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            invalid={invalid}
            value={values.title}
            onChange={(event) => set("title", event.target.value)}
            placeholder="Cinematic Lighting for Directors"
          />
        )}
      </Field>

      <Field label="Subtitle" error={errors.subtitle} required>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            invalid={invalid}
            value={values.subtitle}
            onChange={(event) => set("subtitle", event.target.value)}
            placeholder="Shape light with intent across a three-point setup"
          />
        )}
      </Field>

      <Field
        label="Description"
        error={errors.description}
        hint={`${values.description.trim().length} / 2000 characters`}
        required
      >
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            rows={5}
            aria-describedby={describedBy}
            invalid={invalid}
            value={values.description}
            onChange={(event) => set("description", event.target.value)}
            placeholder="What the learner walks away able to do."
          />
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" error={errors.category} required>
          {({ id, describedBy, invalid }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              value={values.category}
              onChange={(event) => set("category", event.target.value as CourseCategory)}
            >
              {COURSE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Level" error={errors.level} required>
          {({ id, describedBy, invalid }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              value={values.level}
              onChange={(event) => set("level", event.target.value as CourseLevel)}
            >
              {COURSE_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-ink">Price</legend>
        <div className="flex flex-wrap gap-2">
          {PRICE_PRESETS.map((preset) => (
            <Button
              key={preset.cents}
              type="button"
              size="sm"
              variant={values.priceCents === preset.cents ? "primary" : "secondary"}
              aria-pressed={values.priceCents === preset.cents}
              onClick={() => set("priceCents", preset.cents)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </fieldset>

      <Field label="Tags" hint="Comma separated, up to 6. Used by catalog search." error={errors.tags}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            invalid={invalid}
            value={values.tags}
            onChange={(event) => set("tags", event.target.value)}
            placeholder="lighting, cinematography, colour"
          />
        )}
      </Field>

      <Field
        label="URL slug"
        hint="Must be unique across the seed catalog and your own courses."
        error={errors.slug}
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            invalid={invalid}
            value={values.slug}
            onChange={(event) => set("slug", event.target.value)}
            placeholder="cinematic-lighting-for-directors"
            spellCheck={false}
          />
        )}
      </Field>

      <div className="flex justify-end">
        <Button type="submit" loading={submitting} loadingText="Saving…">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Publish checklist                                                    */
/* ------------------------------------------------------------------ */

export interface PublishChecklistProps {
  course: Course;
  /** `null` while the course is valid. */
  blockers: readonly string[];
  onPublish: () => void;
  onUnpublish: () => void;
  publishing?: boolean;
  className?: string;
}

export function PublishChecklist({
  course,
  blockers,
  onPublish,
  onUnpublish,
  publishing = false,
  className,
}: PublishChecklistProps) {
  const ready = blockers.length === 0;

  return (
    <section
      aria-label="Publish checklist"
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-line bg-surface p-5",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <Heading level={3} as="h2" className="text-base">
          {course.status === "published" ? "Published" : "Draft"}
        </Heading>
        <Badge tone={course.status === "published" ? "success" : "neutral"}>
          {course.status === "published" ? "Live in the catalog" : "Not visible to learners"}
        </Badge>
      </div>

      {ready ? (
        <p className="flex items-start gap-2 text-sm text-success">
          <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" />
          Every lesson has a video. This course can be published.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {blockers.map((blocker) => (
            <li key={blocker} className="flex items-start gap-2 text-sm text-muted">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-gold" />
              {blocker}
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-end">
        {course.status === "published" ? (
          <Button variant="secondary" onClick={onUnpublish} loading={publishing}>
            Unpublish
          </Button>
        ) : (
          <Button onClick={onPublish} disabled={!ready} loading={publishing}>
            Publish course
          </Button>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* ModuleEditor                                                        */
/* ------------------------------------------------------------------ */

export interface ModuleEditorProps {
  modules: Module[];
  /** Lesson ids currently attached to a finished upload. */
  lessonIds?: ReadonlySet<string>;
  onChange: (modules: Module[]) => void;
  onDeleteLesson?: (moduleId: string, lesson: Lesson) => void;
  renderLessonExtras?: (lesson: Lesson) => React.ReactNode;
  className?: string;
}

export function ModuleEditor({
  modules,
  lessonIds,
  onChange,
  onDeleteLesson,
  renderLessonExtras,
  className,
}: ModuleEditorProps) {
  const commit = useCallback(
    (next: Module[]) => {
      // Order is re-normalised on every change so a delete can never leave a
      // gap that the player route would trip over.
      onChange(
        normalizeOrder(next).map((module) => ({
          ...module,
          lessons: normalizeOrder(module.lessons),
        })),
      );
    },
    [onChange],
  );

  const addModule = () => {
    const now = new Date().toISOString();
    const module: Module = {
      id: uid("module"),
      title: `Module ${modules.length + 1}`,
      order: modules.length,
      lessons: [],
      createdAt: now,
      updatedAt: now,
    };

    commit([...modules, module]);
  };

  const moveModule = (moduleId: string, direction: -1 | 1) => {
    const index = modules.findIndex((module) => module.id === moduleId);
    if (index === -1) return;

    commit(moveItem(modules, index, direction));
  };

  const renameModule = (moduleId: string, title: string) => {
    commit(
      modules.map((module) =>
        module.id === moduleId ? { ...module, title, updatedAt: new Date().toISOString() } : module,
      ),
    );
  };

  const removeModule = (moduleId: string) => {
    commit(removeById(modules, moduleId));
  };

  const moveLesson = (moduleId: string, lessonId: string, direction: -1 | 1) => {
    commit(
      modules.map((module) => {
        if (module.id !== moduleId) return module;

        const index = module.lessons.findIndex((lesson) => lesson.id === lessonId);
        if (index === -1) return module;

        return { ...module, lessons: moveItem(module.lessons, index, direction) };
      }),
    );
  };

  const updateLesson = (moduleId: string, lessonId: string, changes: Partial<Lesson>) => {
    commit(
      modules.map((module) =>
        module.id === moduleId
          ? {
              ...module,
              lessons: updateById(module.lessons, lessonId, (lesson) => ({
                ...lesson,
                ...changes,
                updatedAt: new Date().toISOString(),
              })),
            }
          : module,
      ),
    );
  };

  const addLesson = (moduleId: string) => {
    const now = new Date().toISOString();
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

    commit(
      modules.map((module) => {
        if (module.id !== moduleId) return module;
        return { ...module, lessons: [...module.lessons, lesson] };
      }),
    );
  };

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      {modules.length === 0 ? (
        <EmptyState
          title="No modules yet"
          description="A course needs at least one module before it can be published."
          action={{ label: "Add the first module", onClick: addModule }}
        />
      ) : (
        modules.map((module, moduleIndex) => (
          <section
            key={module.id}
            aria-label={`Module ${moduleIndex + 1}`}
            className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">Module {moduleIndex + 1}</Badge>

              <div className="min-w-0 flex-1">
                <Input
                  aria-label={`Title for module ${moduleIndex + 1}`}
                  value={module.title}
                  onChange={(event) => renameModule(module.id, event.target.value)}
                  className="bg-transparent"
                />
              </div>

              <IconButton
                size="sm"
                aria-label={`Move module ${moduleIndex + 1} up`}
                icon={<ArrowUp className="size-4" />}
                disabled={moduleIndex === 0}
                onClick={() => moveModule(module.id, -1)}
              />
              <IconButton
                size="sm"
                aria-label={`Move module ${moduleIndex + 1} down`}
                icon={<ArrowDown className="size-4" />}
                disabled={moduleIndex === modules.length - 1}
                onClick={() => moveModule(module.id, 1)}
              />
              <IconButton
                size="sm"
                variant="danger"
                aria-label={`Delete module ${moduleIndex + 1}`}
                icon={<Trash2 className="size-4" />}
                onClick={() => removeModule(module.id)}
              />
            </div>

            <Text size="sm" tone="muted">
              {module.lessons.length}{" "}
              {module.lessons.length === 1 ? "lesson" : "lessons"}
            </Text>

            <ul className="flex flex-col gap-3">
              {module.lessons.map((lesson, lessonIndex) => (
                <LessonRow
                  key={lesson.id}
                  lesson={lesson}
                  index={lessonIndex}
                  count={module.lessons.length}
                  hasVideo={lessonIds?.has(lesson.id) ?? Boolean(lesson.playbackId)}
                  extras={renderLessonExtras?.(lesson)}
                  onChange={(changes) => updateLesson(module.id, lesson.id, changes)}
                  onMove={(direction) => moveLesson(module.id, lesson.id, direction)}
                  onDelete={() => onDeleteLesson?.(module.id, lesson)}
                />
              ))}
            </ul>

            <div>
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<Plus className="size-4" />}
                onClick={() => addLesson(module.id)}
              >
                Add lesson
              </Button>
            </div>
          </section>
        ))
      )}

      <div>
        <Button variant="secondary" leftIcon={<Plus className="size-4" />} onClick={addModule}>
          Add module
        </Button>
      </div>
    </div>
  );
}

interface LessonRowProps {
  lesson: Lesson;
  index: number;
  count: number;
  hasVideo: boolean;
  extras?: React.ReactNode;
  onChange: (changes: Partial<Lesson>) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}

function LessonRow({
  lesson,
  index,
  count,
  hasVideo,
  extras,
  onChange,
  onMove,
  onDelete,
}: LessonRowProps) {
  const [title, setTitle] = useState(lesson.title);
  const [summary, setSummary] = useState(lesson.summary);
  const [playbackId, setPlaybackId] = useState(lesson.playbackId);

  // The parent's record is the source of truth; the local draft only exists so
  // typing is not interrupted by a re-render.
  const commitTitle = () => {
    const next = title.trim();
    if (next.length >= 3 && next !== lesson.title) onChange({ title: next });
    else setTitle(lesson.title);
  };

  const commitSummary = () => onChange({ summary: summary.slice(0, 400) });

  const commitPlaybackId = () => {
    const next = playbackId.trim();
    if (/^[A-Za-z0-9]+$/.test(next)) onChange({ playbackId: next, muxAssetId: null });
    else setPlaybackId(lesson.playbackId);
  };

  return (
    <li className="flex flex-col gap-3 rounded-md border border-line bg-elevated p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={hasVideo ? "success" : "gold"}>
          {hasVideo ? "Video attached" : "No video"}
        </Badge>

        <div className="min-w-0 flex-1">
          <Input
            aria-label={`Title for lesson ${index + 1}`}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={commitTitle}
            className="bg-transparent"
          />
        </div>

        <IconButton
          size="sm"
          aria-label={`Move lesson ${index + 1} up`}
          icon={<ArrowUp className="size-4" />}
          disabled={index === 0}
          onClick={() => onMove(-1)}
        />
        <IconButton
          size="sm"
          aria-label={`Move lesson ${index + 1} down`}
          icon={<ArrowDown className="size-4" />}
          disabled={index === count - 1}
          onClick={() => onMove(1)}
        />
        <IconButton
          size="sm"
          variant="danger"
          aria-label={`Delete lesson ${index + 1}`}
          icon={<Trash2 className="size-4" />}
          onClick={onDelete}
        />
      </div>

      <Text size="sm" tone="muted">
        <label htmlFor={`summary-${lesson.id}`} className="sr-only">
          Summary for lesson {index + 1}
        </label>
        <Textarea
          id={`summary-${lesson.id}`}
          rows={2}
          value={summary}
          placeholder="One line about what this lesson covers."
          onChange={(event) => setSummary(event.target.value)}
          onBlur={commitSummary}
        />
      </Text>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={lesson.isFreePreview}
            onChange={(event) => onChange({ isFreePreview: event.target.checked })}
            className="size-5 accent-[var(--color-gold)]"
          />
          Free preview
        </label>

        <Select
          aria-label={`Playback policy for lesson ${index + 1}`}
          value={lesson.playbackPolicy}
          onChange={(event) => onChange({ playbackPolicy: event.target.value as PlaybackPolicy })}
          className="max-w-[12rem]"
        >
          <option value="public">Public playback</option>
          <option value="signed">Signed playback</option>
        </Select>

        <span className="text-xs text-muted tabular-nums">
          {formatDuration(lesson.durationSec)}
        </span>
      </div>

      {/*
        Manual playback-ID entry keeps the Studio usable without Mux credentials
        (plan §6.7.6): text-only drafts plus a known ID still publish.
      */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={`playback-${lesson.id}`} className="text-xs text-muted">
            Mux playback ID
          </label>
          <Input
            id={`playback-${lesson.id}`}
            value={playbackId}
            onChange={(event) => setPlaybackId(event.target.value)}
            onBlur={commitPlaybackId}
            placeholder="Letters and digits only"
            spellCheck={false}
            className="mt-1"
          />
        </div>

        {extras}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* LessonUploader                                                      */
/* ------------------------------------------------------------------ */

const MuxUploader = dynamic(() => import("@mux/mux-uploader-react"), { ssr: false });

export interface LessonUploaderProps {
  /** Ask the server for an upload URL; resolves with the one-time endpoint. */
  onRequestUpload: () => Promise<string>;
  /** The browser finished sending bytes. */
  onUploaded: () => void;
  /** The upload failed before Mux ever saw the bytes. */
  onFailed: (message: string) => void;
  disabled?: boolean;
  className?: string;
}

export function LessonUploader({
  onRequestUpload,
  onUploaded,
  onFailed,
  disabled = false,
  className,
}: LessonUploaderProps) {
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prepare = useCallback(async () => {
    setPreparing(true);
    setError(null);

    try {
      setEndpoint(await onRequestUpload());
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not start the upload.",
      );
    } finally {
      setPreparing(false);
    }
  }, [onRequestUpload]);

  const reset = useCallback(() => {
    setEndpoint(null);
    setError(null);
  }, []);

  if (!endpoint) {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        <Button
          size="sm"
          variant="secondary"
          loading={preparing}
          loadingText="Preparing…"
          leftIcon={<Film className="size-4" />}
          disabled={disabled}
          onClick={() => void prepare()}
        >
          Upload a video
        </Button>

        {error ? (
          <p role="alert" className="text-xs font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/*
        The element owns the file picker and the chunked upload itself; this
        component only supplies the endpoint and reports the two outcomes the
        pipeline cares about.
      */}
      <MuxUploader
        key={endpoint}
        endpoint={endpoint}
        dynamicChunkSize
        noStatus
        onSuccess={onUploaded}
        onUploadError={(event) => {
          const detail = event.detail as { errorMessage?: string } | undefined;
          onFailed(detail?.errorMessage ?? "The upload failed before it reached Mux.");
        }}
        style={{ width: "100%" }}
      >
        <span className="sr-only">Choose a video file to upload</span>
      </MuxUploader>

      <Button size="sm" variant="ghost" leftIcon={<X className="size-4" />} onClick={reset}>
        Cancel
      </Button>

      {error ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* UploadJobList                                                       */
/* ------------------------------------------------------------------ */

export interface UploadJobListProps {
  jobs: readonly StudioUploadJob[];
  onRetry: (jobId: string) => void;
  onDismiss: (jobId: string) => void;
  onCancel: (jobId: string) => void;
  className?: string;
}

const JOB_STEPS: ReadonlyArray<StudioUploadJob["state"]> = [
  "uploading",
  "processing",
  "ready",
];

const STATE_COPY: Record<StudioUploadJob["state"], { label: string; tone: "neutral" | "gold" | "success" | "danger" }> = {
  uploading: { label: "Uploading", tone: "gold" },
  processing: { label: "Mux is processing", tone: "gold" },
  ready: { label: "Ready to attach", tone: "success" },
  errored: { label: "Failed", tone: "danger" },
};

export function UploadJobList({
  jobs,
  onRetry,
  onDismiss,
  onCancel,
  className,
}: UploadJobListProps) {
  if (jobs.length === 0) return null;

  return (
    <section aria-label="Uploads" className={cn("flex flex-col gap-3", className)}>
      <Heading level={3} as="h2" className="text-base">
        Uploads
      </Heading>

      <ul className="flex flex-col gap-3">
        {jobs.map((job) => {
          const copy = STATE_COPY[job.state];
          const stepIndex = JOB_STEPS.indexOf(job.state);

          return (
            <li
              key={job.id}
              className="flex flex-col gap-3 rounded-md border border-line bg-surface p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                  {job.lessonTitle}
                </span>
                <Badge tone={copy.tone}>
                  {job.state === "processing" ? <Spinner size="sm" label="" /> : null}
                  {copy.label}
                </Badge>
              </div>

              {job.state === "uploading" ? (
                <ProgressBar value={12} label="Uploading" size="sm" />
              ) : (
                <Stepper
                  steps={[
                    { id: "uploading", label: "Upload" },
                    { id: "processing", label: "Process" },
                    { id: "ready", label: "Attach" },
                  ]}
                  currentStepId={job.state === "errored" ? "processing" : "ready"}
                  completedStepIds={
                    job.state === "errored"
                      ? ["uploading"]
                      : JOB_STEPS.slice(0, Math.max(0, stepIndex))
                  }
                />
              )}

              {job.errorMessage ? (
                <p role="alert" className="text-xs font-medium text-danger">
                  {job.errorMessage}
                </p>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2">
                {job.state === "uploading" ? (
                  <Button size="sm" variant="ghost" onClick={() => onCancel(job.id)}>
                    Cancel
                  </Button>
                ) : null}

                {job.state === "errored" ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    leftIcon={<RefreshCw className="size-4" />}
                    onClick={() => onRetry(job.id)}
                  >
                    Retry
                  </Button>
                ) : null}

                {job.state === "ready" ? (
                  <Button size="sm" leftIcon={<CheckCircle2 className="size-4" />} onClick={() => onDismiss(job.id)}>
                    Attach to lesson
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* LessonResources                                                     */
/* ------------------------------------------------------------------ */

export interface LessonResourcesProps {
  resources: Lesson["resources"];
  onChange: (resources: Lesson["resources"]) => void;
  className?: string;
}

const RESOURCE_KINDS = ["pdf", "worksheet", "link"] as const;

export function LessonResources({ resources, onChange, className }: LessonResourcesProps) {
  const [draft, setDraft] = useState({ label: "", url: "", kind: "pdf" as (typeof RESOURCE_KINDS)[number] });
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    const label = draft.label.trim();
    const url = draft.url.trim();

    if (label.length === 0 || label.length > 80) {
      setError("Give the resource a label of 1 to 80 characters.");
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      setError("Enter a full https:// URL.");
      return;
    }

    if (parsed.protocol !== "https:") {
      setError("Resources must be served over https.");
      return;
    }

    if (resources.length >= 12) {
      setError("A lesson can hold at most 12 resources.");
      return;
    }

    onChange([...resources, { id: uid("resource"), label, url: parsed.toString(), kind: draft.kind }]);
    setDraft({ label: "", url: "", kind: draft.kind });
    setError(null);
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {resources.length === 0 ? (
        <Text size="xs" tone="muted">
          No resources attached to this lesson.
        </Text>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {resources.map((resource) => (
            <li key={resource.id} className="flex items-center gap-2">
              <Link2 aria-hidden className="size-4 shrink-0 text-muted" />
              <a
                href={resource.url}
                target="_blank"
                rel="noreferrer noopener"
                className="min-w-0 flex-1 truncate text-sm text-gold underline-offset-2 hover:underline"
              >
                {resource.label}
              </a>
              <Badge tone="neutral">{resource.kind}</Badge>
              <IconButton
                size="sm"
                variant="danger"
                aria-label={`Remove resource ${resource.label}`}
                icon={<Trash2 className="size-4" />}
                onClick={() => onChange(resources.filter((entry) => entry.id !== resource.id))}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[8rem] flex-1">
          <label htmlFor="resource-label" className="text-xs text-muted">
            Label
          </label>
          <Input
            id="resource-label"
            value={draft.label}
            onChange={(event) => setDraft({ ...draft, label: event.target.value })}
            className="mt-1"
          />
        </div>

        <div className="min-w-[12rem] flex-1">
          <label htmlFor="resource-url" className="text-xs text-muted">
            URL
          </label>
          <Input
            id="resource-url"
            type="url"
            inputMode="url"
            value={draft.url}
            onChange={(event) => setDraft({ ...draft, url: event.target.value })}
            placeholder="https://…"
            className="mt-1"
          />
        </div>

        <Select
          aria-label="Resource kind"
          value={draft.kind}
          onChange={(event) =>
            setDraft({ ...draft, kind: event.target.value as (typeof RESOURCE_KINDS)[number] })
          }
          className="max-w-[9rem]"
        >
          {RESOURCE_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {kind.charAt(0).toUpperCase() + kind.slice(1)}
            </option>
          ))}
        </Select>

        <Button size="sm" leftIcon={<Plus className="size-4" />} onClick={add}>
          Add
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Publish validation                                                  */
/* ------------------------------------------------------------------ */

/**
 * Everything standing between a draft and the catalog (plan §2.1).
 *
 * Returned as sentences rather than codes, because they are shown verbatim
 * next to the Publish button.
 */
export function publishBlockers(course: Pick<Course, "title" | "description" | "slug" | "modules">): string[] {
  const blockers: string[] = [];

  if (course.title.trim().length < 5) blockers.push("The title needs at least 5 characters.");
  if (course.description.trim().length < 30) {
    blockers.push("The description needs at least 30 characters.");
  }
  if (course.slug.trim().length < 3) blockers.push("The URL slug is required.");

  if (course.modules.length === 0) {
    blockers.push("Add at least one module.");
    return blockers;
  }

  for (const [moduleIndex, module] of course.modules.entries()) {
    if (module.lessons.length === 0) {
      blockers.push(`Module ${moduleIndex + 1} has no lessons.`);
      continue;
    }

    const missing = module.lessons.filter(
      (lesson) => lesson.playbackId.trim().length === 0,
    ).length;

    if (missing > 0) {
      blockers.push(
        `${missing} lesson${missing === 1 ? "" : "s"} in module ${moduleIndex + 1} still need a video.`,
      );
    }
  }

  return blockers;
}

/** Lesson ids that already have a playback ID. */
export function attachedLessonIds(modules: readonly Module[]): Set<string> {
  const ids = new Set<string>();

  for (const module of modules) {
    for (const lesson of module.lessons) {
      if (lesson.playbackId.trim().length > 0) ids.add(lesson.id);
    }
  }

  return ids;
}

/** Slug sanitised the same way the auto-generated one is. */
export function useSlugSuggestion(title: string): string {
  return useMemo(
    () =>
      title
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80),
    [title],
  );
}

