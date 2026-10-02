"use client";

/**
 * The resume resolver (plan §7).
 *
 * Deciding where to land needs the progress map, which lives in storage, so the
 * resolution itself is a client island: it waits for hydration, picks the
 * lesson to resume, and replaces the URL. `replace` rather than `push`, because
 * the resolver is an implementation detail the learner should not have to press
 * Back through.
 *
 * The skeleton is shaped like the player so the layout does not jump when the
 * redirect lands.
 */

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { PlayerSkeleton } from "@/components/features/VideoPlayer";
import { Container, Heading, Text } from "@/components/ui/Layout";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/compound/States";
import { useCatalog, useCourseProgress, useEnrollment, useHydrated } from "@/hooks";
import { resolveResumeLesson } from "@/lib/domain/resume";
import { DEFAULT_CATALOG_QUERY } from "@/lib/types";

export function ResumeResolver({ slug }: { slug: string }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const { bySlug, hydrated: catalogReady } = useCatalog(DEFAULT_CATALOG_QUERY);

  const course = bySlug(slug) ?? null;
  const { progressMap } = useCourseProgress(course);
  const { enrollment } = useEnrollment(course?.id);

  useEffect(() => {
    // Two gates: storage must have been read, and the catalog must have been
    // merged, or a Studio course could be missed and the learner sent to 404.
    if (!hydrated || !catalogReady || !course) return;

    const target = resolveResumeLesson(course, progressMap, enrollment);

    // `replace`, not `push`: the resolver is an implementation detail the
    // learner should not have to press Back through.
    router.replace(
      target ? `/learn/${course.slug}/${target.lesson.id}` : `/learn/${course.slug}`,
    );
  }, [catalogReady, course, enrollment, hydrated, progressMap, router]);

  if (!hydrated || !catalogReady) {
    return (
      <Container size="wide" className="flex flex-col gap-4 py-8">
        <PlayerSkeleton />
        <Text tone="muted" size="sm">
          Finding where you left off…
        </Text>
      </Container>
    );
  }

  if (!course) {
    return (
      <Container size="narrow" className="py-16">
        <EmptyState
          title="Course not found"
          description="There is no course at this address in this browser."
          action={{ label: "Browse courses", href: "/courses" }}
        />
      </Container>
    );
  }

  return (
    <Container size="narrow" className="py-16">
      <Heading level={1} as="h1" className="text-2xl">
        {course.title}
      </Heading>
      <EmptyState
        title="This course has no lessons yet"
        description="Nothing to resume. Check back once a lesson has been published."
        action={{ label: "Back to the course", href: `/courses/${course.slug}` }}
      />
    </Container>
  );
}