import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md space-y-4">
        <span className="font-mono text-sm text-[var(--color-gold)]">404</span>
        <h1 className="font-serif text-3xl font-light text-[var(--color-ink)]">
          Page Not Found
        </h1>
        <p className="text-sm text-[var(--color-muted)]">
          The lesson or course you are looking for does not exist or has been moved.
        </p>
        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[var(--color-gold)] px-5 py-2 text-sm font-semibold text-[var(--color-gold-ink)] transition-colors hover:bg-[#d4a03c]"
          >
            Return Home
          </Link>
        </div>
      </div>
    </div>
  );
}
