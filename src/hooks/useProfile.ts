"use client";

/**
 * The anonymous-local learner (decision D8).
 *
 * The profile id doubles as the Mux `viewer_user_id`, which is what gives
 * per-viewer analytics without an auth system. It is created on first run and
 * never regenerated, because a new id would orphan that history.
 */

import { useCallback, useEffect } from "react";

import { ensureProfile, profileStore, setDisplayName } from "@/lib/storage/stores";
import { useStore } from "@/lib/storage/useStore";
import { useHydrated } from "@/lib/storage/useHydrated";
import type { LearnerProfile } from "@/lib/types";

export interface UseProfileResult {
  profile: LearnerProfile;
  /** `false` until storage has been read on the client. */
  ready: boolean;
  rename: (displayName: string) => void;
}

export function useProfile(): UseProfileResult {
  const profile = useStore(profileStore, (snapshot) => snapshot);
  const hydrated = useHydrated();

  useEffect(() => {
    // After hydration only: a write during render would differ between the
    // server and the client.
    ensureProfile();
  }, [hydrated]);

  const rename = useCallback((displayName: string) => {
    setDisplayName(displayName);
  }, []);

  return { profile, ready: hydrated, rename };
}