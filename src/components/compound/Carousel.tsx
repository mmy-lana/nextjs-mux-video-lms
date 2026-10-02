"use client";

/**
 * Carousel.
 *
 * Native horizontal scrolling with CSS scroll-snap, so touch swipe works with
 * no JavaScript gesture handling. Prev/next buttons are always visible from
 * 768px up — never revealed on hover — and scroll by a whole card so the
 * result is predictable rather than "one third of a card".
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { IconButton } from "@/components/ui/IconButton";
import { cn } from "@/lib/utils/cn";

export interface CarouselProps extends Omit<HTMLAttributes<HTMLDivElement>, "onScroll"> {
  /** Accessible name for the scrolling region. */
  label: string;
  children: ReactNode;
  /** Hide the arrow controls below this width, where swipe is the natural input. */
  controlsFrom?: "sm" | "md" | "lg";
  className?: string;
}

export function Carousel({
  label,
  children,
  controlsFrom = "md",
  className,
  ...props
}: CarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollBack, setCanScrollBack] = useState(false);
  const [canScrollForward, setCanScrollForward] = useState(false);

  const update = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;

    const maxScroll = track.scrollWidth - track.clientWidth;
    // One pixel of slack absorbs sub-pixel rounding at the ends.
    setCanScrollBack(track.scrollLeft > 1);
    setCanScrollForward(track.scrollLeft < maxScroll - 1);
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    update();
    track.addEventListener("scroll", update, { passive: true });

    const observer = new ResizeObserver(update);
    observer.observe(track);

    return () => {
      track.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [update]);

  /** Advance by roughly one full card, clamped to the scroll range. */
  const scrollByCard = (direction: -1 | 1) => {
    const track = trackRef.current;
    if (!track) return;

    const firstCard = track.firstElementChild as HTMLElement | null;
    const card = firstCard ? firstCard.getBoundingClientRect().width : track.clientWidth * 0.8;
    const gap = parseFloat(getComputedStyle(track).columnGap || "0") || 16;

    track.scrollBy({ left: direction * (card + gap), behavior: "smooth" });
  };

  const controlsVisible = {
    sm: "hidden sm:flex",
    md: "hidden md:flex",
    lg: "hidden lg:flex",
  }[controlsFrom];

  return (
    <div className={cn("group/carousel relative", className)} {...props}>
      <div
        ref={trackRef}
        role="group"
        aria-label={label}
        // The track itself is focusable so arrow keys can scroll it.
        tabIndex={0}
        className="scroll-x flex snap-x snap-mandatory gap-4 pb-1 focus-visible:outline-2 focus-visible:outline-gold"
      >
        {children}
      </div>

      <div
        className={cn(
          "pointer-events-none absolute inset-y-0 -left-3 items-center gap-2 pl-3 md:-left-4",
          controlsVisible,
        )}
      >
        <IconButton
          aria-label={`Scroll ${label} backwards`}
          icon={<ChevronLeft className="size-4" />}
          onClick={() => scrollByCard(-1)}
          disabled={!canScrollBack}
          className="pointer-events-auto border border-line bg-surface/95 shadow-lg backdrop-blur"
        />
      </div>

      <div
        className={cn(
          "pointer-events-none absolute inset-y-0 -right-3 items-center gap-2 pr-3 md:-right-4",
          controlsVisible,
        )}
      >
        <IconButton
          aria-label={`Scroll ${label} forwards`}
          icon={<ChevronRight className="size-4" />}
          onClick={() => scrollByCard(1)}
          disabled={!canScrollForward}
          className="pointer-events-auto border border-line bg-surface/95 shadow-lg backdrop-blur"
        />
      </div>
    </div>
  );
}

export interface CarouselItemProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function CarouselItem({ className, children, ...props }: CarouselItemProps) {
  return (
    <div className={cn("w-[78%] shrink-0 snap-start sm:w-[46%] lg:w-[31%]", className)} {...props}>
      {children}
    </div>
  );
}
