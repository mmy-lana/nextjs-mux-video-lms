"use client";

/**
 * CurriculumList and LessonSidebar.
 *
 * An accordion of modules with lesson rows. Each row states its state three
 * ways — icon, word and badge — because colour alone excludes anyone who cannot
 * distinguish the green from the gold (plan §8.2).
 *
 * Rows use `content-visibility: auto` so a 50-lesson curriculum does not pay
 * layout cost for everything below the fold.
 */

import Link from "next/link";
import { Check, CirclePlay, Lock, PlayCircle } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/Progress";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/compound/Accordion";
import { cn } from "@/lib/utils/cn";
import { formatClock, formatDuration } from "@/lib/utils/time";
import { progressKey } from "@/lib/utils/ids";
import { lessonPercent, resolveDuration } from "@/lib/domain/progress";
import type { Course, LessonProgress } from "@/lib/types";

/** How a lesson is presented to the learner right now. */
export type LessonState = "completed" | "current" | "preview" | "locked" | "available";

export interface CurriculumListProps {
  course: Course;
  /** Progress keyed by `${courseId}:${lessonId}`. */
  progressMap: Record<string, LessonProgress>;
  durations?: Record<string, number>;
  enrolled: boolean;
  /** Lesson currently open in the player, if any. */
  currentLessonId?: string | null;
  /** Prefix for row links; empty renders rows as plain list items. */
  linkPrefix?: string;
  className?: string;
}

function stateForLesson(
  lessonId: string,
  courseId: string,
  enrolled: boolean,
  progressMap: Record<string, LessonProgress>,
  currentLessonId: string | null | undefined,
  isFreePreview: boolean,
): LessonState {
  if (progressMap[progressKey(courseId, lessonId)]?.completed) return "completed";
  if (currentLessonId === lessonId) return "current";
  if (!enrolled && !isFreePreview) return "locked";
  if (isFreePreview && !enrolled) return "preview";
  return "available";
}

const STATE_META: Record<
  LessonState,
  { label: string; icon: typeof Check; className: string }
> = {
  completed: { label: "Completed", icon: Check, className: "text-success" },
  current: { label: "Now playing", icon: PlayCircle, className: "text-gold" },
  preview: { label: "Free preview", icon: CirclePlay, className: "text-gold" },
  locked: { label: "Locked", icon: Lock, className: "text-muted" },
  available: { label: "Ready", icon: CirclePlay, className: "text-muted" },
};

export function CurriculumList({
  course,
  progressMap,
  durations = {},
  enrolled,
  currentLessonId,
  linkPrefix = `/learn/${course.slug}`,
  className,
}: CurriculumListProps) {
  const modules = [...course.modules].sort((a, b) => a.order - b.order);

  return (
    <Accordion
      type="multiple"
      // Open the module holding the current lesson, so deep links land in view.
      defaultValue={modules
        .filter((module) => module.lessons.some((lesson) => lesson.id === currentLessonId))
        .map((module) => module.id)}
      className={cn("divide-y divide-line border-y border-line", className)}
    >
      {modules.map((module, moduleIndex) => {
        const lessons = [...module.lessons].sort((a, b) => a.order - b.order);
        const completed = lessons.filter(
          (lesson) => progressMap[progressKey(course.id, lesson.id)]?.completed,
        ).length;

        return (
          <AccordionItem key={module.id} value={module.id}>
            <AccordionTrigger value={module.id}>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-semibold text-ink">
                  Module {moduleIndex + 1} · {module.title}
                </span>
                <span className="text-xs text-muted">
                  {completed} of {lessons.length} complete
                </span>
              </span>
            </AccordionTrigger>

            <AccordionContent value={module.id}>
              <ul className="flex flex-col">
                {lessons.map((lesson, lessonIndex) => {
                  const progress = progressMap[progressKey(course.id, lesson.id)];
                  const state = stateForLesson(
                    lesson.id,
                    course.id,
                    enrolled,
                    progressMap,
                    currentLessonId,
                    lesson.isFreePreview,
                  );

                  const meta = STATE_META[state];
                  const Icon = meta.icon;
                  const duration = resolveDuration(lesson, durations);
                  const percent = lessonPercent(progress ?? null, duration);
                  const locked = state === "locked";

                  const row = (
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="flex min-w-0 items-center gap-2.5">
                        {/* min-w-0 is what stops a long title widening the row. */}
                        <span className="w-6 shrink-0 text-xs text-muted tabular-nums">
                          {lessonIndex + 1}
                        </span>

                        <Icon
                          aria-hidden
                          className={cn("size-4 shrink-0", meta.className)}
                        />

                        <span className="min-w-0 flex-1 truncate text-sm text-ink">
                          {lesson.title}
                        </span>

                        {/* Unknown durations show an em dash, never a guess. */}
                        <span className="shrink-0 text-xs text-muted tabular-nums">
                          {formatDuration(duration)}
                        </span>
                      </span>

                      {/* State is spelled out as text as well as an icon. */}
                      <span className="flex items-center gap-2 pl-[3.25rem]">
                        <span className={cn("text-xs", meta.className)}>{meta.label}</span>
                        {percent > 0 && percent < 100 ? (
                          <span className="text-xs text-muted">{percent}% watched</span>
                        ) : null}
                      </span>
                    </span>
                  );

                  return (
                    <li
                      key={lesson.id}
                      className="row-virtual border-b border-line/60 last:border-b-0"
                    >
                      {locked ? (
                        <div className="flex min-h-11 items-center px-1 py-2 opacity-70">
                          {row}
                        </div>
                      ) : (
                        <Link
                          href={`${linkPrefix}/${lesson.id}`}
                          className="flex min-h-11 items-center rounded-sm px-1 py-2 transition-colors hover:bg-surface"
                        >
                          {row}
                          <span className="sr-only">
                            {` — lesson ${lessonIndex + 1}, ${meta.label}`}
                          </span>
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}

export interface LessonSidebarProps extends CurriculumListProps {
  /** 0–100 across the whole course. */
  coursePercent: number;
  onNavigate?: () => void;
}

/**
 * The curriculum beside the player.
 *
 * On desktop it is a sticky column; on mobile the page wraps it in a sheet, so
 * this component only has to render the list itself.
 */
export function LessonSidebar({
  coursePercent,
  currentLessonId,
  ...props
}: LessonSidebarProps) {
  const currentTitle = currentLessonId
    ? props.course.modules
        .flatMap((module) => module.lessons)
        .find((lesson) => lesson.id === currentLessonId)?.title
    : null;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium text-ink">Your progress</span>
          <span className="text-sm text-muted tabular-nums">{coursePercent}%</span>
        </div>
        <ProgressBar value={coursePercent} label="Course progress" size="sm" />
      </div>

      {currentTitle ? (
        <div className="flex min-w-0 items-center gap-2">
          <Badge tone="gold">Now playing</Badge>
          <span className="min-w-0 truncate text-sm text-muted">{currentTitle}</span>
        </div>
      ) : null}

      <CurriculumList currentLessonId={currentLessonId} {...props} />
    </div>
  );
}

export { formatClock };
