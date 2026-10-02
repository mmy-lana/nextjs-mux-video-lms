"use client";

/**
 * EnrollPanel.
 *
 * Price, the enroll CTA, and what the learner actually gets. Paid courses open
 * a demo-checkout dialog that is honest about processing no payment (decision
 * D4); free courses enroll immediately.
 *
 * Below 768px this renders as a sticky bottom bar so the CTA is always
 * reachable without scrolling back to the top of a long page.
 */

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Heading, Text } from "@/components/ui/Layout";
import {
  Dialog,
  OverlayBody,
  OverlayFooter,
  OverlayHeader,
} from "@/components/compound/Overlay";
import { cn } from "@/lib/utils/cn";
import { formatPrice, formatPriceExact } from "@/lib/utils/format";
import { courseTotals, freePreviewCount } from "@/lib/domain/totals";
import type { Course } from "@/lib/types";

export interface EnrollPanelProps {
  course: Course;
  enrolled: boolean;
  /** Label for the primary CTA, e.g. "Start course" once enrolled. */
  primaryLabel: string;
  onEnroll: () => void | Promise<void>;
  onContinue?: () => void;
  className?: string;
  /** `sticky` pins the panel to the bottom of the viewport on mobile. */
  layout?: "card" | "sticky";
}

export function EnrollPanel({
  course,
  enrolled,
  primaryLabel,
  onEnroll,
  onContinue,
  className,
  layout = "card",
}: EnrollPanelProps) {
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const totals = courseTotals(course);
  const previews = freePreviewCount(course);

  const isFree = course.priceCents === 0;

  const handlePrimary = async () => {
    if (enrolled) {
      onContinue?.();
      return;
    }

    if (isFree) {
      setSubmitting(true);
      try {
        await onEnroll();
      } finally {
        setSubmitting(false);
      }
      return;
    }

    setCheckoutOpen(true);
  };

  const confirmEnroll = async () => {
    setSubmitting(true);
    try {
      await onEnroll();
      setCheckoutOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const body = (
    <>
      <div className="flex items-baseline gap-2">
        <span className="font-serif text-3xl text-ink">{formatPrice(course.priceCents)}</span>
        {isFree ? (
          <Badge tone="success">Free forever</Badge>
        ) : (
          <span className="text-sm text-muted">one-time</span>
        )}
      </div>

      <Button
        block
        size="lg"
        loading={submitting}
        loadingText={enrolled ? "Opening…" : "Enrolling…"}
        onClick={handlePrimary}
      >
        {primaryLabel}
      </Button>

      {previews > 0 ? (
        <Text size="sm" tone="muted" className="text-center">
          {previews} free preview {previews === 1 ? "lesson" : "lessons"} — watch before you enrol.
        </Text>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
        <div className="flex flex-col">
          <dt className="text-muted">Lessons</dt>
          <dd className="font-medium text-ink tabular-nums">{totals.lessonCount}</dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-muted">Modules</dt>
          <dd className="font-medium text-ink tabular-nums">{totals.moduleCount}</dd>
        </div>
      </dl>

      {course.learnOutcomes.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <Heading level={3} as="h3" className="text-sm font-semibold text-ink">
            What you’ll learn
          </Heading>
          <ul className="flex flex-col gap-2">
            {course.learnOutcomes.map((outcome) => (
              <li key={outcome} className="flex items-start gap-2 text-sm text-muted">
                <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-gold" />
                <span className="min-w-0">{outcome}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );

  return (
    <>
      {layout === "sticky" ? (
        /*
         * Mobile sticky bar. It sits above the bottom nav, which the course
         * detail page suppresses so the two do not overlap.
         */
        <div
          className={cn(
            "fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 px-4 pt-3 backdrop-blur-md md:hidden",
            "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
            className,
          )}
        >
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <span className="font-serif text-xl text-ink">
                {formatPrice(course.priceCents)}
              </span>
            </div>
            <Button onClick={handlePrimary} loading={submitting} className="shrink-0">
              {primaryLabel}
            </Button>
          </div>
        </div>
      ) : (
        <aside
          aria-label="Enroll"
          className={cn(
            "flex flex-col gap-4 rounded-lg border border-line bg-surface p-5",
            className,
          )}
        >
          {body}
        </aside>
      )}

      <Dialog open={checkoutOpen} onClose={() => setCheckoutOpen(false)}>
        <OverlayHeader
          title="Demo checkout"
          description="No payment is processed and no card is collected."
        />

        <OverlayBody>
          <div className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between gap-3 border-b border-line pb-3">
              <span className="min-w-0 text-ink">{course.title}</span>
              <span className="shrink-0 font-semibold text-ink">
                {formatPriceExact(course.priceCents)}
              </span>
            </div>

            <Text size="sm" tone="muted">
              This build has no payment backend. Confirming creates a local
              enrollment in your browser so you can follow the full learning
              journey; the “price” is displayed for realism only.
            </Text>

            <Text size="xs" tone="muted">
              For the same reason, enrollment is not real access control — it can
              be edited by anyone with access to this browser’s storage.
            </Text>
          </div>
        </OverlayBody>

        <OverlayFooter>
          <Button variant="ghost" onClick={() => setCheckoutOpen(false)}>
            Cancel
          </Button>
          <Button onClick={confirmEnroll} loading={submitting} loadingText="Enrolling…">
            Confirm enrollment
          </Button>
        </OverlayFooter>
      </Dialog>
    </>
  );
}
