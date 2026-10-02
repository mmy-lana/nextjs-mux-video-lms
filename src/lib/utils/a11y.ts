/**
 * Accessibility helpers.
 *
 * These exist so interactive components can wire ARIA and keyboard behaviour
 * without re-deriving ids or key matching at every call site.
 */

/** Merge caller ids with a generated suffix for `aria-*` / `id` pairing. */
export function joinIds(...parts: Array<string | undefined | null>): string {
  return parts.filter((part): part is string => Boolean(part)).join(" ");
}

/**
 * `true` for keys the WAI-ARIA APG treats as horizontal navigation:
 * `ArrowLeft` / `ArrowRight` (plus `ArrowUp` / `ArrowDown` when the list is
 * vertical) and `Home` / `End`.
 */
export function isHorizontalNavKey(key: string): boolean {
  return key === "ArrowLeft" || key === "ArrowRight" || key === "Home" || key === "End";
}

/** `true` for `ArrowUp` / `ArrowDown`, the vertical-list navigation keys. */
export function isVerticalNavKey(key: string): boolean {
  return key === "ArrowUp" || key === "ArrowDown" || key === "Home" || key === "End";
}

/** Wrap `index` into `[0, length)`; `length` of 0 yields 0. */
export function wrapIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return ((index % length) + length) % length;
}

/** Clamp `index` into `[0, length - 1]`; `length` of 0 yields 0. */
export function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(Math.max(index, 0), length - 1);
}

/**
 * `true` when the event target is a text-entry surface.
 *
 * Player keyboard shortcuts (plan §6.2.5) are suppressed whenever the learner
 * is typing so `space` and `n` never leak into a note or a filter field.
 */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;

  // `isContentEditable` is not implemented in every DOM, so also honour the
  // attribute directly.
  return target.isContentEditable === true || target.getAttribute("contenteditable") === "true";
}

/** `true` when the learner asked for reduced motion. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Readable initials for an avatar, e.g. `Elena Marquez` → `EM`. */
export function avatarInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();

  return `${words[0][0] ?? ""}${words[words.length - 1][0] ?? ""}`.toUpperCase();
}
