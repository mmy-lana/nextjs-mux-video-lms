"use client";

/**
 * Home.
 *
 * The page is a Server Component shell that renders this client island, because
 * every interesting part — continue watching, the streak, per-card progress —
 * comes from `localStorage` and cannot exist on the server.
 *
 * Hydration is explicit: until storage has been read, the learner-specific
 * sections render skeletons rather than an empty state that would contradict
 * whatever they have already watched.
 */

import { useMemo } from "react";

import { ContinueWatchingRail, type ContinueEntry } from "@/components/features/ContinueWatchingRail";
import { CourseRail, HeroBillboard } from "@/components/features";
import { StreakCard } from "@/components/features/Panels";
import { ButtonLink } from "@/components/ui/Button";
import { Container, Heading, Text } from "@/components/ui/Layout";
import { Skeleton } from "@/components/ui/Progress";
import {
  useActivity,
  useCatalog,
  useCoursesProgress,
  useDurations,
  useHydrated,
  useNotes,
} from "@/hooks";
import { lessonPercent, resolveDuration, watchedSeconds } from "@/lib/domain/progress";
import { flattenCourse } from "@/lib/domain/curriculum";
import { progressKey } from "@/lib/utils/ids";
import { findInstructor } from "@/lib/seed";
import { DEFAULT_CATALOG_QUERY } from "@/lib/types";

export default function HomePage() {
  const hydrated = useHydrated();
  const { results } = useCatalog(DEFAULT_CATALOG_QUERY);
  const { durations } = useDurations();
  const { byCourse } = useCoursesProgress(results);

  const featured = useMemo(
    () => results.find((course) => course.featured) ?? results[0] ?? null,
    [results],
  );

  const rail = useMemo(
    () => results.filter((course) => course.id !== featured?.id),
    [featured?.id, results],
  );

  return (
    <>
      {featured ? (
        <HeroBillboard
          course={featured}
          instructor={findInstructor(featured.instructorId)}
          durations={durations}
          ctaHref={`/courses/${featured.slug}`}
          ctaLabel="View this course"
        />
      ) : (
        <Container size="wide" className="py-12">
          <Skeleton shape="block" className="h-64 w-full rounded-lg" />
        </Container>
      )}

      <Container size="wide" className="flex flex-col gap-14 py-12">
        <ContinueSection courses={results} hydrated={hydrated} durations={durations} />

        <StreakSection hydrated={hydrated} />

        {rail.length > 0 ? (
          <>
            <CourseRail
              title={featured ? "More from the studio" : "New releases"}
              description="The most recently published courses."
              durations={durations}
              courses={rail.slice(0, 8).map((course) => ({
                course,
                instructor: findInstructor(course.instructorId),
                enrolled: byCourse[course.id] !== undefined,
                progressPercent: byCourse[course.id]?.percent ?? 0,
              }))}
            />

            {results.length > 8 ? (
              <section className="flex justify-center">
                <ButtonLink href="/courses" variant="secondary" size="lg">
                  Browse all {results.length} courses
                </ButtonLink>
              </section>
            ) : null}
          </>
        ) : (
          <EmptyCatalog />
        )}
      </Container>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Continue watching                                                   */
/* ------------------------------------------------------------------ */

function ContinueSection({
  courses,
  hydrated,
  durations,
}: {
  courses: ReturnType<typeof useCatalog>["courses"];
  hydrated: boolean;
  durations: Record<string, number>;
}) {
  /*
   * One subscription to the whole progress store, rather than one hook per
   * course: the store exposes a flat map, so a single read covers every course
   * on the page and keeps this to one render pass.
   */
  const { byCourse, progressMap } = useCoursesProgress(courses);

  const entries = useMemo<ContinueEntry[]>(() => {
    const found: ContinueEntry[] = [];

    for (const course of courses) {
      if (byCourse[course.id] === undefined) continue;

      for (const entry of flattenCourse(course)) {
        const record = progressMap[progressKey(course.id, entry.lesson.id)];
        if (!record || record.completed || record.positionSec < 1) continue;

        const duration = resolveDuration(entry.lesson, durations);

        found.push({
          course,
          lesson: entry.lesson,
          percent: lessonPercent(record, duration),
          positionSec: record.positionSec,
          updatedAt: record.updatedAt,
          watchedSeconds: watchedSeconds(record, duration),
        });
      }
    }

    // Newest first: the lesson paused a minute ago is the one to resume.
    return found.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6);
  }, [byCourse, courses, durations, progressMap]);

  if (!hydrated) {
    return (
      <section className="flex flex-col gap-4" aria-label="Continue watching">
        <Skeleton shape="text" className="h-6 w-48" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} shape="block" className="h-40 w-full rounded-lg" />
          ))}
        </div>
      </section>
    );
  }

  return <ContinueWatchingRail entries={entries} />;
}

/* ------------------------------------------------------------------ */
/* Streak                                                              */
/* ------------------------------------------------------------------ */

function StreakSection({ hydrated }: { hydrated: boolean }) {
  const { streakDays, activeToday, series, totalSeconds, lessonsCompleted } = useActivity();
  const notes = useNotes(null, null);

  if (!hydrated) {
    return <Skeleton shape="block" className="h-40 w-full max-w-xl rounded-lg" />;
  }

  // A brand-new learner has nothing to summarise, and a section of zeroes would
  // read as a failure rather than an absence.
  if (streakDays === 0 && lessonsCompleted === 0 && notes.count === 0) return null;

  return (
    <section aria-label="Your study activity" className="max-w-xl">
      <StreakCard
        streakDays={streakDays}
        series={series}
        totalSeconds={totalSeconds}
        lessonsCompleted={lessonsCompleted}
      />

      {!activeToday && streakDays > 0 ? (
        <Text size="sm" tone="muted" className="mt-2">
          Watch a minute today to keep your {streakDays}-day streak alive.
        </Text>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Empty catalog                                                       */
/* ------------------------------------------------------------------ */

function EmptyCatalog() {
  return (
    <section className="flex flex-col items-center gap-4 py-16 text-center">
      <Heading level={2} as="h2" className="text-2xl">
        No courses are published yet
      </Heading>
      <Text tone="muted" className="max-w-md">
        The seed catalog ships with the build, so an empty catalog means the
        catalog failed to load.
      </Text>
      <ButtonLink href="/courses" variant="secondary">
        Open the catalog
      </ButtonLink>
    </section>
  );
}