/**
 * Text and money formatting.
 *
 * `Intl` formatters are memoised at module scope: constructing them per render
 * is a measurable cost in list-heavy views such as the catalog grid.
 */

import { UNKNOWN_DURATION } from "./time";

const integerFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/**
 * Cents → `$149` / `$1,249`. `0` renders as `Free`, which is what every
 * catalog surface and CTA actually needs.
 */
export function formatPrice(priceCents: number): string {
  if (!Number.isFinite(priceCents) || priceCents < 0) return UNKNOWN_DURATION;
  if (priceCents === 0) return "Free";

  const dollars = priceCents / 100;
  return `$${integerFormatter.format(Math.round(dollars))}`;
}

/** Cents → `$149.00` for checkout and receipt copy. */
export function formatPriceExact(priceCents: number): string {
  if (!Number.isFinite(priceCents) || priceCents < 0) return UNKNOWN_DURATION;
  if (priceCents === 0) return "Free";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(priceCents / 100);
}

/** `1284` → `1,284`. */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return UNKNOWN_DURATION;
  return integerFormatter.format(value);
}

/** Uppercase level label: `intermediate` → `Intermediate`. */
export function formatLevel(level: string): string {
  return level.charAt(0).toUpperCase() + level.slice(1);
}

/** Uppercase category label: `creative` → `Creative`. */
export function formatCategory(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

/** `data-science` → `data science`, for inline tag chips. */
export function formatTag(tag: string): string {
  return tag.replace(/[-_]+/g, " ");
}

/**
 * Case- and diacritic-insensitive search key.
 *
 * Used by both the catalog filter and the storage read path so that a stored
 * course always matches the same query that the server rendered.
 */
export function normalizeSearchText(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** First `length` characters of a string, trimmed on a word boundary. */
export function truncate(input: string, length: number): string {
  if (input.length <= length) return input;

  const clipped = input.slice(0, length);
  const lastSpace = clipped.lastIndexOf(" ");

  return `${(lastSpace > length * 0.6 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`;
}

/** Collapse whitespace and trim, the normaliser for user-entered strings. */
export function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}
