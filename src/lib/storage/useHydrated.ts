"use client";

/**
 * Hydration gate.
 *
 * `false` on the server and on the very first client render, `true` after
 * mount. Screens use it to render skeletons instead of flashing an empty state
 * that would contradict the learner's real local data.
 */

import { useEffect, useState } from "react";

export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return hydrated;
}
