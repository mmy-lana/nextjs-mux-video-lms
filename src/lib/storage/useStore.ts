"use client";

/**
 * `useSyncExternalStore` bindings for the localStorage stores.
 *
 * The critical detail is selector memoisation. `useSyncExternalStore` compares
 * snapshots with `Object.is`, so a selector that builds a fresh array or object
 * on every call would re-render on every store notification — forever. The
 * hook below caches the last input/output pair and only recomputes the output
 * when the snapshot reference actually changes.
 */

import { useCallback, useRef, useSyncExternalStore } from "react";

import type { Store } from "./createStore";

/** Select a slice of a store, with referentially stable results. */
export function useStore<T, S>(store: Store<T>, selector: (snapshot: T) => S): S {
  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  const lastInput = useRef<{ value: T; hasValue: boolean }>({
    value: undefined as unknown as T,
    hasValue: false,
  });
  const lastOutput = useRef<{ value: S; hasValue: boolean }>({
    value: undefined as unknown as S,
    hasValue: false,
  });

  const getSnapshot = useCallback(() => {
    const snapshot = store.get();

    if (lastInput.current.hasValue && lastInput.current.value === snapshot) {
      return lastOutput.current.value;
    }

    const next = selectorRef.current(snapshot);
    lastInput.current = { value: snapshot, hasValue: true };
    lastOutput.current = { value: next, hasValue: true };

    return next;
  }, [store]);

  const getServerSnapshot = useCallback(() => selectorRef.current(store.getServerSnapshot()), [store]);

  return useSyncExternalStore(store.subscribe, getSnapshot, getServerSnapshot);
}

/** Subscribe to the raw snapshot, for callers that already return stable values. */
export function useStoreValue<T>(store: Store<T>): T {
  return useStore(store, identity);
}

function identity<T>(value: T): T {
  return value;
}
