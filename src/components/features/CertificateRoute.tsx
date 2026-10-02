"use client";

/**
 * The certificate route.
 *
 * A certificate exists only once the enrollment carries a completion date, so
 * the two states are the whole screen: earned, or not yet — and the second one
 * has to be a way forward rather than a dead end.
 *
 * Printing is handled by `@media print`, not by a screenshot API: the print
 * stylesheet hides the shell and drops the card onto a landscape page.
 */

import { useMemo } from "react";

import { CertificateActions, CertificateView } from "@/components/features/Panels";
import { ButtonLink } from "@/components/ui/Button";
import { Container, Heading, Text } from "@/components/ui/Layout";
import { ProgressBar, Skeleton } from "@/components/ui/Progress";
import { EmptyState } from "@/components/compound/States";
import { useCatalog, useCourseProgress, useEnrollment, useHydrated, useProfile } from "@/hooks";
import { findInstructor } from "@/lib/seed";
import { DEFAULT_CATALOG_QUERY, type Course } from "@/lib/types";

export function CertificateRoute({ slug, seedCourse }: { slug: string; seedCourse: Course | null }) {
  const hydrated = useHydrated();
  const { bySlug } = useCatalog(DEFAULT_CATALOG_QUERY);
  const { profile } = useProfile();

  const course = seedCourse ?? bySlug(slug) ?? null;

  const { percent, totalCount, completedCount } = useCourseProgress(course);
  const { enrollment } = useEnrollment(course?.id);

  const instructor = useMemo(
    () => (course ? findInstructor(course.instructorId) : null),
    [course],
  );

  if (!hydrated) {
    return (
      <Container size="wide" className="py-10">
        <Skeleton shape="block" className="h-96 w-full rounded-lg" />
        <span className="sr-only" role="status">
          Loading your certificate…
        </span>
      </Container>
    );
  }

  if (!course) {
    return (
      <Container size="narrow" className="py-16">
        <EmptyState
          title="Certificate not found"
          description="There is no course at this address in this browser."
          action={{ label: "Browse courses", href: "/courses" }}
        />
      </Container>
    );
  }

  if (!enrollment?.completedAt) {
    return (
      <Container size="narrow" className="flex flex-col items-center gap-6 py-16">
        <Heading level={1} as="h1" className="text-center text-3xl">
          Not finished yet
        </Heading>

        <EmptyState
          title={`Finish ${course.title} to earn your certificate`}
          description={`${completedCount} of ${totalCount} lessons complete. The certificate unlocks the moment the last one is watched to the end — or when you mark it complete yourself.`}
          action={{ label: "Continue course", href: `/learn/${course.slug}` }}
        >
          <div className="w-full max-w-xs">
            <ProgressBar value={percent} label="Course progress" size="sm" />
            <Text size="sm" tone="muted" className="mt-2 text-center">
              {percent}% complete
            </Text>
          </div>
        </EmptyState>

        <Text size="sm" tone="muted">
          Prefer the overview?{" "}
          <ButtonLink href={`/courses/${course.slug}`} variant="ghost" size="sm">
            Open the course page
          </ButtonLink>
        </Text>
      </Container>
    );
  }

  return (
    <Container size="wide" className="flex flex-col items-center gap-6 py-10 print:py-0">
      <CertificateView
        course={course}
        instructor={instructor}
        learnerName={profile.displayName}
        completedAt={enrollment.completedAt}
      />

      <CertificateActions onPrint={() => window.print()} />
    </Container>
  );
}