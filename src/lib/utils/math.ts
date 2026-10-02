/**
 * Numeric helpers shared by the domain layer and the UI.
 *
 * Everything here is pure and safe to call during server rendering.
 */

/** Restrict `value` to the inclusive `[min, max]` range. */
export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  if (min > max) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * Round to at most `digits` decimal places, avoiding float dust such as
 * `0.30000000000000004` in progress readouts.
 */
export function roundTo(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** `true` when two durations are close enough that re-writing the cache is noise. */
export function durationsEquivalent(a: number, b: number, toleranceSec = 1): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= toleranceSec;
}
