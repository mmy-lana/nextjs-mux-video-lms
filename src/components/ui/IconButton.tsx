"use client";

/**
 * Icon-only button.
 *
 * The 44x44 hit area is enforced by the component, because a 20px icon is
 * exactly where the touch-target rule gets broken. `aria-label` is required —
 * there is no visible text to name it otherwise.
 */

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/utils/cn";
import { cva } from "./cva";

export const iconButtonVariants = cva({
  base: "inline-flex size-11 shrink-0 items-center justify-center rounded-md transition-colors duration-150 ease-out-soft disabled:pointer-events-none disabled:opacity-45",
  variants: {
    variant: {
      primary: "bg-gold text-gold-ink hover:bg-gold/90",
      secondary: "border border-line bg-surface text-ink hover:bg-elevated",
      ghost: "text-ink hover:bg-elevated",
      danger: "text-danger hover:bg-danger/15",
    },
    size: {
      sm: "size-9",
      md: "size-11",
      lg: "size-12",
    },
  },
  defaults: { variant: "ghost", size: "md" },
});

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color" | "aria-label"> {
  /** Required: an icon-only control has no other accessible name. */
  "aria-label": string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, variant = "ghost", size = "md", icon, children, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={iconButtonVariants({ variant, size, className })}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
});
