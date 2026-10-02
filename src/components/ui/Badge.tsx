import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";
import { cva } from "./cva";

/* ------------------------------------------------------------------ */
/* Badge                                                               */
/* ------------------------------------------------------------------ */

export const badgeVariants = cva({
  base: "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap",
  variants: {
    tone: {
      neutral: "border-line bg-elevated text-muted",
      gold: "border-gold/40 bg-gold/12 text-gold",
      success: "border-success/40 bg-success/12 text-success",
      danger: "border-danger/40 bg-danger/12 text-danger",
      solid: "border-transparent bg-gold text-gold-ink",
    },
  },
  defaults: { tone: "neutral" },
});

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: "neutral" | "gold" | "success" | "danger" | "solid";
}

/**
 * A status label.
 *
 * Tone is never the only signal — the text always says what the state is, so
 * the component is usable without colour perception (plan 8.2).
 */
export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return <span className={badgeVariants({ tone, className })} {...props} />;
}

/* ------------------------------------------------------------------ */
/* Chip                                                                */
/* ------------------------------------------------------------------ */

export const chipVariants = cva({
  base: "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm transition-colors duration-150 ease-out-soft",
  variants: {
    selected: {
      true: "border-gold bg-gold/15 text-ink",
      false: "border-line bg-surface text-muted hover:border-gold/40 hover:text-ink",
    },
  },
  defaults: { selected: false },
});

export interface ChipProps extends Omit<HTMLAttributes<HTMLButtonElement>, "onSelect"> {
  selected: boolean;
  /** Native button semantics; `role="group"` lives on the parent. */
  type?: "button" | "submit" | "reset";
}

/**
 * A toggleable filter chip.
 *
 * Rendered as a real `<button>` with `aria-pressed` so screen readers announce
 * the state, rather than a styled `<div>`.
 */
export function Chip({ className, selected, children, type = "button", ...props }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={chipVariants({ selected, className })}
      {...props}
    >
      {children}
    </button>
  );
}
