"use client";

/**
 * Button.
 *
 * Every variant is at least 44px tall so the touch-target rule holds without
 * the caller having to remember it. `loading` keeps the button in the layout
 * (no width jump) and marks it busy for assistive technology.
 */

import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/utils/cn";
import { cva } from "./cva";

export const buttonVariants = cva({
  base: "relative inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors duration-150 ease-out-soft select-none disabled:pointer-events-none disabled:opacity-45",
  variants: {
    variant: {
      primary:
        "bg-gold text-gold-ink hover:bg-gold/90 shadow-[0_1px_0_rgb(255_255_255/0.18)_inset,0_10px_30px_-16px_rgb(227_176_75/0.55)]",
      secondary:
        "border border-line bg-surface text-ink hover:bg-elevated hover:border-gold/40",
      ghost: "text-ink hover:bg-elevated",
      danger: "bg-danger/15 text-danger border border-danger/40 hover:bg-danger/25",
    },
    size: {
      sm: "min-h-11 px-3.5 text-sm",
      md: "min-h-11 px-5 text-sm",
      lg: "min-h-12 px-7 text-base",
    },
    block: {
      true: "w-full",
      false: "",
    },
  },
  defaults: { variant: "primary", size: "md", block: false },
});

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color">,
    VariantPropsOfButton {
  loading?: boolean;
  /** Announced while `loading` is true; also used as the visible fallback. */
  loadingText?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

type VariantPropsOfButton = {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  block?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = "primary",
    size = "md",
    block = false,
    loading = false,
    loadingText,
    leftIcon,
    rightIcon,
    disabled,
    children,
    type = "button",
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonVariants({ variant, size, block, className })}
      {...props}
    >
      {loading ? (
        <Loader2 aria-hidden className="size-4 shrink-0 animate-spin" />
      ) : (
        leftIcon
      )}
      <span className="truncate">{loading && loadingText ? loadingText : children}</span>
      {!loading && rightIcon}
    </button>
  );
});

/** Visually hidden but announced text, for icon-only affordances. */
export function ButtonLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={cn("sr-only", className)}>{children}</span>;
}
