"use client";

/**
 * The Studio course editor (plan §6.7).
 *
 * The wiring layer for §6.7: the form, the module editor and the upload pipeline
 * are presentational components, so everything stateful lives here — saving to
 * storage, attaching a finished upload to a lesson, and purging the records a
 * deleted lesson leaves behind.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { CoursePoster } from "@/components/features/CoursePoster";
import { MuxNotConfigured } from "@/components/features/Panels";
import {
  LessonUploader,
  ModuleEditor,
  PublishChecklist,
  StudioCourseForm,
  UploadJobList,
  attachedLessonIds,
  publishBlockers,
  useSlugSuggestion,
  type StudioCourseFormValues,
} from "@/components/features/Studio";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Container, Heading, Text } from "@/components/ui/Layout";
import { Skeleton } from "@/components/ui/Progress";
import { useToast } from "@/components/ui/Toast";
import { Dialog, OverlayBody, OverlayFooter, OverlayHeader } from "@/components/compound/Overlay";
import { EmptyState } from "@/components/compound/States";
import {
  useHydrated,
  useStudioCourse,
  useTakenSlugs,
  useUploadJobs,
  type ReadyLessonPayload,
  type UseUploadJobsResult,
} from "@/hooks";
import { fetchMuxStatus, deleteMuxAsset } from "@/lib/mux/client";
import { heroPlaybackIdFor } from "@/lib/domain/totals";
import { normalizeOrder } from "@/lib/domain/curriculum";
import {
  durationsStore,
  enrollmentsStore,
  notesStore,
  progressStore,
  studioCoursesStore,
  studioJobsStore,
} from "@/lib/storage/stores";
import type { Course, Lesson, Module, StudioUploadJob } from "@/lib/types";

export function StudioCourseEditor({ courseId }: { courseId: string }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const { toast } = useToast();

  const { course, save } = useStudioCourse(courseId);
  const takenSlugs = useTakenSlugs(courseId);

  const [form, setForm] = useState<StudioCourseFormValues | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof StudioCourseFormValues, string>>>({});
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [deletingLesson, setDeletingLesson] = useState<{ moduleId: string; lesson: Lesson } | null>(null);
  const [muxConfigured, setMuxConfigured] = useState(true);
  const [hasProbed, setHasProbed] = useState(false);

  const slugSuggestion = useSlugSuggestion(form?.title ?? "");

  /*
   * Upload jobs. `onReady` attaches a finished asset to the lesson the job was
   * started from, which is why `LessonUploader` is rendered per lesson.
   *
   * The course is read from the store inside the callback rather than closed
   * over. A job finishes asynchronously, and the closure captured at the time
   * the hook was created can be several edits behind the live record, so saving
   * from it would silently discard every change made while the upload ran.
   */
  const attachLesson = useCallback(
    (job: StudioUploadJob, payload: ReadyLessonPayload) => {
      const { moduleId, lessonTitle } = job;
      if (!payload.playbackId) return;

      const live = studioCoursesStore.get()[courseId];
      if (!live) return;

      let attached = false;

      const next: Course = {
        ...live,
        modules: live.modules.map((module) => {
          if (module.id !== moduleId) return module;

          const lessons = module.lessons.map((lesson) => {
            // Match by title: a job started before a rename should still land on
            // the row the author was looking at.
            if (lesson.playbackId !== "" || lesson.title !== lessonTitle) return lesson;
            if (attached) return lesson;

            attached = true;
            return {
              ...lesson,
              playbackId: payload.playbackId,
              muxAssetId: payload.muxAssetId,
              muxDeleteToken: payload.deleteToken,
              durationSec: payload.durationSec,
              playbackPolicy: payload.policy,
              updatedAt: new Date().toISOString(),
            };
          });

          return { ...module, lessons: normalizeOrder(lessons) };
        }),
        updatedAt: new Date().toISOString(),
      };

      save(next);

      if (attached) toast({ title: "Video attached", description: lessonTitle, tone: "success" });
    },
    [courseId, save, toast],
  );

  const uploadJobs = useUploadJobs({ onReady: attachLesson });

  useEffect(() => {
    let cancelled = false;

    void fetchMuxStatus().then((status) => {
      if (cancelled) return;
      setMuxConfigured(status.configured);
      setHasProbed(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  /* Seed the form from the course exactly once. */
  useEffect(() => {
    if (!course || form) return;

    setForm({
      title: course.title,
      subtitle: course.subtitle,
      description: course.description,
      category: course.category,
      level: course.level,
      priceCents: course.priceCents,
      tags: course.tags.join(", "),
      slug: course.slug,
    });
  }, [course, form]);

  const blockers = useMemo(
    () => (course ? publishBlockers(course) : []),
    [course],
  );

  if (!hydrated) {
    return (
      <Container size="wide" className="flex flex-col gap-6 py-10">
        <Skeleton shape="block" className="h-10 w-64" />
        <Skeleton shape="block" className="h-64 w-full rounded-lg" />
        <span className="sr-only" role="status">
          Loading the editor…
        </span>
      </Container>
    );
  }

  if (!course || !form) {
    return (
      <Container size="narrow" className="py-16">
        <EmptyState
          title="Course not found"
          description="This draft does not exist in this browser."
          action={{ label: "Back to the studio", href: "/studio" }}
        />
      </Container>
    );
  }

  const jobs = uploadJobs.jobsForCourse(course.id);

  const persist = (changes: Partial<Course>) => {
    save({ ...course, ...changes, updatedAt: new Date().toISOString() });
  };

  const saveForm = () => {
    const next: Partial<Record<keyof StudioCourseFormValues, string>> = {};

    if (form.title.trim().length < 5) next.title = "Give the course a title of at least 5 characters.";
    if (form.subtitle.trim().length < 10) next.subtitle = "The subtitle needs at least 10 characters.";
    if (form.description.trim().length < 30) {
      next.description = "The description needs at least 30 characters.";
    }

    const tags = form.tags
      .split(",")
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);

    if (tags.length > 6) next.tags = "Use at most 6 tags.";
    if (tags.some((tag) => !/^[a-z0-9][a-z0-9-]*$/.test(tag) || tag.length < 2 || tag.length > 24)) {
      next.tags = "Tags are lowercase, 2–24 characters, and start with a letter or number.";
    }

    const slug = (form.slug.trim() || slugSuggestion).toLowerCase();
    if (slug.length < 3) next.slug = "The URL slug needs at least 3 characters.";

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      next.slug = "Use lowercase letters, numbers and single hyphens.";
    } else if (takenSlugs.has(slug)) {
      next.slug = "Another course already uses this slug.";
    }

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      persist({
        title: form.title.trim(),
        subtitle: form.subtitle.trim(),
        description: form.description.trim(),
        category: form.category,
        level: form.level,
        priceCents: form.priceCents,
        tags,
        slug,
      });
      toast({ title: "Course saved", tone: "success" });
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteLesson = () => {
    const target = deletingLesson;
    if (!target) return;

    const lesson = target.lesson;
    const modules = course.modules.map((module) =>
      module.id === target.moduleId
        ? {
            ...module,
            lessons: normalizeOrder(module.lessons.filter((entry) => entry.id !== lesson.id)),
          }
        : module,
    );

    persist({ modules });

    /*
     * Purge everything keyed to the lesson. Leaving progress behind would show
     * a lesson that no longer exists in the course's completion count.
     */
    progressStore.set((snapshot) => {
      const next = { ...snapshot };
      for (const key of Object.keys(next)) {
        if (next[key]?.courseId === course.id && next[key]?.lessonId === lesson.id) delete next[key];
      }
      return next;
    });

    notesStore.set((snapshot) => {
      const next = { ...snapshot };
      for (const note of Object.values(snapshot)) {
        if (note.courseId === course.id && note.lessonId === lesson.id) delete next[note.id];
      }
      return next;
    });

    durationsStore.set((snapshot) => {
      if (!(lesson.id in snapshot)) return snapshot;

      const { [lesson.id]: _removed, ...rest } = snapshot;
      return rest;
    });

    // Best effort: a failure here leaves an orphan in Mux, not a broken course.
    if (lesson.muxAssetId) void deleteMuxAsset(lesson.muxAssetId, lesson.muxDeleteToken);

    setDeletingLesson(null);
    toast({ title: "Lesson deleted", description: lesson.title });
  };

  return (
    <Container size="wide" className="flex flex-col gap-8 py-6 sm:py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <button
            type="button"
            onClick={() => router.push("/studio")}
            className="flex min-h-11 items-center gap-2 self-start text-sm text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            <ArrowLeft aria-hidden className="size-4" />
            Studio
          </button>

          <Heading level={1} as="h1" className="text-2xl sm:text-3xl">
            {course.title}
          </Heading>

          <Text size="sm" tone="muted">
            {course.status === "published"
              ? "Published — learners can find this in the catalog."
              : "Draft — visible only to you."}
          </Text>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <ButtonLink href={`/courses/${course.slug}`} variant="secondary" size="sm">
            <ExternalLink aria-hidden className="size-4" />
            View page
          </ButtonLink>
        </div>
      </header>

      {!muxConfigured && hasProbed ? <MuxNotConfigured /> : null}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <section aria-labelledby="details-heading" className="flex flex-col gap-4">
            <Heading level={2} as="h2" id="details-heading" className="text-xl">
              Details
            </Heading>

            <StudioCourseForm
              values={form}
              errors={errors}
              onChange={setForm}
              onSubmit={saveForm}
              submitting={saving}
              submitLabel="Save changes"
            />
          </section>

          <section aria-labelledby="modules-heading" className="flex flex-col gap-4">
            <Heading level={2} as="h2" id="modules-heading" className="text-xl">
              Curriculum
            </Heading>

            <ModuleEditor
              modules={course.modules}
              lessonIds={attachedLessonIds(course.modules)}
              onChange={(modules) => persist({ modules })}
              onDeleteLesson={(moduleId, lesson) => setDeletingLesson({ moduleId, lesson })}
              renderLessonExtras={(lesson) => {
                const moduleId = findModuleId(course.modules, lesson.id);

                return (
                  <LessonUploaderSlot
                    courseId={course.id}
                    moduleId={moduleId}
                    lessonTitle={lesson.title}
                    hasVideo={lesson.playbackId !== ""}
                    disabled={!muxConfigured}
                    jobs={uploadJobs}
                    onFailed={(message) =>
                      toast({ title: "Upload failed", description: message, tone: "danger", duration: 0 })
                    }
                  />
                );
              }}
            />
          </section>
        </div>

        <aside className="flex flex-col gap-4" aria-label="Publishing">
          <div className="lg:sticky lg:top-24">
            <div className="mb-4 w-full">
              <CoursePoster
                playbackId={heroPlaybackIdFor(course) ?? ""}
                width={640}
                className="rounded-lg border border-line"
              />
            </div>

            <PublishChecklist
              course={course}
              blockers={blockers}
              publishing={publishing}
              onPublish={() => {
                setPublishing(true);
                try {
                  persist({ status: "published" });
                  toast({
                    title: "Course published",
                    description: "It now appears in your catalog.",
                    tone: "success",
                  });
                } finally {
                  setPublishing(false);
                }
              }}
              onUnpublish={() => {
                setPublishing(true);
                try {
                  persist({ status: "draft" });
                  toast({ title: "Course unpublished" });
                } finally {
                  setPublishing(false);
                }
              }}
            />

            {jobs.length > 0 ? (
              <UploadJobList
                className="mt-4"
                jobs={jobs}
                onRetry={uploadJobs.retry}
                onCancel={uploadJobs.cancel}
                onDismiss={uploadJobs.dismiss}
              />
            ) : null}
          </div>
        </aside>
      </div>

      <Dialog open={deletingLesson !== null} onClose={() => setDeletingLesson(null)}>
        <OverlayHeader
          title={`Delete “${deletingLesson?.lesson.title ?? ""}”?`}
          description="The video is deleted from Mux as well, and its progress and notes are purged."
        />

        <OverlayBody>
          <Text tone="muted" size="sm">
            This cannot be undone. If the Mux delete fails the asset is left behind
            on your account, but the lesson disappears from the course either way.
          </Text>
        </OverlayBody>

        <OverlayFooter>
          <Button variant="ghost" onClick={() => setDeletingLesson(null)}>
            Keep lesson
          </Button>
          <Button variant="danger" onClick={confirmDeleteLesson}>
            Delete lesson
          </Button>
        </OverlayFooter>
      </Dialog>
    </Container>
  );
}

/* ------------------------------------------------------------------ */
/* Upload slot                                                         */
/* ------------------------------------------------------------------ */

/**
 * The uploader for one lesson.
 *
 * It asks for a direct-upload URL, hands it to Mux Uploader, and reports the
 * bytes landing. Polling from `ended` onwards belongs to `useUploadJobs`, which
 * survives a page refresh.
 *
 * The job id is captured at `begin()` and held in a ref, so the completion
 * callback names the job it actually started. Guessing it from the store by
 * title and timestamp is a race: two uploads in one module, or a retried
 * request, would advance whichever record happened to sort first.
 */
function LessonUploaderSlot({
  courseId,
  moduleId,
  lessonTitle,
  hasVideo,
  disabled,
  jobs,
  onFailed,
}: {
  courseId: string;
  moduleId: string;
  lessonTitle: string;
  hasVideo: boolean;
  disabled: boolean;
  jobs: UseUploadJobsResult;
  onFailed: (message: string) => void;
}) {
  const jobIdRef = useRef<string | null>(null);

  useEffect(() => {
    // A different lesson means any captured id belongs to the previous upload.
    jobIdRef.current = null;
  }, [lessonTitle]);

  if (!moduleId) return null;

  // A lesson that already has a video shows its state instead of an uploader;
  // replacing an existing video means deleting it first, which is a decision
  // the author should make deliberately.
  if (hasVideo) {
    return (
      <Text size="xs" tone="muted" className="self-center">
        Video attached
      </Text>
    );
  }

  return (
    <LessonUploader
      disabled={disabled}
      onRequestUpload={async () => {
        const { job, url } = await jobs.begin({
          courseId,
          moduleId,
          lessonTitle,
          policy: "public",
        });

        jobIdRef.current = job.id;
        return url;
      }}
      onUploaded={() => {
        const jobId = jobIdRef.current;
        if (jobId === null) return;

        jobs.markUploaded(jobId);
        jobIdRef.current = null;
      }}
      onFailed={onFailed}
    />
  );
}

/** Which module a lesson lives in, or `""` when it is orphaned. */
function findModuleId(modules: Module[], lessonId: string): string {
  for (const module of modules) {
    if (module.lessons.some((lesson) => lesson.id === lessonId)) return module.id;
  }

  return "";
}
