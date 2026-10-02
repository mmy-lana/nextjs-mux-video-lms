import type { ElementType, HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  as?: ElementType;
  tone?: "surface" | "elevated" | "outline";
  padding?: "none" | "sm" | "md" | "lg";
  /** Adds the subtle inner highlight that lifts a surface off the page. */
  raised?: boolean;
}

const TONE: Record<NonNullable<CardProps["tone"]>, string> = {
  surface: "bg-surface",
  elevated: "bg-elevated",
  outline: "bg-transparent border border-line",
};

const PADDING: Record<NonNullable<CardProps["padding"]>, string> = {
  none: "",
  sm: "p-3",
  md: "p-5",
  lg: "p-6 sm:p-8",
};

export function Card({
  className,
  as: Component = "div",
  tone = "surface",
  padding = "md",
  raised = true,
  ...props
}: CardProps) {
  return (
    <Component
      className={cn(
        "rounded-lg",
        TONE[tone],
        PADDING[padding],
        raised && "shadow-[0_1px_0_rgb(255_255_255/0.04)_inset,0_18px_40px_-24px_rgb(0_0_0/0.9)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

export function CardTitle({ className, as: Component = "h3", ...props }: HTMLAttributes<HTMLHeadingElement> & { as?: ElementType }) {
  return <Component className={cn("text-lg text-ink", className)} {...props} />;
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("text-sm leading-relaxed text-muted", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-4 flex flex-wrap items-center gap-3", className)} {...props} />;
}

/* ------------------------------------------------------------------ */
/* Avatar                                                              */
/* ------------------------------------------------------------------ */

/**
 * Fallback avatar gradient.
 *
 * Both stops keep the `--color-gold-ink` initials above 4.5:1, so an avatar
 * without a course-specific gradient is still readable.
 */
const DEFAULT_AVATAR_GRADIENT = "linear-gradient(135deg, #E3B04B, #D98A3D)";

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  name: string;
  /** Two hex colours; the first two letters are drawn over the gradient. */
  gradient?: [string, string];
  size?: "xs" | "sm" | "md" | "lg";
}

const AVATAR_SIZE: Record<NonNullable<AvatarProps["size"]>, string> = {
  xs: "size-7 text-[10px]",
  sm: "size-9 text-xs",
  md: "size-11 text-sm",
  lg: "size-16 text-lg",
};

/** Gradient initials avatar. */
export function Avatar({ name, gradient, size = "md", className, style, ...props }: AvatarProps) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials =
    words.length === 0
      ? "?"
      : words.length === 1
        ? words[0].slice(0, 2).toUpperCase()
        : `${words[0][0] ?? ""}${words[words.length - 1][0] ?? ""}`.toUpperCase();

  return (
    <span
      role="img"
      aria-label={name}
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full font-semibold tracking-wide text-gold-ink",
        AVATAR_SIZE[size],
        className,
      )}
      style={{
        backgroundImage: gradient
          ? `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`
          : DEFAULT_AVATAR_GRADIENT,
        ...style,
      }}
      {...props}
    >
      {initials}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Separator / VisuallyHidden / Container                              */
/* ------------------------------------------------------------------ */

export interface SeparatorProps extends HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
  /** A gold hairline instead of a plain border. */
  decorative?: boolean;
}

export function Separator({
  className,
  orientation = "horizontal",
  decorative = false,
  ...props
}: SeparatorProps) {
  return (
    <div
      role={decorative ? "none" : "separator"}
      aria-orientation={decorative ? undefined : orientation}
      className={cn(
        decorative ? "hairline" : "bg-line",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  );
}

/** Content for assistive technology only. */
export function VisuallyHidden({
  children,
  as: Component = "span",
  ...props
}: { children: ReactNode; as?: ElementType } & HTMLAttributes<HTMLElement>) {
  return (
    <Component className="sr-only" {...props}>
      {children}
    </Component>
  );
}

export interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  size?: "default" | "narrow" | "wide";
  as?: ElementType;
}

export function Container({ className, size = "default", as: Component = "div", ...props }: ContainerProps) {
  return (
    <Component
      className={cn(
        "container-page",
        size === "narrow" && "max-w-3xl",
        size === "wide" && "max-w-[90rem]",
        className,
      )}
      {...props}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Heading / Text type scale                                           */
/* ------------------------------------------------------------------ */

export type TextTone = "default" | "muted" | "gold" | "danger" | "success" | "inherit";

const TONE_TEXT: Record<TextTone, string> = {
  default: "text-ink",
  muted: "text-muted",
  gold: "text-gold",
  danger: "text-danger",
  success: "text-success",
  inherit: "",
};

export interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  tone?: TextTone;
  /** Centred block with a larger display size. */
  display?: boolean;
  as?: ElementType;
}

const HEADING_SIZE: Record<number, string> = {
  1: "text-3xl sm:text-4xl",
  2: "text-2xl sm:text-3xl",
  3: "text-xl sm:text-2xl",
  4: "text-lg",
  5: "text-base",
  6: "text-sm",
};

export function Heading({
  level = 2,
  tone = "default",
  display = false,
  as,
  className,
  children,
  ...props
}: HeadingProps) {
  const Component = (as ?? `h${level}`) as ElementType;

  return (
    <Component
      className={cn(
        display
          ? "text-[clamp(2rem,6vw,4.5rem)] leading-[1.05] font-normal"
          : HEADING_SIZE[level],
        TONE_TEXT[tone],
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}

export interface TextProps extends HTMLAttributes<HTMLParagraphElement> {
  as?: ElementType;
  tone?: TextTone;
  size?: "xs" | "sm" | "base" | "lg";
}

const TEXT_SIZE: Record<NonNullable<TextProps["size"]>, string> = {
  xs: "text-xs",
  sm: "text-sm",
  base: "text-base",
  lg: "text-lg",
};

export function Text({
  as: Component = "p",
  tone = "default",
  size = "base",
  className,
  children,
  ...props
}: TextProps) {
  return (
    <Component className={cn(TEXT_SIZE[size], TONE_TEXT[tone], className)} {...props}>
      {children}
    </Component>
  );
}

/** Small uppercase label used for section eyebrows and metadata. */
export function Eyebrow({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("text-xs font-semibold tracking-[0.18em] text-gold uppercase", className)}
      {...props}
    />
  );
}
