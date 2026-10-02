"use client";

/**
 * My Learning.
 *
 * Three lists, in the order a learner thinks about them: what is in progress,
 * what is finished, and what they enrolled in but never started. Each row states
 * its own progress, because a "My Learning" page that only lists course titles
 * is a to-do list rather than a record.
 *
 * Unenrolling is offered here and confirmed in a dialog; progress is kept, so
 * re-enrolling resumes exactly where it left off.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Award, CheckCircle2, PlayCircle, Trash2 } from "lucide-react";

import { CoursePoster } from "@/components/features/CoursePoster";
import { StreakCard } from "@/components/features/Panels";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Container, Heading, Text } from "@/components/ui/Layout";
import { ProgressBar, Skeleton } from "@/components/ui/Progress";
import { Input } from "@/components/ui/Field";
import { Dialog, OverlayBody, OverlayFooter, OverlayHeader } from "@/components/compound/Overlay";
import {
  Dropdown,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
} from "@/components/compound/Dropdown";
import { EmptyState } from "@/components/compound/States";
import {
  useActivity,
  useCatalog,
  useCoursesProgress,
  useDurations,
  useHydrated,
  useProfile,
  type CourseProgressSummary,
} from "@/hooks";
import { useStore } from "@/lib/storage/useStore";
import { enrollmentsStore } from "@/lib/storage/stores";
import type { LessonProgress } from "@/lib/types";
import { heroPlaybackIdFor } from "@/lib/domain/totals";
import { formatRelativeDate } from "@/lib/utils/time";
import { findInstructor } from "@/lib/seed";
import { DEFAULT_CATALOG_QUERY, type Course } from "@/lib/types";

export default function MyLearningPage() {
  const hydrated = useHydrated();
  const { courses } = useCatalog(DEFAULT_CATALOG_QUERY);
  const { byCourse, progressMap } = useCoursesProgress(courses);
  const { durations } = useDurations();
  const { profile, rename } = useProfile();
  const { streakDays, activeToday, series, totalSeconds, lessonsCompleted } = useActivity();

  /*
   * Membership is decided by the enrollment store, not by progress.
   *
   * Leaving a course keeps its progress (plan §6.4), so a progress-driven list
   * would keep showing a course the learner has explicitly left — which makes
   * the "leave" action look like it did nothing.
   */
  const enrollments = useStore(enrollmentsStore, (snapshot) => snapshot);

  const enrolled = useMemo(
    () => courses.filter((course) => enrollments[course.id] !== undefined),
    [courses, enrollments],
  );

  const groups = useMemo(() => {
    const inProgress: Course[] = [];
    const finished: Course[] = [];
    const notStarted: Course[] = [];

    for (const course of enrolled) {
      const summary = byCourse[course.id];
      if (!summary) continue;

      if (summary.complete) finished.push(course);
      else if (summary.completedCount > 0) inProgress.push(course);
      else notStarted.push(course);
    }

    return { inProgress, finished, notStarted };
  }, [byCourse, enrolled]);

  if (!hydrated) return <MyLearningSkeleton />;

  return (
    <Container size="wide" className="flex flex-col gap-10 py-8 sm:py-10">
      {/* A title block inside `main`, not a second banner landmark. */}
      <div className="flex flex-col gap-5">
        <div>
          <Heading level={1} as="h1" className="text-3xl sm:text-4xl">
            My learning
          </Heading>
          <Text tone="muted" className="mt-1">
            Saved in this browser only. Nothing here is uploaded anywhere.
          </Text>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[14rem] flex-1 sm:max-w-xs">
            <label htmlFor="display-name" className="text-sm font-medium text-ink">
              Display name
            </label>
            <Input
              id="display-name"
              defaultValue={profile.displayName}
              maxLength={40}
              onBlur={(event) => rename(event.target.value)}
              className="mt-1.5"
              placeholder="The name on your certificates"
            />
            <Text size="xs" tone="muted" className="mt-1">
              Appears on certificates. Changes save when you leave the field.
            </Text>
          </div>

          {streakDays > 0 || lessonsCompleted > 0 ? (
            <div className="min-w-[16rem] flex-1 sm:max-w-sm">
              <StreakCard
                streakDays={streakDays}
                series={series}
                totalSeconds={totalSeconds}
                lessonsCompleted={lessonsCompleted}
              />
            </div>
          ) : null}
        </div>

        {!activeToday && streakDays > 0 ? (
          <Text size="sm" tone="muted">
            Watch a minute today to keep your {streakDays}-day streak alive.
          </Text>
        ) : null}
      </div>

      {enrolled.length === 0 ? (
        <EmptyState
          title="You haven’t enrolled yet"
          description="Courses you enroll in appear here with their progress, so you can pick up exactly where you left off."
          action={{ label: "Browse courses", href: "/courses" }}
        />
      ) : (
        <>
          <CourseGroup
            title="In progress"
            description="Pick up where you stopped."
            courses={groups.inProgress}
            byCourse={byCourse}
            progressMap={progressMap}
            durations={durations}
          />

          {groups.finished.length > 0 ? (
            <CourseGroup
              title="Completed"
              description="Your certificates are one tap away."
              courses={groups.finished}
              byCourse={byCourse}
              progressMap={progressMap}
              durations={durations}
              showCertificate
            />
          ) : null}

          {groups.notStarted.length > 0 ? (
            <CourseGroup
              title="Enrolled, not started"
              description="Waiting for you."
              courses={groups.notStarted}
              byCourse={byCourse}
              progressMap={progressMap}
              durations={durations}
            />
          ) : null}
        </>
      )}
    </Container>
  );
}

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

interface CourseGroupProps {
  title: string;
  description: string;
  courses: Course[];
  byCourse: Record<string, CourseProgressSummary>;
  progressMap: Record<string, LessonProgress>;
  durations: Record<string, number>;
  showCertificate?: boolean;
}

function CourseGroup({
  title,
  description,
  courses,
  byCourse,
  progressMap,
  durations,
  showCertificate = false,
}: CourseGroupProps) {
  const router = useRouter();
  const enrollments = useStore(enrollmentsStore, (snapshot) => snapshot);
  const [leaving, setLeaving] = useState<Course | null>(null);

  if (courses.length === 0) return null;

  const headingId = `group-${title.replace(/\s+/g, "-").toLowerCase()}`;

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
        {courses.map((course) => {
          const summary = byCourse[course.id];
          const enrollment = enrollments[course.id] ?? null;
          const lastActivity = latestActivity(progressMap, course);

          return (
            <li
              key={course.id}
              className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 sm:flex-row sm:items-center"
            >
              <div className="w-full shrink-0 sm:w-40">
                <CoursePoster
                  playbackId={heroPlaybackIdFor(course) ?? ""}
                  timeSec={course.heroPosterTimeSec}
                  width={480}
                  className="rounded-md"
                />
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {summary?.complete ? (
                    <Badge tone="success">
                      <CheckCircle2 aria-hidden className="size-3" />
                      Completed
                    </Badge>
                  ) : null}
                  <Text size="xs" tone="muted">
                    {findInstructor(course.instructorId)?.name ?? "Aura instructor"}
                  </Text>
                </div>

                <Heading level={3} as="h3" className="text-lg">
                  <Link
                    href={`/courses/${course.slug}`}
                    className="underline-offset-4 transition-colors hover:text-gold hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                  >
                    {course.title}
                  </Link>
                </Heading>

                <ProgressBar
                  value={summary?.percent ?? 0}
                  label={`${course.title} progress`}
                  size="sm"
                />

                <Text size="sm" tone="muted">
                  {summary?.completedCount ?? 0} of {summary?.totalCount ?? 0} lessons
                  {lastActivity ? ` · last watched ${formatRelativeDate(lastActivity)}` : ""}
                </Text>

                {enrollment?.lastLessonId && !summary?.complete ? (
                  <Text size="xs" tone="muted">
                    Resume returns you to the last lesson you opened.
                  </Text>
                ) : null}
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {showCertificate ? (
                  <ButtonLink href={`/certificate/${course.slug}`} size="sm" variant="secondary">
                    <Award aria-hidden className="size-4" />
                    Certificate
                  </ButtonLink>
                ) : (
                  <ButtonLink href={`/learn/${course.slug}`} size="sm">
                    <PlayCircle aria-hidden className="size-4" />
                    {summary?.completedCount ? "Continue" : "Start"}
                  </ButtonLink>
                )}

                <Dropdown
                  label={`More actions for ${course.title}`}
                  header={<DropdownLabel>{course.title}</DropdownLabel>}
                >
                  <DropdownItem onClick={() => router.push(`/learn/${course.slug}`)}>
                    Resume in the player
                  </DropdownItem>

                  <DropdownItem onClick={() => router.push(`/courses/${course.slug}`)}>
                    Course details
                  </DropdownItem>

                  <DropdownSeparator />

                  <DropdownItem tone="danger" icon={<Trash2 aria-hidden className="size-4" />} onClick={() => setLeaving(course)}>
                    Leave course
                  </DropdownItem>
                </Dropdown>
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog open={leaving !== null} onClose={() => setLeaving(null)}>
        <OverlayHeader
          title={`Leave “${leaving?.title ?? ""}”?`}
          description="You will lose access to every lesson, including the free previews."
        />

        <OverlayBody>
          <Text tone="muted" size="sm">
            Your progress, notes and streak are all kept. Re-enrolling resumes the
            course exactly where you stopped.
          </Text>
        </OverlayBody>

        <OverlayFooter>
          <Button variant="ghost" onClick={() => setLeaving(null)}>
            Keep learning
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              const course = leaving;
              if (!course) return;

              enrollmentsStore.set((snapshot) => {
                if (!(course.id in snapshot)) return snapshot;

                const { [course.id]: _removed, ...rest } = snapshot;
                return rest;
              });

              setLeaving(null);
            }}
          >
            Leave course
          </Button>
        </OverlayFooter>
      </Dialog>
    </section>
  );
}

/** The most recent progress write for a course. */
function latestActivity(map: Record<string, LessonProgress>, course: Course): string | null {
  let latest: string | null = null;

  for (const record of Object.values(map)) {
    if (record.courseId !== course.id) continue;
    if (latest === null || record.updatedAt > latest) latest = record.updatedAt;
  }

  return latest;
}

function MyLearningSkeleton() {
  return (
    <Container size="wide" className="flex flex-col gap-10 py-10">
      <div className="flex flex-col gap-3">
        <Skeleton shape="block" className="h-10 w-56" />
        <Skeleton shape="text" className="h-4 w-72" />
      </div>

      {Array.from({ length: 3 }, (_, index) => (
        <div
          key={index}
          className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 sm:flex-row"
        >
          <Skeleton shape="block" className="aspect-video w-full rounded-md sm:w-40" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton shape="text" className="h-3 w-24" />
            <Skeleton shape="text" className="h-5 w-2/3" />
            <Skeleton shape="text" className="h-2 w-full" />
            <Skeleton shape="text" className="h-3 w-40" />
          </div>
        </div>
      ))}

      <span className="sr-only" role="status">
        Loading your courses…
      </span>
    </Container>
  );
}