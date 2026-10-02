/**
 * Note rules (plan §6.5).
 *
 * They live in the domain layer rather than in the panel so the UI copy and the
 * storage-level guard cannot drift apart.
 */

/** Hard cap per lesson, so a runaway loop cannot fill the origin's quota. */
export const MAX_NOTES_PER_LESSON = 200;

/** A note body is trimmed before validation; empty notes are never stored. */
export const NOTE_MIN_LENGTH = 1;

/** Matches `Note.body` in `lib/types.ts`. */
export const NOTE_MAX_LENGTH = 1000;

export interface NoteValidation {
  ok: boolean;
  /** Message for the inline error, present only when `ok` is false. */
  message: string | null;
}

/**
 * Validate a note body.
 *
 * Returns a message the UI can render verbatim, so the rule is stated once.
 */
export function validateNoteBody(body: string, atCapacity: boolean): NoteValidation {
  const trimmed = body.trim();

  if (trimmed.length < NOTE_MIN_LENGTH) {
    return { ok: false, message: "Write something before saving." };
  }

  if (trimmed.length > NOTE_MAX_LENGTH) {
    return {
      ok: false,
      message: `That note is ${trimmed.length} characters; the limit is ${NOTE_MAX_LENGTH}.`,
    };
  }

  if (atCapacity) {
    return {
      ok: false,
      message: `This lesson already has ${MAX_NOTES_PER_LESSON} notes. Delete one to add another.`,
    };
  }

  return { ok: true, message: null };
}