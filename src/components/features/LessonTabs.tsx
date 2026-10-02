"use client";

/**
 * LessonTabs — Overview / Notes / Resources beside the player.
 *
 * A shell, not a data component: it takes the three panels as nodes and owns
 * only which one is showing. That keeps the tab behaviour testable without a
 * player, a store or a course.
 *
 * The Resources tab is disabled rather than absent when a lesson has none, so
 * the tab set does not change width between lessons.
 */

import { useId, useState, type ReactNode } from "react";
import { FileText, Link2, NotebookPen } from "lucide-react";

import { Tabs, TabsList, TabsPanel, TabsTrigger } from "@/components/compound/Tabs";
import { cn } from "@/lib/utils/cn";

export type LessonTabValue = "overview" | "notes" | "resources";

export interface LessonTabsProps {
  overview: ReactNode;
  notes: ReactNode;
  resources?: ReactNode;
  /** Badge counts on the triggers; omitted when zero. */
  notesCount?: number;
  resourceCount?: number;
  /** Accessible name for the tab set. */
  label?: string;
  defaultValue?: LessonTabValue;
  /** Controlled selection; pair with `onValueChange` to deep-link a tab. */
  value?: LessonTabValue;
  onValueChange?: (value: LessonTabValue) => void;
  className?: string;
}

export function LessonTabs({
  overview,
  notes,
  resources,
  notesCount,
  resourceCount,
  label = "Lesson details",
  defaultValue = "overview",
  value,
  onValueChange,
  className,
}: LessonTabsProps) {
  const [uncontrolled, setUncontrolled] = useState<LessonTabValue>(defaultValue);
  const active = value ?? uncontrolled;
  const baseId = useId();

  const hasResources = resourceCount === undefined ? Boolean(resources) : resourceCount > 0;

  const select = (next: string) => {
    const typed = next as LessonTabValue;
    if (value === undefined) setUncontrolled(typed);
    onValueChange?.(typed);
  };

  return (
    <Tabs
      value={active}
      onValueChange={select}
      className={cn("flex min-w-0 flex-col", className)}
    >
      <TabsList label={label} className="sticky top-0 z-10 bg-bg/95 backdrop-blur-sm">
        <TabsTrigger value="overview" icon={<FileText className="size-4" />}>
          Overview
        </TabsTrigger>

        <TabsTrigger value="notes" icon={<NotebookPen className="size-4" />}>
          Notes
          {notesCount ? (
            <span className="ml-1.5 rounded-sm bg-elevated px-1.5 text-xs text-muted tabular-nums">
              {notesCount}
              <span className="sr-only"> saved</span>
            </span>
          ) : null}
        </TabsTrigger>

        <TabsTrigger value="resources" disabled={!hasResources} icon={<Link2 className="size-4" />}>
          Resources
          {resourceCount ? (
            <span className="ml-1.5 rounded-sm bg-elevated px-1.5 text-xs text-muted tabular-nums">
              {resourceCount}
            </span>
          ) : null}
        </TabsTrigger>
      </TabsList>

      <TabsPanel value="overview" className="min-w-0 pt-5">
        {overview}
      </TabsPanel>

      <TabsPanel value="notes" className="min-w-0 pt-5">
        {notes}
      </TabsPanel>

      <TabsPanel value="resources" className="min-w-0 pt-5">
        {hasResources ? (
          resources
        ) : (
          <p id={`${baseId}-resources-empty`} className="text-sm text-muted">
            This lesson has no downloadable resources.
          </p>
        )}
      </TabsPanel>
    </Tabs>
  );
}