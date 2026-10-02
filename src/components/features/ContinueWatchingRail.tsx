"use client";

/**
 * ContinueWatchingRail.
 *
 * Where the learner stopped, not where they started: rows are ordered by the
 * time each lesson was last touched, so the lesson that was paused ten minutes
 * ago is first. Entries are lessons, not courses, because resuming means
 * resuming a specific moment.
 */

import Link from "next/link";
import { PlayCircle } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Heading, Text } from "@/components/ui/Layout";
import { ProgressBar } from "@/components/ui/Progress";
import { Carousel, CarouselItem } from "@/components/compound/Carousel";
import { cn } from "@/lib/utils/cn";
import { formatClock, formatRelativeDate } from "@/lib/utils/time";
import type { Course, Lesson } from "@/lib/types";

/** One resumable lesson. */
export interface ContinueEntry {
  course: Course;
  lesson: Lesson;
  /** 0–100 through this lesson. */
  percent: number;
  /** Last known playhead, for the "pick up at" line. */
  positionSec: number;
  /** ISO timestamp of the last progress write; drives the ordering. */
  updatedAt: string;
}

export interface ContinueWatchingRailProps {
  entries: readonly ContinueEntry[];
  /** Most rows shown; the caller sorts first. */
  limit?: number;
  /** Rendered instead of the rail when there is nothing in progress. */
  emptyState?: React.ReactNode;
  className?: string;
}

export function ContinueWatchingRail({
  entries,
  limit = 6,
  emptyState,
  className,
}: ContinueWatchingRailProps) {
  if (entries.length === 0) {
    return emptyState ? <div className={className}>{emptyState}</div> : null;
  }

  const visible = [...entries]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);

  return (
    <section className={cn("flex flex-col gap-4", className)} aria-labelledby="continue-heading">
      <Heading level={2} as="h2" id="continue-heading" className="text-xl sm:text-2xl">
        Continue watching
      </Heading>

      <Carousel label="Continue watching">
        {visible.map((entry) => {
          const href = `/learn/${entry.course.slug}/${entry.lesson.id}`;
          const complete = entry.percent >= 100;

          return (
            <CarouselItem key={`${entry.course.id}:${entry.lesson.id}`}>
              <article className="flex h-full min-w-0 flex-col gap-3 rounded-lg border border-line bg-surface p-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <Text size="xs" tone="muted" className="truncate">
                    {entry.course.title}
                  </Text>
                  <Heading level={3} as="h3" className="text-base leading-snug">
                    <span className="line-clamp-2">{entry.lesson.title}</span>
                  </Heading>
                </div>

                <div className="flex flex-col gap-1.5">
                  <ProgressBar
                    value={entry.percent}
                    label={`${entry.lesson.title} progress`}
                    size="sm"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted tabular-nums">
                      {complete
                        ? "Completed"
                        : `Pick up at ${formatClock(Math.floor(entry.positionSec))}`}
                    </span>
                    <Badge tone={complete ? "success" : "gold"}>
                      {entry.percent}%
                    </Badge>
                  </div>
                </div>

                <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                  <Text size="xs" tone="muted">
                    {formatRelativeDate(entry.updatedAt)}
                  </Text>
                </div>

                <Link
                  href={href}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-line bg-elevated px-4 text-sm font-semibold text-ink transition-colors hover:border-gold/50 hover:text-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                >
                  <PlayCircle aria-hidden className="size-4" />
                  {complete ? "Watch again" : "Resume"}
                  <span className="sr-only">: {entry.lesson.title}</span>
                </Link>
              </article>
            </CarouselItem>
          );
        })}
      </Carousel>
    </section>
  );
}