"use client";

/**
 * Route-level error boundary.
 *
 * It states what happened, offers a retry that re-renders the segment without a
 * full reload, and — for an unrecognised failure — a way back to somewhere that
 * definitely works. The raw message is logged, never rendered: a stack trace on
 * screen is noise to a learner and a disclosure risk.
 */

import Link from "next/link";
import { useEffect } from "react";

import { Button, ButtonLink } from "@/components/ui/Button";
import { Container, Heading, Text } from "@/components/ui/Layout";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[aura] route error", error);
  }, [error]);

  return (
    <Container size="narrow" className="flex flex-1 flex-col items-center justify-center py-20 text-center">
      <div
        role="alert"
        className="flex w-full flex-col items-center gap-4 rounded-lg border border-line bg-surface p-8"
      >
        <span className="font-mono text-sm text-danger">Something went wrong</span>

        <Heading level={1} as="h1" className="text-2xl sm:text-3xl">
          This screen could not be loaded
        </Heading>

        <Text tone="muted" className="max-w-md">
          The error has been logged. Trying again usually clears it; if it does not,
          your saved progress is untouched.
        </Text>

        {error.digest ? (
          <Text size="xs" tone="muted" className="font-mono">
            Reference: {error.digest}
          </Text>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <ButtonLink href="/courses" variant="secondary">
            Browse courses
          </ButtonLink>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-md px-4 text-sm font-medium text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            Go home
          </Link>
        </div>
      </div>
    </Container>
  );
}