import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center p-6 text-center">
      <header className="max-w-2xl space-y-4">
        <span className="inline-block rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-1 text-xs tracking-wider uppercase text-[var(--color-gold)] font-medium">
          Cinematic Learning
        </span>
        <h1 className="font-serif text-4xl sm:text-6xl font-light tracking-tight text-[var(--color-ink)]">
          Master the craft with world-class instructors.
        </h1>
        <p className="text-base sm:text-lg text-[var(--color-muted)] font-sans">
          Immersive video courses streaming with ultra-low latency and zero buffering.
        </p>
        <div className="pt-4 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/courses"
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[var(--color-gold)] px-6 py-2.5 text-sm font-semibold text-[var(--color-gold-ink)] transition-colors hover:bg-[#d4a03c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)]"
          >
            Explore Courses
          </Link>
          <Link
            href="/studio"
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-6 py-2.5 text-sm font-semibold text-[var(--color-ink)] transition-colors hover:bg-[var(--color-elevated)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)]"
          >
            Instructor Studio
          </Link>
        </div>
      </header>
    </div>
  );
}
