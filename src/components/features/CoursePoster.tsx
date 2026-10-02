"use client";

/**
 * Course poster.
 *
 * Mux serves the frame as a WebP on its own CDN, so a plain `<img>` is both
 * simpler and cheaper than `next/image` here — there is no optimisation to do
 * on a URL Mux has already sized. `next/image` remains configured for it so a
 * route that prefers the framework's loader keeps working.
 *
 * The image is always decorative: the title beside it carries the meaning, so
 * the alt text is empty and a screen reader never reads a filename.
 */

import { useState } from "react";

import { Skeleton } from "@/components/ui/Progress";
import { cn } from "@/lib/utils/cn";
import { posterUrl, type PosterWidth } from "@/lib/mux/urls";

export interface CoursePosterProps {
  playbackId: string;
  /** Frame to use, in seconds from the start of the asset. */
  timeSec?: number;
  width?: PosterWidth;
  /** Required for signed assets; omitted for the public seed catalog. */
  token?: string;
  alt?: string;
  className?: string;
  /** Aspect ratio of the frame. */
  ratio?: "16/9" | "3/2" | "1/1";
  priority?: boolean;
  /** Applied over the poster, e.g. a scrim. */
  overlay?: React.ReactNode;
}

const RATIO_CLASS: Record<NonNullable<CoursePosterProps["ratio"]>, string> = {
  "16/9": "aspect-video",
  "3/2": "aspect-3/2",
  "1/1": "aspect-square",
};

export function CoursePoster({
  playbackId,
  timeSec = 2,
  width = 960,
  token,
  alt = "",
  className,
  ratio = "16/9",
  priority = false,
  overlay,
}: CoursePosterProps) {
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  const src = posterUrl(playbackId, timeSec, width, token);

  return (
    <div className={cn("relative overflow-hidden bg-elevated", RATIO_CLASS[ratio], className)}>
      {state === "loading" ? <Skeleton shape="block" className="absolute inset-0 size-full" /> : null}

      {state !== "error" ? (
        <img
          src={src}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          // The featured hero must not wait for lazy loading to reach the LCP.
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          onLoad={() => setState("loaded")}
          onError={() => setState("error")}
          className={cn(
            "size-full object-cover transition-opacity duration-250 ease-out-soft",
            state === "loaded" ? "opacity-100" : "opacity-0",
          )}
        />
      ) : null}

      {/*
        A failed poster is not a failure of the page: the gradient keeps the
        card readable and the title is right there.
      */}
      {state === "error" ? (
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(120%_120%_at_20%_10%,#2A2A31_0%,#131316_55%,#0B0B0D_100%)]"
        />
      ) : null}

      {overlay}
    </div>
  );
}
