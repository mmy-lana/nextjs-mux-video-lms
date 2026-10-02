/**
 * Duration and clock formatting.
 *
 * The UI must never invent a length: callers pass `null` for unknown durations
 * (decision D5) and every formatter renders the em-dash placeholder instead.
 */

import { clamp } from "./math";

/** Rendered wherever a duration is genuinely not known yet. */
export const UNKNOWN_DURATION = "—" as const;

/**
 * Clock format `M:SS`, or `H:MM:SS` once the duration reaches an hour.
 * `null`, negative and non-finite inputs render {@link UNKNOWN_DURATION}.
 */
export function formatClock(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return UNKNOWN_DURATION;
  }

  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

/**
 * Human duration such as `4h 12m`, `47 min` or `38s`.
 * Unknown durations render {@link UNKNOWN_DURATION}.
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return UNKNOWN_DURATION;
  }

  const total = Math.floor(seconds);

  if (total < 60) return `${total}s`;

  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);

  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} hr`;

  return `${hours}h ${minutes}m`;
}

/**
 * Long-form duration for course totals, e.g. `4 hr 12 min`.
 * Kept distinct from {@link formatDuration} so module totals can be wordier.
 */
export function formatDurationLong(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return UNKNOWN_DURATION;
  }

  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);

  if (hours > 0 && minutes > 0) return `${hours} hr ${minutes} min`;
  if (hours > 0) return `${hours} hr`;
  if (minutes > 0) return `${minutes} min`;

  return `${total} sec`;
}

/**
 * Approximate runtime from a *known* duration, e.g. `1h 48m`.
 * Rounds to the nearest five minutes so UI copy stays calm.
 */
export function formatApproxDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
    return UNKNOWN_DURATION;
  }

  const roundedMinutes = Math.max(1, Math.round(seconds / 60 / 5) * 5);
  if (roundedMinutes < 60) return `${roundedMinutes}m`;

  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;

  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/** ISO timestamp → `31 Jan 2026` (pinned to UTC so SSR and client agree). */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return UNKNOWN_DURATION;

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** ISO timestamp → `31 January 2026`, used on certificates. */
export function formatDateLong(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return UNKNOWN_DURATION;

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * `just now`, `3 hours ago`, `yesterday`, `12 Mar 2026`.
 *
 * `now` is injected so server-rendered markup and the first client render
 * agree; callers that only render after hydration may omit it.
 */
export function formatRelativeDate(iso: string, now: number = Date.now()): string {
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) return UNKNOWN_DURATION;

  const deltaSec = Math.round((timestamp - now) / 1000);
  const magnitude = Math.abs(deltaSec);

  if (magnitude < 45) return "just now";

  const units: ReadonlyArray<{
    limit: number;
    divisor: number;
    unit: Intl.RelativeTimeFormatUnit;
  }> = [
    { limit: 60, divisor: 1, unit: "second" },
    { limit: 3600, divisor: 60, unit: "minute" },
    { limit: 86_400, divisor: 3600, unit: "hour" },
    { limit: 604_800, divisor: 86_400, unit: "day" },
    { limit: 2_629_800, divisor: 604_800, unit: "week" },
    { limit: 31_557_600, divisor: 2_629_800, unit: "month" },
  ];

  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  for (const { limit, divisor, unit } of units) {
    if (magnitude < limit) {
      return formatter.format(Math.round(deltaSec / divisor), unit);
    }
  }

  return formatDate(iso);
}

/** Seconds → `1h 05m` for study-streak totals. */
export function formatWatchTime(seconds: number): string {
  const total = clamp(Math.floor(seconds), 0, Number.MAX_SAFE_INTEGER);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);

  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

/* ------------------------------------------------------------------ */
/* Local calendar days                                                 */
/* ------------------------------------------------------------------ */

/**
 * `YYYY-MM-DD` for the learner's *local* calendar day.
 *
 * Streaks are a local-calendar concept (a 23:40 session belongs to today), so
 * this never uses UTC — unlike {@link formatDate}, which is UTC-pinned so
 * server and client markup match.
 */
export function localDateKey(date: Date = new Date()): string {
  if (Number.isNaN(date.getTime())) return "1970-01-01";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * Shift a `YYYY-MM-DD` key by whole days using the local calendar.
 *
 * Implemented by walking `Date` rather than by arithmetic on the string so
 * month lengths and daylight-saving transitions stay correct.
 */
export function shiftLocalDateKey(key: string, days: number): string {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1, 12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

/** Whole local-calendar days between two `YYYY-MM-DD` keys (`b - a`). */
export function daysBetweenLocalKeys(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);

  const from = new Date(ay ?? 1970, (am ?? 1) - 1, ad ?? 1, 12, 0, 0, 0).getTime();
  const to = new Date(by ?? 1970, (bm ?? 1) - 1, bd ?? 1, 12, 0, 0, 0).getTime();

  return Math.round((to - from) / 86_400_000);
}

/** The seven `YYYY-MM-DD` keys ending at `today`, oldest first. */
export function localDateKeyRange(today: string, days: number): string[] {
  return Array.from({ length: days }, (_, index) =>
    shiftLocalDateKey(today, index - (days - 1)),
  );
}

