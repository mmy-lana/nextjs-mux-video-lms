"use client";

/**
 * Shared screen states: empty, error and multi-step progress.
 *
 * Every screen in the plan's state matrix needs all three, and they must not
 * drift apart, so they are built once here and take their copy from props.
 */

import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Heading, Text } from "@/components/ui/Layout";
import { cn } from "@/lib/utils/cn";

/* ------------------------------------------------------------------ */
/* EmptyState                                                          */
/* ------------------------------------------------------------------ */

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  /**
   * Primary action, e.g. "Browse courses".
   *
   * Give `href` for navigation and omit `onClick`; give `onClick` for an in-place
   * action. A link that also needs a click handler is almost always a link that
   * should have been a link.
   */
  action?: { label: string; onClick?: () => void; href?: string };
  /** Secondary action, e.g. "Clear filters". */
  secondaryAction?: { label: string; onClick?: () => void };
  className?: string;
  children?: React.ReactNode;
}

/**
 * A screen with nothing to show.
 *
 * Always names the situation and always offers a way forward — an empty state
 * with no action is a dead end.
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
  secondaryAction,
  className,
  children,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-line px-6 py-12 text-center",
        className,
      )}
    >
      <span aria-hidden className="grid size-12 place-items-center rounded-full bg-elevated text-muted">
        {icon ?? <Inbox className="size-5" />}
      </span>

      <div className="max-w-md">
        <Heading level={3} as="p" className="text-lg">
          {title}
        </Heading>
        {description ? (
          <Text tone="muted" size="sm" className="mt-1.5">
            {description}
          </Text>
        ) : null}
      </div>

      {children}

      {action || secondaryAction ? (
        <div className="flex flex-wrap items-center justify-center gap-3">
          {action?.href ? (
            <a
              href={action.href}
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-gold px-5 text-sm font-semibold text-gold-ink transition-colors hover:bg-gold/90"
            >
              {action.label}
            </a>
          ) : action ? (
            <Button onClick={action.onClick}>{action.label}</Button>
          ) : null}

          {secondaryAction ? (
            <Button variant="secondary" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ErrorState                                                          */
/* ------------------------------------------------------------------ */

export interface ErrorStateProps {
  title?: string;
  description?: string;
  /** Human-readable cause, e.g. a server error message. */
  detail?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

/**
 * A recoverable failure.
 *
 * `onRetry` is optional because some failures genuinely cannot be retried; when
 * it is absent the component says so rather than showing a dead button.
 */
export function ErrorState({
  title = "Something went wrong",
  description = "This section could not be loaded. The rest of the page still works.",
  detail,
  onRetry,
  retryLabel = "Try again",
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-lg border border-danger/30 bg-danger/8 px-6 py-10 text-center",
        className,
      )}
    >
      <span aria-hidden className="grid size-12 place-items-center rounded-full bg-danger/12 text-danger">
        <AlertTriangle className="size-5" />
      </span>

      <div className="max-w-md">
        <Heading level={3} as="p" className="text-lg">
          {title}
        </Heading>
        <Text tone="muted" size="sm" className="mt-1.5">
          {description}
        </Text>
        {detail ? (
          <Text tone="danger" size="xs" className="mt-2 font-mono break-words">
            {detail}
          </Text>
        ) : null}
      </div>

      {onRetry ? (
        <Button
          variant="secondary"
          onClick={onRetry}
          leftIcon={<RefreshCw className="size-4" />}
        >
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stepper                                                             */
/* ------------------------------------------------------------------ */

export interface StepperProps {
  /** Ordered steps; `state` drives both the look and the announcement. */
  steps: ReadonlyArray<{ id: string; label: string; description?: string }>;
  currentStepId: string;
  /** Ids the learner has already finished. */
  completedStepIds?: readonly string[];
  className?: string;
}

/**
 * Progress through a multi-step flow (direct upload, publish checks).
 *
 * The current step is announced via `aria-current="step"`, and state is
 * conveyed by icon and text as well as colour.
 */
export function Stepper({
  steps,
  currentStepId,
  completedStepIds = [],
  className,
}: StepperProps) {
  const currentIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === currentStepId),
  );

  return (
    <ol className={cn("flex flex-col gap-1", className)}>
      {steps.map((step, index) => {
        const isComplete = completedStepIds.includes(step.id) || index < currentIndex;
        const isCurrent = step.id === currentStepId;

        return (
          <li
            key={step.id}
            aria-current={isCurrent ? "step" : undefined}
            className="flex items-center gap-3 py-1.5"
          >
            <span
              aria-hidden
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold",
                isComplete && "border-success/50 bg-success/15 text-success",
                isCurrent && !isComplete && "border-gold bg-gold/15 text-gold",
                !isComplete && !isCurrent && "border-line text-muted",
              )}
            >
              {isComplete ? "✓" : index + 1}
            </span>

            <span className="min-w-0">
              <span className={cn("block text-sm", isCurrent ? "font-semibold text-ink" : "text-muted")}>
                {step.label}
                {isCurrent ? <span className="sr-only"> (current step)</span> : null}
                {isComplete && !isCurrent ? <span className="sr-only"> (completed)</span> : null}
              </span>
              {step.description ? (
                <span className="block text-xs text-muted">{step.description}</span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
