/**
 * Identifier and slug helpers.
 *
 * Runtime ids come from `crypto.randomUUID()` where available, with a
 * timestamp + random fallback so the app still works in non-secure contexts
 * (older embedded webviews, plain-HTTP previews).
 */

/** RFC 4122 v4 id, with a collision-resistant fallback. */
export function uid(prefix = ""): string {
  const id = createId();
  return prefix ? `${prefix}_${id}` : id;
}

function createId(): string {
  const cryptoRef = globalThis.crypto;

  if (cryptoRef && typeof cryptoRef.randomUUID === "function") {
    return cryptoRef.randomUUID();
  }

  if (cryptoRef && typeof cryptoRef.getRandomValues === "function") {
    const bytes = cryptoRef.getRandomValues(new Uint8Array(16));
    // Set the version (4) and variant (10xx) bits required by RFC 4122.
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Lowercase kebab-case slug that always satisfies `Course.slug`.
 *
 * Diacritics are folded, everything else non-alphanumeric collapses to a
 * single dash, and the result is trimmed to 80 characters (schema maximum)
 * without leaving a trailing dash.
 */
export function slugify(input: string, maxLength = 80): string {
  const base = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (base.length <= maxLength) return base;

  return base.slice(0, maxLength).replace(/-+[^-]*$/, "").replace(/-+$/, "");
}

/**
 * First and last initials for a gradient avatar, e.g. `Elena Marquez` → `EM`.
 * Single-word names fall back to the first two letters.
 */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();

  const first = words[0][0] ?? "";
  const last = words[words.length - 1][0] ?? "";
  return `${first}${last}`.toUpperCase();
}

/**
 * `${courseId}:${lessonId}` — the canonical `LessonProgress.id`.
 */
export function progressKey(courseId: string, lessonId: string): string {
  return `${courseId}:${lessonId}`;
}
