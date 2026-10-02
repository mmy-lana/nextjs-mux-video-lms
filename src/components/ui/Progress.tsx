import type { HTMLAttributes, ReactNode, SVGProps } from "react";

import { cn } from "@/lib/utils/cn";
import { clamp, roundTo } from "@/lib/utils/math";

/* ------------------------------------------------------------------ */
/* ProgressBar                                                         */
/* ------------------------------------------------------------------ */

export interface ProgressBarProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** 0–100. Values outside the range are clamped. */
  value: number;
  label: string;
  /** Rendered to the right of the track, e.g. `40%`. */
  valueLabel?: string;
  size?: "sm" | "md" | "lg";
  tone?: "gold" | "success";
  showValue?: boolean;
}

const TRACK_HEIGHT: Record<NonNullable<ProgressBarProps["size"]>, string> = {
  sm: "h-1",
  md: "h-1.5",
  lg: "h-2.5",
};

/**
 * A determinate progress bar.
 *
 * Uses `role="progressbar"` with the value exposed, and the accessible name
 * comes from the caller — a bar with no name is a mystery to a screen reader.
 */
export function ProgressBar({
  value,
  label,
  valueLabel,
  size = "md",
  tone = "gold",
  showValue = false,
  className,
  ...props
}: ProgressBarProps) {
  const percent = clamp(roundTo(value, 2), 0, 100);

  return (
    <div className={cn("flex items-center gap-3", className)} {...props}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={valueLabel ?? `${Math.round(percent)}%`}
        className={cn("relative w-full overflow-hidden rounded-full bg-elevated", TRACK_HEIGHT[size])}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300 ease-out-soft",
            tone === "success" ? "bg-success" : "bg-gold",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>

      {showValue ? (
        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted">
          {valueLabel ?? `${Math.round(percent)}%`}
        </span>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ProgressRing                                                        */
/* ------------------------------------------------------------------ */

export interface ProgressRingProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  /** 0–100. */
  value: number;
  size?: number;
  thickness?: number;
  label: string;
  tone?: "gold" | "success";
  children?: ReactNode;
}

/**
 * A circular progress indicator.
 *
 * The SVG is `aria-hidden` and the accessible value is published by a sibling
 * `role="progressbar"`, because a bare `<svg>` has no semantics to expose.
 */
export function ProgressRing({
  value,
  size = 72,
  thickness = 6,
  label,
  tone = "gold",
  className,
  children,
  ...props
}: ProgressRingProps) {
  const percent = clamp(roundTo(value, 2), 0, 100);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percent / 100);

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={`${Math.round(percent)}%`}
      className="relative inline-grid place-items-center"
      style={{ width: size, height: size }}
    >
      <svg
        aria-hidden
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        className="-rotate-90"
        {...props}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          className="stroke-elevated"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn(
            "transition-[stroke-dashoffset] duration-300 ease-out-soft",
            tone === "success" ? "stroke-success" : "stroke-gold",
          )}
        />
      </svg>

      {children ? (
        <span className="absolute inset-0 grid place-items-center text-sm font-semibold tabular-nums">
          {children}
        </span>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Skeleton / Spinner                                                  */
/* ------------------------------------------------------------------ */

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Rounded like a poster, or square like a text line. */
  shape?: "text" | "block" | "circle";
}

export function Skeleton({ className, shape = "text", ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={cn(
        "skeleton",
        shape === "circle" ? "size-full rounded-full" : shape === "block" ? "rounded-md" : "h-4 rounded-sm",
        className,
      )}
      {...props}
    />
  );
}

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  size?: "sm" | "md" | "lg";
  /** Announced to screen readers while a region is busy. */
  label?: string;
}

export function Spinner({ className, size = "md", label, ...props }: SpinnerProps) {
  const dimension = { sm: "size-4", md: "size-5", lg: "size-7" }[size];

  return (
    <span className={cn("inline-flex items-center gap-2", className)} {...props}>
      <span
        aria-hidden
        className={cn("inline-block animate-spin rounded-full border-2 border-line border-t-gold", dimension)}
      />
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
