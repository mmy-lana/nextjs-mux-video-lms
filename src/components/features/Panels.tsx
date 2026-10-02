import { Flame, Award, CalendarClock, AlertTriangle, BookOpen } from "lucide-react";

import { Avatar, Heading, Text } from "@/components/ui/Layout";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ProgressRing } from "@/components/ui/Progress";
import { cn } from "@/lib/utils/cn";
import { formatDateLong, formatDuration, formatWatchTime } from "@/lib/utils/time";
import { formatCount } from "@/lib/utils/format";
import { courseTotals } from "@/lib/domain/totals";
import type { ActivityDay, Course, Instructor } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* InstructorCard                                                      */
/* ------------------------------------------------------------------ */

export interface InstructorCardProps {
  instructor: Instructor;
  className?: string;
}

export function InstructorCard({ instructor, className }: InstructorCardProps) {
  return (
    <section
      aria-label={`Instructor: ${instructor.name}`}
      className={cn(
        "flex flex-col items-start gap-4 rounded-lg border border-line bg-surface p-5 sm:flex-row",
        className,
      )}
    >
      <Avatar
        name={instructor.name}
        gradient={instructor.avatarGradient}
        size="lg"
        className="shrink-0"
      />

      <div className="min-w-0">
        <Heading level={3} as="h3" className="text-lg">
          {instructor.name}
        </Heading>
        <Text tone="gold" size="sm" className="mt-0.5">
          {instructor.headline}
        </Text>
        <Text tone="muted" size="sm" className="mt-2.5 leading-relaxed">
          {instructor.bio}
        </Text>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* StreakCard                                                          */
/* ------------------------------------------------------------------ */

export interface StreakCardProps {
  /** Current streak, in consecutive days. */
  streakDays: number;
  /** Seven entries, oldest first, with `secondsWatched` per day. */
  series: ReadonlyArray<{ date: string; secondsWatched: number }>;
  totalSeconds: number;
  lessonsCompleted: number;
  className?: string;
}

function weekdayLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1, 12);

  return new Intl.DateTimeFormat("en", { weekday: "narrow" }).format(value);
}

/**
 * Study streak with a weekly bar chart.
 *
 * The bars are supplemented by a text summary, so the information is available
 * without reading the chart.
 */
export function StreakCard({
  streakDays,
  series,
  totalSeconds,
  lessonsCompleted,
  className,
}: StreakCardProps) {
  const peak = Math.max(60, ...series.map((day) => day.secondsWatched));

  return (
    <section
      aria-label="Study activity"
      className={cn("flex flex-col gap-4 rounded-lg border border-line bg-surface p-5", className)}
    >
      <div className="flex items-center gap-4">
        <ProgressRing value={Math.min(100, streakDays * 14)} label={`${streakDays} day streak`} size={64} thickness={5}>
          <Flame aria-hidden className="size-5 text-gold" />
        </ProgressRing>

        <div className="min-w-0">
          <Heading level={3} as="h2" className="text-lg">
            {streakDays === 0
              ? "Start a streak today"
              : `${streakDays} day streak`}
          </Heading>
          <Text tone="muted" size="sm" className="mt-0.5">
            {formatWatchTime(totalSeconds)} watched · {formatCount(lessonsCompleted)} lessons finished
          </Text>
        </div>
      </div>

      <div>
        {/* The chart is decorative; the summary above carries the same numbers. */}
        <div aria-hidden className="flex h-20 items-end gap-1.5">
          {series.map((day) => {
            const height = Math.max(4, Math.round((day.secondsWatched / peak) * 100));

            return (
              <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <div
                  className={cn(
                    "w-full rounded-sm transition-[height] duration-300 ease-out-soft",
                    day.secondsWatched >= 60 ? "bg-gold" : "bg-line",
                  )}
                  style={{ height: `${height}%` }}
                />
                <span className="text-[10px] text-muted">{weekdayLabel(day.date)}</span>
              </div>
            );
          })}
        </div>

        <p className="sr-only">
          {series
            .map((day) => `${day.date}: ${formatDuration(day.secondsWatched)} watched`)
            .join(". ")}
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* MuxNotConfigured                                                    */
/* ------------------------------------------------------------------ */

/**
 * Studio's "no credentials" state.
 *
 * Names the exact variables to set and says plainly what still works without
 * them, because a dead end with no next step wastes the visit.
 */
export function MuxNotConfigured({ className }: { className?: string }) {
  return (
    <section
      aria-labelledby="mux-not-configured-title"
      className={cn(
        "flex flex-col items-start gap-4 rounded-lg border border-gold/30 bg-gold/6 p-6",
        className,
      )}
    >
      <span aria-hidden className="grid size-11 place-items-center rounded-full bg-gold/12 text-gold">
        <AlertTriangle className="size-5" />
      </span>

      <div className="min-w-0">
        <Heading level={2} id="mux-not-configured-title" as="h2" className="text-xl">
          Studio needs Mux credentials
        </Heading>

        <Text tone="muted" size="sm" className="mt-2 max-w-prose">
          Uploading video requires a Mux account. Add these server-side variables to{" "}
          <code className="rounded-sm bg-surface px-1.5 py-0.5 font-mono text-xs">
            .env.local
          </code>{" "}
          and restart the dev server:
        </Text>

        <ul className="mt-3 flex flex-col gap-1.5 font-mono text-xs text-ink">
          <li>MUX_TOKEN_ID</li>
          <li>MUX_TOKEN_SECRET</li>
          <li className="text-muted">MUX_SIGNING_KEY_ID — only for signed playback</li>
          <li className="text-muted">MUX_PRIVATE_KEY — only for signed playback</li>
        </ul>

        <Text tone="muted" size="sm" className="mt-4 max-w-prose">
          Everything else still works without them: browse the catalog, watch the
          free lessons, take notes and track progress. You can also create a
          text-only draft here and attach an existing Mux playback ID by hand.
        </Text>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* CertificateView                                                     */
/* ------------------------------------------------------------------ */

export interface CertificateViewProps {
  course: Course;
  instructor: Instructor | null;
  learnerName: string;
  /** ISO date the course was completed. */
  completedAt: string;
  className?: string;
}

/**
 * A printable certificate.
 *
 * `@media print` (in globals.css) hides the app shell and forces landscape, so
 * this component only has to lay the document out.
 */
export function CertificateView({
  course,
  instructor,
  learnerName,
  completedAt,
  className,
}: CertificateViewProps) {
  const totals = courseTotals(course);

  return (
    <article
      aria-label={`Certificate of completion for ${course.title}`}
      className={cn(
        "certificate relative mx-auto flex w-full max-w-4xl flex-col gap-8 rounded-lg border border-gold/35 bg-surface p-8 sm:p-12",
        className,
      )}
    >
      <div aria-hidden className="absolute inset-0 rounded-lg hairline opacity-60" />

      <header className="flex flex-col items-center gap-3 text-center">
        <Award aria-hidden className="size-10 text-gold" />
        <Heading level={1} as="p" display className="text-3xl sm:text-4xl">
          Certificate of Completion
        </Heading>
        <Text tone="muted" size="sm" className="flex items-center gap-2">
          <CalendarClock aria-hidden className="size-4" />
          Issued {formatDateLong(completedAt)}
        </Text>
      </header>

      <div className="flex flex-col items-center gap-2 text-center">
        <Text tone="muted" size="sm">
          This certifies that
        </Text>
        <p className="font-serif text-3xl text-ink sm:text-4xl">{learnerName}</p>
        <Text tone="muted" size="sm">
          has completed
        </Text>
        <Heading level={2} as="h2" className="max-w-2xl text-2xl sm:text-3xl">
          {course.title}
        </Heading>
      </div>

      <div className="flex flex-col items-center gap-1 text-center">
        <Text tone="muted" size="sm">
          {formatCount(totals.lessonCount)} lessons across {formatCount(totals.moduleCount)} modules
          {instructor ? ` · taught by ${instructor.name}` : ""}
        </Text>
        {totals.totalDurationSec !== null ? (
          <Text tone="muted" size="sm">
            {formatDuration(totals.totalDurationSec)} of material
          </Text>
        ) : (
          <Text tone="muted" size="xs">
            Run time is calculated from what the learner watched.
          </Text>
        )}
      </div>

      <footer className="flex flex-col items-center gap-1 text-center">
        <BookOpen aria-hidden className="size-4 text-muted" />
        <Text tone="muted" size="xs">
          {course.subtitle}
        </Text>
      </footer>
    </article>
  );
}

export interface CertificateActionsProps {
  onPrint: () => void;
  className?: string;
}

export function CertificateActions({ onPrint, className }: CertificateActionsProps) {
  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-3", className)}>
      <Button onClick={onPrint}>Print / Save as PDF</Button>
      <Badge tone="gold">Local record</Badge>
    </div>
  );
}
