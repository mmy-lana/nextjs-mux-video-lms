"use client";

/**
 * CourseCard and CourseRail.
 *
 * The whole card is one link — there is no hover-only action and no nested
 * button — which is what makes a grid of these navigable by touch and by
 * keyboard without ambiguity.
 */

import Link from "next/link";
import { useId } from "react";

import { Badge } from "@/components/ui/Badge";
import { Heading, Text } from "@/components/ui/Layout";
import { ProgressBar } from "@/components/ui/Progress";
import { Carousel, CarouselItem } from "@/components/compound/Carousel";
import { cn } from "@/lib/utils/cn";
import { formatLevel, formatPrice } from "@/lib/utils/format";
import { formatDuration } from "@/lib/utils/time";
import { courseTotalsWithDurations } from "@/lib/domain/totals";
import type { Course, Instructor } from "@/lib/types";
import { CoursePoster } from "./CoursePoster";

export interface CourseCardProps {
  course: Course;
  instructor: Instructor | null;
  /** Durations learned so far; the runtime stays "—" until every lesson is known. */
  durations?: Record<string, number>;
  /** 0–100, shown only when the learner is enrolled. */
  progressPercent?: number;
  enrolled?: boolean;
  priority?: boolean;
  className?: string;
}

export function CourseCard({
  course,
  instructor,
  durations = {},
  progressPercent,
  enrolled = false,
  priority = false,
  className,
}: CourseCardProps) {
  const totals = courseTotalsWithDurations(course, durations);
  const runtime = formatDuration(totals.totalDurationSec);
  const percent = enrolled ? (progressPercent ?? 0) : null;

  return (
    <article
      className={cn(
        "group relative flex h-full min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-surface transition-colors duration-200 ease-out-soft hover:border-gold/45",
        className,
      )}
    >
      <div className="relative">
        <CoursePoster
          playbackId={course.heroPlaybackId}
          timeSec={course.heroPosterTimeSec}
          priority={priority}
          width={960}
          overlay={<div aria-hidden className="poster-scrim absolute inset-0" />}
        />

        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
          {course.featured ? <Badge tone="gold">Featured</Badge> : <span />}
          {course.priceCents === 0 ? <Badge tone="solid">Free</Badge> : null}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <Badge tone="neutral">{formatLevel(course.level)}</Badge>
          <span aria-hidden>·</span>
          {/* An unknown runtime renders as an em dash, never an invented number. */}
          <span className="tabular-nums">{runtime}</span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">
            {totals.lessonCount} {totals.lessonCount === 1 ? "lesson" : "lessons"}
          </span>
        </div>

        <Heading level={3} as="h3" className="text-base leading-snug">
          {course.title}
        </Heading>

        {instructor ? (
          <Text size="sm" tone="muted" className="truncate">
            {instructor.name}
          </Text>
        ) : null}

        <div className="mt-auto pt-3">
          {percent !== null ? (
            <div className="flex flex-col gap-1.5">
              <ProgressBar value={percent} label={`${course.title} progress`} size="sm" />
              <span className="text-xs text-muted">
                {percent >= 100 ? "Completed" : `${percent}% complete`}
              </span>
            </div>
          ) : (
            <span className="text-sm font-semibold text-gold">
              {formatPrice(course.priceCents)}
            </span>
          )}
        </div>
      </div>

      {/*
        The stretched link makes the entire card the hit area while keeping the
        accessible name to the card's visible text.
      */}
      <Link
        href={`/courses/${course.slug}`}
        className="absolute inset-0 rounded-lg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold"
      >
        <span className="sr-only">
          {course.title}
          {instructor ? ` by ${instructor.name}` : ""}
          {percent !== null ? `, ${percent}% complete` : `, ${formatPrice(course.priceCents)}`}
        </span>
      </Link>
    </article>
  );
}

export interface CourseRailProps {
  title: string;
  /** Optional supporting line under the heading. */
  description?: string;
  courses: ReadonlyArray<{
    course: Course;
    instructor: Instructor | null;
    progressPercent?: number;
    enrolled?: boolean;
  }>;
  durations?: Record<string, number>;
  emptyState?: React.ReactNode;
  className?: string;
}

/** A titled carousel of course cards, hidden entirely when empty. */
export function CourseRail({
  title,
  description,
  courses,
  durations = {},
  emptyState,
  className,
}: CourseRailProps) {
  // `aria-labelledby` treats a space as a separator between ids, so the heading
  // id has to be generated rather than built from the (spaced) title.
  const headingId = useId();

  if (courses.length === 0) {
    return emptyState ? <div className={className}>{emptyState}</div> : null;
  }

  return (
    <section className={cn("flex flex-col gap-4", className)} aria-labelledby={headingId}>
      <div>
        <Heading level={2} as="h2" id={headingId} className="text-xl sm:text-2xl">
          {title}
        </Heading>
        {description ? (
          <Text tone="muted" size="sm" className="mt-1">
            {description}
          </Text>
        ) : null}
      </div>

      <Carousel label={title}>
        {courses.map(({ course, instructor, progressPercent, enrolled }) => (
          <CarouselItem key={course.id}>
            <CourseCard
              course={course}
              instructor={instructor}
              durations={durations}
              progressPercent={progressPercent}
              enrolled={enrolled}
            />
          </CarouselItem>
        ))}
      </Carousel>
    </section>
  );
}
