"use client";

/**
 * `useSyncExternalStore` bindings for the localStorage stores.
 *
 * The critical detail is referential stability. `useSyncExternalStore` compares
 * snapshots with `Object.is`, so a selector that builds a fresh array or object
 * on every call would report a change on every store notification — forever.
 *
 * Both the client and the server snapshot paths are therefore memoised on the
 * input reference. The server path matters just as much: React calls
 * `getServerSnapshot` during hydration and again to confirm the hydrated value,
 * and an uncached selector returning a fresh object each time is the classic
 * cause of "The result of getServerSnapshot should be cached to avoid an
 * infinite loop".
 */

import { useCallback, useRef, useSyncExternalStore } from "react";

import type { Store } from "./createStore";

interface Cache<TSelected> {
  /** The snapshot the output was derived from. */
  input: unknown;
  /** The derived value, reused while `input` is unchanged. */
  output: TSelected;
  hasValue: boolean;
}

function emptyCache<TSelected>(): Cache<TSelected> {
  return { input: undefined, output: undefined as unknown as TSelected, hasValue: false };
}

/** Derive once per distinct input reference, never per call. */
function memoised<TSnapshot, TSelected>(
  read: () => TSnapshot,
  selector: (snapshot: TSnapshot) => TSelected,
  cache: Cache<TSelected>,
): TSelected {
  const snapshot = read();

  if (cache.hasValue && Object.is(cache.input, snapshot)) return cache.output;

  const next = selector(snapshot);
  cache.input = snapshot;
  cache.output = next;
  cache.hasValue = true;

  return next;
}

/** Select a slice of a store, with referentially stable results. */
export function useStore<T, S>(store: Store<T>, selector: (snapshot: T) => S): S {
  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  const clientCache = useRef(emptyCache<S>());
  const serverCache = useRef(emptyCache<S>());

  const getSnapshot = useCallback(() => {
    const snapshot = store.get();

    if (clientCache.current.hasValue && Object.is(clientCache.current.input, snapshot)) {
      return clientCache.current.output;
    }

    const next = selectorRef.current(snapshot);
    clientCache.current = { input: snapshot, output: next, hasValue: true };

    return next;
  }, [store]);

  /*
   * Cached separately from the client path. Sharing one cache would be wrong in
   * both directions: the server default is a different value from the stored
   * one, and a shared cache would hand the client the server's empty result.
   */
  const getServerSnapshot = useCallback(
    () => memoised(() => store.getServerSnapshot(), selectorRef.current, serverCache.current),
    [store],
  );

  return useSyncExternalStore(store.subscribe, getSnapshot, getServerSnapshot);
}

/** Subscribe to the raw snapshot, for callers that already return stable values. */
export function useStoreValue<T>(store: Store<T>): T {
  return useStore(store, identity);
}

function identity<T>(value: T): T {
  return value;
}