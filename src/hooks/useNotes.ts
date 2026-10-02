"use client";

/**
 * Notes for one lesson, with add / edit / delete.
 *
 * Notes are pinned to a timestamp and kept in one flat store keyed by id; the
 * per-lesson index is built here rather than duplicated on every write. The cap
 * from plan §6.5 is enforced in the domain layer so the panel and the hook can
 * never disagree about it.
 */

import { useCallback, useMemo } from "react";

import { MAX_NOTES_PER_LESSON, NOTE_MAX_LENGTH } from "@/lib/domain/notes";
import { createNote, notesStore } from "@/lib/storage/stores";
import { useStore } from "@/lib/storage/useStore";
import type { Note } from "@/lib/types";

export interface UseNotesResult {
  /** Sorted by timestamp, oldest first. */
  notes: Note[];
  count: number;
  atCapacity: boolean;
  addNote: (timestampSec: number, body: string) => Note | null;
  updateNote: (noteId: string, body: string) => void;
  deleteNote: (noteId: string) => void;
  /** Delete every note for a lesson; used when its lesson is deleted. */
  clearLesson: () => void;
}

export function useNotes(
  courseId: string | null | undefined,
  lessonId: string | null | undefined,
): UseNotesResult {
  const notes = useStore(notesStore, (snapshot) => {
    if (!courseId || !lessonId) return EMPTY;

    return Object.values(snapshot)
      .filter((note) => note.courseId === courseId && note.lessonId === lessonId)
      .sort((a, b) => a.timestampSec - b.timestampSec || a.createdAt.localeCompare(b.createdAt));
  });

  const addNote = useCallback(
    (timestampSec: number, body: string): Note | null => {
      if (!courseId || !lessonId) return null;

      const trimmed = body.trim();
      if (trimmed.length === 0 || trimmed.length > NOTE_MAX_LENGTH) return null;

      const existing = Object.values(notesStore.get()).filter(
        (note) => note.courseId === courseId && note.lessonId === lessonId,
      );

      if (existing.length >= MAX_NOTES_PER_LESSON) return null;

      const note = createNote(
        courseId,
        lessonId,
        Math.max(0, Math.floor(timestampSec)),
        trimmed,
      );

      notesStore.set((snapshot) => ({ ...snapshot, [note.id]: note }));
      return note;
    },
    [courseId, lessonId],
  );

  const updateNote = useCallback((noteId: string, body: string) => {
    const trimmed = body.trim();
    if (trimmed.length === 0 || trimmed.length > NOTE_MAX_LENGTH) return;

    notesStore.set((snapshot) => {
      const current = snapshot[noteId];
      if (!current) return snapshot;

      return {
        ...snapshot,
        [noteId]: { ...current, body: trimmed, updatedAt: new Date().toISOString() },
      };
    });
  }, []);

  const deleteNote = useCallback((noteId: string) => {
    notesStore.set((snapshot) => {
      if (!(noteId in snapshot)) return snapshot;

      const { [noteId]: _removed, ...rest } = snapshot;
      return rest;
    });
  }, []);

  const clearLesson = useCallback(() => {
    if (!courseId || !lessonId) return;

    notesStore.set((snapshot) => {
      const doomed = Object.values(snapshot)
        .filter((note) => note.courseId === courseId && note.lessonId === lessonId)
        .map((note) => note.id);

      if (doomed.length === 0) return snapshot;

      const next = { ...snapshot };
      for (const id of doomed) delete next[id];
      return next;
    });
  }, [courseId, lessonId]);

  return useMemo(
    () => ({
      notes,
      count: notes.length,
      atCapacity: notes.length >= MAX_NOTES_PER_LESSON,
      addNote,
      updateNote,
      deleteNote,
      clearLesson,
    }),
    [addNote, clearLesson, deleteNote, notes, updateNote],
  );
}

const EMPTY: Note[] = [];