"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md space-y-4 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-8">
        <h2 className="font-serif text-2xl text-[var(--color-danger)] font-medium">
          Something went wrong
        </h2>
        <p className="text-sm text-[var(--color-muted)]">
          An unexpected error occurred. Please try again.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[var(--color-gold)] px-5 py-2 text-sm font-semibold text-[var(--color-gold-ink)] transition-colors hover:bg-[#d4a03c]"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
