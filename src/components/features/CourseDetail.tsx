"use client";

/**
 * Course detail.
 *
 * Everything learner-specific — enrollment, progress, learned durations — is
 * local, so this is a client island. The seed course arrives as a prop so the
 * headline and poster render without waiting for JavaScript; a Studio course is
 * resolved from local storage instead, which is why an unknown slug falls
 * through to the not-found UI here rather than calling `notFound()` on the
 * server.
 */

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Award, CheckCircle2, Lock, Sparkles } from "lucide-react";

import { CoursePoster } from "@/components/features/CoursePoster";
import { CurriculumList } from "@/components/features/CurriculumList";
import { EnrollPanel } from "@/components/features/EnrollPanel";
import { CourseRail } from "@/components/features";
import { InstructorCard } from "@/components/features/Panels";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils/cn";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Container, Heading, Text } from "@/components/ui/Layout";
import { Skeleton } from "@/components/ui/Progress";
import { useToast } from "@/components/ui/Toast";
import {
  useCatalog,
  useCourseProgress,
  useDurations,
  useEnrollment,
  useHydrated,
} from "@/hooks";
import { firstLockedLesson, resolveResumeLesson } from "@/lib/domain/resume";
import { nextIncompleteLessonId } from "@/lib/domain/totals";
import { freePreviewCount, heroPlaybackIdFor } from "@/lib/domain/totals";
import { formatCategory, formatLevel } from "@/lib/utils/format";
import { findInstructor } from "@/lib/seed";
import { DEFAULT_CATALOG_QUERY } from "@/lib/types";
import type { Course, Instructor } from "@/lib/types";

export interface CourseDetailProps {
  /** The slug from the route, used to resolve a Studio course. */
  slug: string;
  /** The seed course, when the slug is one of ours. */
  course: Course | null;
  instructor: Instructor | null;
}

export function CourseDetail({ slug, course: seedCourse, instructor: seedInstructor }: CourseDetailProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const { toast } = useToast();
  const { bySlug, courses } = useCatalog(DEFAULT_CATALOG_QUERY);
  const { durations } = useDurations();

  const course = seedCourse ?? bySlug(slug) ?? null;
  const instructor = seedInstructor ?? (course ? findInstructor(course.instructorId) : null);

  const { progressMap, percent } = useCourseProgress(course);
  const { enrolled, enroll, unenroll, enrollment } = useEnrollment(course?.id);

  const hero = course ? heroPlaybackIdFor(course) : null;
  const lockedNext = course ? firstLockedLesson(course, enrolled) : null;
  const nextLessonId = course ? nextIncompleteLessonId(course, progressMap) : null;

  const resumeHref = useMemo(() => {
    if (!course) return "/courses";

    const target = resolveResumeLesson(course, progressMap, enrollment ?? null);
    return target ? `/learn/${course.slug}/${target.lesson.id}` : `/learn/${course.slug}`;
  }, [course, enrollment, progressMap]);

  const related = useMemo(
    () => (course ? courses.filter((entry) => entry.id !== course.id).slice(0, 6) : []),
    [course, courses],
  );

  /*
   * The server cannot see a Studio course, so its metadata is a neutral
   * placeholder. Once the client resolves the real record, the title should
   * match what is on screen rather than contradicting it.
   */
  useEffect(() => {
    if (!course) return;

    document.title = `${course.title} · ${course.subtitle}`;
  }, [course]);

  /* Unknown slug, and nothing in this browser to match it. */
  if (hydrated && !course) {
    return <UnknownCourse />;
  }

  if (!course) {
    return (
      <Container size="wide" className="flex flex-col gap-6 py-10">
        <Skeleton shape="block" className="aspect-video w-full rounded-lg" />
        <Skeleton shape="text" className="h-10 w-2/3" />
        <Skeleton shape="text" className="h-4 w-1/2" />
      </Container>
    );
  }

  const previews = freePreviewCount(course);

  /*
   * The CTA says what the button does. Before enrolling that is enrolling —
   * "Start course" on a course you cannot yet open is a promise the click does
   * not keep. Progress only changes the wording once there is progress to
   * continue.
   */
  const enrollLabel = enrolled
    ? nextLessonId
      ? "Continue course"
      : "Watch again"
    : "Enroll now";

  const handleEnroll = async () => {
    enroll();

    toast({
      title: enrolled ? "Already enrolled" : "You are enrolled",
      description: enrolled
        ? undefined
        : previews > 0
          ? `${previews} free preview ${previews === 1 ? "lesson is" : "lessons are"} open to everyone.`
          : undefined,
      tone: "success",
    });

    router.push(resumeHref);
  };

  return (
    <>
      <Container size="wide" className="flex flex-col gap-10 py-6 pb-44 sm:py-10 md:pb-16">
        {/*
          One banner per page: this is a title block inside `main`, so it is a
          `div`. A second `<header>` here would register as a second landmark
          and make "navigate by region" ambiguous.
        */}
        <div className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,1fr)_22rem] md:gap-10">
          <div className="flex min-w-0 flex-col gap-5">
            <CoursePoster
              playbackId={hero ?? ""}
              timeSec={course.heroPosterTimeSec}
              width={1280}
              priority
              className="rounded-lg border border-line"
              overlay={<div aria-hidden className="poster-scrim absolute inset-0" />}
            />

            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="gold">{formatCategory(course.category)}</Badge>
              <Badge tone="neutral">{formatLevel(course.level)}</Badge>
              {course.featured ? <Badge tone="gold">Featured</Badge> : null}
              {course.source === "studio" ? <Badge tone="neutral">Your course</Badge> : null}
            </div>

            <Heading level={1} as="h1" className="text-3xl sm:text-4xl">
              {course.title}
            </Heading>

            <Text size="lg" tone="muted" className="max-w-2xl">
              {course.subtitle}
            </Text>

            {instructor ? (
              <Text size="sm" tone="muted">
                Taught by{" "}
                <span className="font-medium text-ink">{instructor.name}</span>
              </Text>
            ) : null}

            {enrolled ? (
              <div className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface px-4 py-3">
                <CheckCircle2 aria-hidden className="size-5 shrink-0 text-success" />
                <Text size="sm">
                  {enrollment?.completedAt ? "You completed this course." : `${percent}% complete.`}
                </Text>
                <ButtonLink href={`/certificate/${course.slug}`} variant="ghost" size="sm">
                  <Award aria-hidden className="size-4" />
                  Certificate
                </ButtonLink>
                <ButtonLink href={`/learn/${course.slug}`} size="sm">
                  {enrollment?.completedAt ? "Watch again" : "Continue"}
                </ButtonLink>
              </div>
            ) : null}
          </div>

          {/*
            Inline from 768px up. Below that the sticky bar at the foot of the
            viewport takes over, so the call to action is never missing at any
            width — a gap here would be a dead end on a tablet.
          */}
          <div className="hidden md:block">
            <div className="sticky top-24 flex flex-col gap-4">
              <EnrollPanel
                course={course}
                enrolled={enrolled}
                primaryLabel={enrollLabel}
                onEnroll={handleEnroll}
                onContinue={() => router.push(resumeHref)}
              />

              {enrolled ? (
                <button
                  type="button"
                  onClick={() => {
                    unenroll();
                    toast({
                      title: "Left the course",
                      description: "Your progress is kept if you come back.",
                    });
                  }}
                  className="min-h-11 rounded-md text-sm text-muted underline-offset-2 transition-colors hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                >
                  Leave this course
                </button>
              ) : lockedNext ? (
                <p className="flex items-start gap-2 px-1 text-xs text-muted">
                  <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                  <span className="min-w-0">
                    Enroll to watch beyond the free preview, starting with “
                    {lockedNext.lesson.title}”.
                  </span>
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-10">
            <section aria-labelledby="about-heading" className="flex flex-col gap-3">
              <Heading level={2} as="h2" id="about-heading">
                About this course
              </Heading>
              <Text tone="muted" className="max-w-3xl whitespace-pre-line leading-relaxed">
                {course.description}
              </Text>
            </section>

            {course.learnOutcomes.length > 0 ? (
              <section aria-labelledby="outcomes-heading" className="flex flex-col gap-3">
                <Heading level={2} as="h2" id="outcomes-heading" className="text-xl">
                  What you’ll learn
                </Heading>
                <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {course.learnOutcomes.map((outcome) => (
                    <li key={outcome} className="flex items-start gap-2.5 text-sm text-muted">
                      <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 text-gold" />
                      <span className="min-w-0">{outcome}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section aria-labelledby="curriculum-heading" className="flex flex-col gap-3">
              <Heading level={2} as="h2" id="curriculum-heading" className="text-xl">
                Curriculum
              </Heading>
              <CurriculumList
                course={course}
                progressMap={progressMap}
                durations={durations}
                enrolled={enrolled}
              />
            </section>

            {instructor ? <InstructorCard instructor={instructor} /> : null}
        </div>
      </Container>

      {/* Mobile sticky bar (plan §8.1, 360px), with the same flow as inline. */}
      <EnrollPanel
        className="md:hidden"
        layout="sticky"
        course={course}
        enrolled={enrolled}
        primaryLabel={enrollLabel}
        onEnroll={handleEnroll}
        onContinue={() => router.push(resumeHref)}
      />

      {related.length > 0 ? (
        <Container size="wide" className="pb-16">
          <CourseRail
            title="You might also like"
            durations={durations}
            courses={related.map((entry) => ({
              course: entry,
              instructor: findInstructor(entry.instructorId),
            }))}
          />
        </Container>
      ) : null}
    </>
  );
}

/**
 * An unknown slug.
 *
 * Rendered here rather than by `notFound()` because a Studio course may exist
 * only in this browser, so the server cannot know whether the page is real.
 */
function UnknownCourse() {
  return (
    <Container size="narrow" className="flex flex-1 flex-col items-center justify-center py-20 text-center">
      <span className="font-mono text-sm text-gold">404</span>

      <Heading level={1} as="h1" className="mt-3 text-3xl sm:text-4xl">
        Course not found
      </Heading>

      <Text tone="muted" className="mt-3 max-w-md">
        There is no course at this address. It may have been unpublished, or the
        link may be mistyped.
      </Text>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <ButtonLink href="/courses">Browse courses</ButtonLink>
        <Link
          href="/my-learning"
          className="inline-flex min-h-11 items-center rounded-md px-4 text-sm font-medium text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
        >
          My learning
        </Link>
      </div>
    </Container>
  );
}