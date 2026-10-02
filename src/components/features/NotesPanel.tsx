"use client";

/**
 * NotesPanel and AutoplayCountdown.
 *
 * Notes are pinned to a timestamp and tapping that timestamp seeks the player,
 * which is the whole reason the panel exists. Autoplay-countdown is announced as
 * a live region and becomes a static ring under `prefers-reduced-motion`, since
 * a silently shrinking ring is a countdown nobody can follow.
 */

import { useEffect, useRef, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui";
import { Input, Textarea } from "@/components/ui/Field";
import { Heading, Text, VisuallyHidden } from "@/components/ui/Layout";
import { EmptyState } from "@/components/compound/States";
import { MAX_NOTES_PER_LESSON, validateNoteBody } from "@/lib/domain/notes";
import { prefersReducedMotion } from "@/lib/utils/a11y";
import { cn } from "@/lib/utils/cn";
import { formatClock, formatRelativeDate } from "@/lib/utils/time";
import type { Note, PlayerSettings } from "@/lib/types";

export { MAX_NOTES_PER_LESSON };

export interface NotesPanelProps {
  notes: readonly Note[];
  /** Current playhead, used to pin a new note. */
  currentTimeSec: number;
  onAdd: (timestampSec: number, body: string) => void;
  onUpdate: (noteId: string, body: string) => void;
  onDelete: (noteId: string) => void;
  /** Seek the player to a note's timestamp. */
  onSeek: (timestampSec: number) => void;
  /** Pause the video while the textarea has focus. */
  pauseWhileTyping: boolean;
  onPauseChange?: (paused: boolean) => void;
  isPaused?: boolean;
  className?: string;
}

export function NotesPanel({
  notes,
  currentTimeSec,
  onAdd,
  onUpdate,
  onDelete,
  onSeek,
  pauseWhileTyping,
  onPauseChange,
  isPaused = false,
  className,
}: NotesPanelProps) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  // Oldest timestamp first: the panel reads as a running log.
  const ordered = [...notes].sort((a, b) => a.timestampSec - b.timestampSec);

  const submit = () => {
    const body = draft.trim();
    const validation = validateNoteBody(body, ordered.length >= MAX_NOTES_PER_LESSON);

    if (!validation.ok) {
      setError(validation.message);
      return;
    }

    onAdd(Math.floor(currentTimeSec), body);
    setDraft("");
    setError(null);
  };

  const startEditing = (note: Note) => {
    setEditingId(note.id);
    setEditBody(note.body);
    setError(null);
  };

  const commitEdit = (note: Note) => {
    const validation = validateNoteBody(editBody, false);

    if (!validation.ok) {
      setError(validation.message);
      return;
    }

    onUpdate(note.id, editBody.trim());
    setEditingId(null);
    setError(null);
  };

  return (
    <section className={cn("flex flex-col gap-4", className)} aria-labelledby="notes-heading">
      <div className="flex items-center justify-between gap-3">
        <Heading level={2} id="notes-heading" as="h2" className="text-lg">
          Notes
        </Heading>
        <Badge tone="neutral">
          {ordered.length} / {MAX_NOTES_PER_LESSON}
        </Badge>
      </div>

      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="note-draft" className="text-sm font-medium text-ink">
            New note
          </label>
          <Badge tone="gold">
            <span aria-hidden>at </span>
            {formatClock(Math.floor(currentTimeSec))}
          </Badge>
        </div>

        <Textarea
          id="note-draft"
          rows={3}
          value={draft}
          invalid={error !== null}
          onChange={(event) => {
            setDraft(event.target.value);
            if (error) setError(null);
          }}
          placeholder="What did the instructor just say?"
          onFocus={() => pauseWhileTyping && !isPaused && onPauseChange?.(true)}
          onBlur={() => pauseWhileTyping && onPauseChange?.(false)}
          aria-describedby={error ? "note-error" : undefined}
        />

        {error ? (
          <p id="note-error" role="alert" className="text-xs font-medium text-danger">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button
            type="submit"
            size="sm"
            leftIcon={<Plus className="size-4" />}
            disabled={ordered.length >= MAX_NOTES_PER_LESSON}
          >
            Add note
          </Button>
        </div>
      </form>

      {ordered.length === 0 ? (
        <EmptyState
          title="No notes yet"
          description={`Jot one at ${formatClock(Math.floor(currentTimeSec))} while you watch, then tap its timestamp to jump back.`}
          className="py-8"
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {ordered.map((note) => (
            <li
              key={note.id}
              className="flex flex-col gap-2 rounded-md border border-line bg-surface p-3"
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onSeek(note.timestampSec)}
                  className="inline-flex min-h-11 items-center rounded-sm px-1 text-sm font-semibold text-gold tabular-nums hover:underline"
                >
                  <span aria-hidden className="mr-1.5">
                    ▶
                  </span>
                  {formatClock(note.timestampSec)}
                  <VisuallyHidden>Jump to this point in the video</VisuallyHidden>
                </button>

                <span className="ml-auto text-xs text-muted">
                  {formatRelativeDate(note.createdAt)}
                </span>
              </div>

              {editingId === note.id ? (
                <div className="flex flex-col gap-2">
                  <Textarea
                    value={editBody}
                    rows={3}
                    aria-label={`Edit note at ${formatClock(note.timestampSec)}`}
                    onChange={(event) => setEditBody(event.target.value)}
                    onFocus={() => pauseWhileTyping && !isPaused && onPauseChange?.(true)}
                    onBlur={() => pauseWhileTyping && onPauseChange?.(false)}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingId(null);
                        setEditBody("");
                      }}
                    >
                      Cancel
                    </Button>
                    <Button size="sm" onClick={() => commitEdit(note)}>
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <Text size="sm" className="min-w-0 break-words whitespace-pre-wrap">
                    {note.body}
                  </Text>

                  <div className="flex justify-end gap-1">
                    <IconButton
                      aria-label={`Edit note at ${formatClock(note.timestampSec)}`}
                      icon={<Pencil className="size-4" />}
                      onClick={() => startEditing(note)}
                    />
                    <IconButton
                      aria-label={`Delete note at ${formatClock(note.timestampSec)}`}
                      variant="danger"
                      icon={<Trash2 className="size-4" />}
                      onClick={() => onDelete(note.id)}
                    />
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* AutoplayCountdown                                                   */
/* ------------------------------------------------------------------ */

/** Seconds of grace before the next lesson starts. */
export const AUTOPLAY_SECONDS = 5;

export interface AutoplayCountdownProps {
  /** Next lesson title, for the announcement and the button. */
  nextLessonTitle: string;
  /** The learner dismissed the countdown. */
  onCancel: () => void;
  /** The learner asked to skip the wait. */
  onPlayNow: () => void;
  /** The countdown ran out. Defaults to `onPlayNow`. */
  onElapsed?: () => void;
  seconds?: number;
  className?: string;
}

/**
 * The overlay shown after a lesson ends.
 *
 * Announced through a live region so the countdown is not a visual-only
 * affordance, and static (no shrinking ring) when reduced motion is requested.
 */
export function AutoplayCountdown({
  nextLessonTitle,
  onCancel,
  onPlayNow,
  onElapsed,
  seconds = AUTOPLAY_SECONDS,
  className,
}: AutoplayCountdownProps) {
  const [remaining, setRemaining] = useState(seconds);
  const [reduced, setReduced] = useState(false);

  // Reading through refs keeps the interval stable while the parent re-renders
  // with new callbacks, so the countdown is never restarted mid-flight.
  const onPlayNowRef = useRef(onPlayNow);
  onPlayNowRef.current = onPlayNow;

  const onElapsedRef = useRef(onElapsed);
  onElapsedRef.current = onElapsed;

  useEffect(() => {
    setReduced(prefersReducedMotion());
  }, []);

  useEffect(() => {
    setRemaining(seconds);

    const timer = window.setInterval(() => {
      setRemaining((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          // "Elapsed" and "Play now" do the same thing; only "Cancel" differs,
          // which is why they are separate props rather than one callback.
          (onElapsedRef.current ?? onPlayNowRef.current)();
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [seconds]);

  const progress = 1 - remaining / seconds;

  return (
    <div
      role="status"
      aria-live="assertive"
      className={cn(
        "absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-bg/92 p-6 backdrop-blur-sm",
        className,
      )}
    >
      <VisuallyHidden>
        {`Next lesson: ${nextLessonTitle}. Starting in ${remaining} seconds.`}
      </VisuallyHidden>

      <div
        aria-hidden
        className="relative grid size-24 place-items-center rounded-full border-2 border-line"
      >
        <span
          className={cn(
            "absolute inset-0 rounded-full border-2 border-gold",
            reduced ? "opacity-40" : "transition-[clip-path] duration-1000 ease-linear",
          )}
          style={{
            // A conic sweep reads as a countdown without a canvas.
            background: reduced
              ? undefined
              : `conic-gradient(var(--color-gold) ${progress * 360}deg, transparent 0deg)`,
            clipPath: reduced ? undefined : "inset(0)",
          }}
        />
        <span className="relative font-serif text-2xl text-ink tabular-nums">{remaining}</span>
      </div>

      <div className="flex max-w-sm flex-col items-center gap-1 text-center">
        <Text tone="muted" size="sm">
          Up next
        </Text>
        <Heading level={3} as="p" className="text-lg">
          {nextLessonTitle}
        </Heading>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button variant="secondary" onClick={onCancel} leftIcon={<X className="size-4" />}>
          Cancel
        </Button>
        <Button onClick={onPlayNow}>Play now</Button>
      </div>
    </div>
  );
}
