"use client";

/**
 * Hydration gate, re-exported where the app's hooks live.
 *
 * Screens call this to render a skeleton instead of an empty state that would
 * contradict whatever is already in the learner's storage.
 */

export { useHydrated } from "@/lib/storage/useHydrated";