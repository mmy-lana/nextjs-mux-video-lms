"use client";

/**
 * HeroBillboard.
 *
 * The featured course at full bleed. The optional trailer is a real `<video>`
 * with `muted` + `playsInline` and never autoplays on a metered connection —
 * a 40 MB background stream on someone's phone data is not a "nice touch".
 * Users who want it get an explicit, labelled control.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Eyebrow, Heading, Text } from "@/components/ui/Layout";
import { cn } from "@/lib/utils/cn";
import { formatLevel, formatPrice } from "@/lib/utils/format";
import { formatDuration } from "@/lib/utils/time";
import { courseTotals } from "@/lib/domain/totals";
import { streamUrl } from "@/lib/mux/urls";
import type { Course, Instructor } from "@/lib/types";
import { CoursePoster } from "./CoursePoster";

export interface HeroBillboardProps {
  course: Course;
  instructor: Instructor | null;
  /** Durations learned so far, used for the runtime line. */
  durations?: Record<string, number>;
  /** CTA target, e.g. the first lesson when the learner is enrolled. */
  ctaHref: string;
  ctaLabel: string;
  className?: string;
}

/** The subset of `NetworkInformation` this component reads. */
interface ConnectionInfo {
  saveData?: boolean;
  effectiveType?: string;
}

/** True when the connection looks metered or the user asked for less data. */
function shouldSkipTrailer(): boolean {
  if (typeof navigator === "undefined") return true;

  const nav = navigator as Navigator & {
    connection?: ConnectionInfo;
    mozConnection?: ConnectionInfo;
    webkitConnection?: ConnectionInfo;
  };

  const connection = nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
  if (!connection) return false;
  if (connection.saveData === true) return true;

  const effective = connection.effectiveType;
  return effective === "slow-2g" || effective === "2g";
}

export function HeroBillboard({
  course,
  instructor,
  durations = {},
  ctaHref,
  ctaLabel,
  className,
}: HeroBillboardProps) {
  const totals = courseTotals(course);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [allowTrailer, setAllowTrailer] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Only decide after mount: reading the connection during render would make
  // the server and client disagree.
  useEffect(() => {
    setAllowTrailer(!shouldSkipTrailer());
  }, []);

  useEffect(() => {
    if (trailerOpen && videoRef.current) {
      videoRef.current.play().catch(() => {
        // Autoplay refused (policy or an audio block): the controls remain.
        setTrailerOpen(false);
      });
    }
  }, [trailerOpen]);

  return (
    <section
      aria-labelledby="hero-title"
      className={cn(
        "film-grain relative isolate overflow-hidden border-b border-line",
        "min-h-[clamp(24rem,72vh,40rem)]",
        className,
      )}
    >
      <CoursePoster
        playbackId={course.heroPlaybackId}
        timeSec={course.heroPosterTimeSec}
        width={1600}
        priority
        ratio="16/9"
        className="absolute inset-0 size-full h-full"
        overlay={<div aria-hidden className="hero-scrim absolute inset-0" />}
      />

      <div className="relative z-10 flex min-h-[clamp(24rem,72vh,40rem)] flex-col justify-end">
        <div className="w-full max-w-3xl px-4 pt-32 pb-10 sm:px-6 sm:pb-14 lg:px-8">
          <div className="flex flex-wrap items-center gap-2">
            <Eyebrow>Featured course</Eyebrow>
            <Badge tone="neutral">{formatLevel(course.level)}</Badge>
          </div>

          <Heading
            level={1}
            display
            as="h1"
            id="hero-title"
            className="mt-3 max-w-2xl"
          >
            {course.title}
          </Heading>

          <Text tone="muted" size="lg" className="mt-4 max-w-xl">
            {course.subtitle}
          </Text>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            {instructor ? (
              <>
                <span className="text-ink">{instructor.name}</span>
                <span aria-hidden>·</span>
              </>
            ) : null}
            <span className="tabular-nums">{formatDuration(totals.totalDurationSec)}</span>
            <span aria-hidden>·</span>
            <span className="tabular-nums">
              {totals.lessonCount} lessons
            </span>
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href={ctaHref}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-gold px-7 text-base font-semibold text-gold-ink transition-colors hover:bg-gold/90"
            >
              {ctaLabel}
            </Link>

            <Link
              href={`/courses/${course.slug}`}
              className="inline-flex min-h-12 items-center justify-center rounded-md border border-line bg-surface/70 px-7 text-base font-semibold text-ink backdrop-blur transition-colors hover:bg-elevated"
            >
              Course details
            </Link>

            {allowTrailer && !trailerOpen ? (
              <Button
                variant="ghost"
                leftIcon={<Play className="size-4" />}
                onClick={() => setTrailerOpen(true)}
                className="text-muted"
              >
                Play trailer
              </Button>
            ) : null}

            <span className="text-lg font-semibold text-gold">
              {formatPrice(course.priceCents)}
            </span>
          </div>
        </div>
      </div>

      {trailerOpen ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-bg/95 p-4">
          <video
            ref={videoRef}
            src={streamUrl(course.heroPlaybackId)}
            controls
            playsInline
            muted
            className="max-h-full w-full max-w-4xl rounded-lg border border-line bg-black"
            aria-label={`Trailer for ${course.title}`}
          >
            <track kind="captions" />
          </video>
          <Button
            variant="secondary"
            className="absolute top-4 right-4"
            onClick={() => {
              setTrailerOpen(false);
              if (videoRef.current) videoRef.current.pause();
            }}
          >
            Close trailer
          </Button>
        </div>
      ) : null}
    </section>
  );
}
