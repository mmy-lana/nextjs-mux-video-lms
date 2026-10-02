"use client";

/**
 * Studio dashboard.
 *
 * Two states matter here, and the plan asks for both. Without Mux credentials
 * the Studio is still fully usable for text-only drafts — that is a supported
 * mode, not a broken one — so the notice explains what is missing and what
 * still works rather than replacing the page with an apology.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Plus, Trash2 } from "lucide-react";

import { CoursePoster } from "@/components/features/CoursePoster";
import { MuxNotConfigured } from "@/components/features/Panels";
import {
  StudioCourseForm,
  UploadJobList,
  useSlugSuggestion,
  type StudioCourseFormValues,
} from "@/components/features/Studio";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Container, Heading, Text } from "@/components/ui/Layout";
import { Skeleton } from "@/components/ui/Progress";
import { useToast } from "@/components/ui/Toast";
import { Dialog, OverlayBody, OverlayFooter, OverlayHeader } from "@/components/compound/Overlay";
import { EmptyState } from "@/components/compound/States";
import { useHydrated, useStudioCourses, useUploadJobs } from "@/hooks";
import { fetchMuxStatus } from "@/lib/mux/client";
import { heroPlaybackIdFor } from "@/lib/domain/totals";
import { formatRelativeDate } from "@/lib/utils/time";
import type { Course } from "@/lib/types";

const EMPTY_FORM: StudioCourseFormValues = {
  title: "",
  subtitle: "",
  description: "",
  category: "creative",
  level: "beginner",
  priceCents: 4900,
  tags: "",
  slug: "",
};

export default function StudioPage() {
  const hydrated = useHydrated();
  const router = useRouter();
  const { toast } = useToast();
  const { courses, drafts, published, createDraft, remove } = useStudioCourses();
  const uploadJobs = useUploadJobs();

  const [creating, setCreating] = useState(false);
  const [values, setValues] = useState<StudioCourseFormValues>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof StudioCourseFormValues, string>>>({});
  const [mux, setMux] = useState<{ configured: boolean; signing: boolean } | null>(null);

  const slugSuggestion = useSlugSuggestion(values.title);
  const effectiveSlug = values.slug.trim() || slugSuggestion;

  const activeJobs = useMemo(
    () => uploadJobs.jobs.filter((job) => job.state !== "ready"),
    [uploadJobs.jobs],
  );

  /*
   * Asked once, on load, so the UI knows what it can offer before the author
   * commits to anything. A failure is the same answer as "not configured".
   */
  const probe = useCallback(() => {
    let cancelled = false;

    void fetchMuxStatus().then((status) => {
      if (!cancelled) setMux(status);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => probe(), [probe]);

  if (!hydrated) {
    return (
      <Container size="wide" className="flex flex-col gap-6 py-10">
        <Skeleton shape="block" className="h-10 w-56" />
        <Skeleton shape="block" className="h-40 w-full rounded-lg" />
        <span className="sr-only" role="status">
          Loading the studio…
        </span>
      </Container>
    );
  }

  const submit = () => {
    const next: Partial<Record<keyof StudioCourseFormValues, string>> = {};

    if (values.title.trim().length < 5) next.title = "Give the course a title of at least 5 characters.";
    if (values.subtitle.trim().length < 10) next.subtitle = "The subtitle needs at least 10 characters.";
    if (values.description.trim().length < 30) {
      next.description = "The description needs at least 30 characters.";
    }

    const tags = values.tags
      .split(",")
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);

    if (tags.length > 6) {
      next.tags = "Use at most 6 tags.";
    } else if (tags.some((tag) => !/^[a-z0-9][a-z0-9-]*$/.test(tag) || tag.length < 2 || tag.length > 24)) {
      next.tags = "Tags are lowercase, 2–24 characters, and start with a letter or number.";
    }

    if (effectiveSlug.length < 3) next.slug = "The URL slug needs at least 3 characters.";

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const course = createDraft({
      title: values.title.trim(),
      subtitle: values.subtitle.trim(),
      description: values.description.trim(),
      category: values.category,
      level: values.level,
      tags,
      priceCents: values.priceCents,
    });

    setCreating(false);
    setValues(EMPTY_FORM);
    setErrors({});
    toast({ title: "Draft created", description: course.title, tone: "success" });
    router.push(`/studio/${course.id}`);
  };

  return (
    <Container size="wide" className="flex flex-col gap-8 py-8 sm:py-10">
      {/* A title block inside `main`, not a second banner landmark. */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Heading level={1} as="h1" className="text-3xl sm:text-4xl">
              Instructor studio
            </Heading>
            <Text tone="muted" className="mt-1">
              Courses live in this browser. Publishing adds them to your local catalog.
            </Text>
          </div>

          <Button
            leftIcon={<Plus className="size-4" />}
            onClick={() => {
              setErrors({});
              setCreating(true);
            }}
          >
            New course
          </Button>
        </div>
      </div>

      {mux !== null && !mux.configured ? <MuxNotConfigured /> : null}

      {activeJobs.length > 0 ? (
        <UploadJobList
          jobs={activeJobs}
          onRetry={uploadJobs.retry}
          onCancel={uploadJobs.cancel}
          onDismiss={uploadJobs.dismiss}
        />
      ) : null}

      {courses.length === 0 ? (
        <EmptyState
          title="Create your first course"
          description="A course needs a title, at least one module, and one video per lesson before it can be published. Drafts stay private until you publish them."
          action={{
            label: "New course",
            onClick: () => {
              setErrors({});
              setCreating(true);
            },
          }}
        />
      ) : (
        <div className="flex flex-col gap-8">
          {published.length > 0 ? (
            <CourseList
              title="Published"
              description="Visible in your catalog."
              courses={published}
              onOpen={(id) => router.push(`/studio/${id}`)}
              onDelete={(course) => {
                remove(course.id);
                toast({ title: "Course deleted", description: course.title });
              }}
            />
          ) : null}

          {drafts.length > 0 ? (
            <CourseList
              title="Drafts"
              description="Only you can see these."
              courses={drafts}
              onOpen={(id) => router.push(`/studio/${id}`)}
              onDelete={(course) => {
                remove(course.id);
                toast({ title: "Draft deleted", description: course.title });
              }}
            />
          ) : null}
        </div>
      )}

      <Dialog open={creating} onClose={() => setCreating(false)}>
        <OverlayHeader title="New course" description="Every field can be changed later." />

        <OverlayBody>
          <StudioCourseForm
            values={{ ...values, slug: effectiveSlug }}
            errors={errors}
            onChange={setValues}
            onSubmit={submit}
            submitLabel="Create draft"
          />
        </OverlayBody>

        <OverlayFooter>
          <Button variant="ghost" onClick={() => setCreating(false)}>
            Cancel
          </Button>
        </OverlayFooter>
      </Dialog>
    </Container>
  );
}

/* ------------------------------------------------------------------ */
/* Lists                                                               */
/* ------------------------------------------------------------------ */

function CourseList({
  title,
  description,
  courses,
  onOpen,
  onDelete,
}: {
  title: string;
  description: string;
  courses: Course[];
  onOpen: (courseId: string) => void;
  onDelete: (course: Course) => void;
}) {
  const headingId = `studio-${title.toLowerCase()}`;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div>
        <Heading level={2} as="h2" id={headingId} className="text-xl">
          {title}
        </Heading>
        <Text size="sm" tone="muted" className="mt-0.5">
          {description}
        </Text>
      </div>

      <ul className="flex flex-col gap-3">
        {courses.map((course) => (
          <li
            key={course.id}
            className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 sm:flex-row sm:items-center"
          >
            <div className="w-full shrink-0 sm:w-36">
              <CoursePoster
                playbackId={heroPlaybackIdFor(course) ?? ""}
                width={480}
                className="rounded-md"
              />
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Heading level={3} as="h3" className="text-lg">
                <Link
                  href={`/courses/${course.slug}`}
                  className="underline-offset-4 transition-colors hover:text-gold hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                >
                  {course.title}
                </Link>
              </Heading>
              <Text size="xs" tone="muted">
                Created {formatRelativeDate(course.createdAt)}
              </Text>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <ButtonLink href={`/studio/${course.id}`} size="sm" variant="secondary">
                <BookOpen aria-hidden className="size-4" />
                Edit
              </ButtonLink>
              <Button
                size="sm"
                variant="danger"
                leftIcon={<Trash2 className="size-4" />}
                onClick={() => onDelete(course)}
              >
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}