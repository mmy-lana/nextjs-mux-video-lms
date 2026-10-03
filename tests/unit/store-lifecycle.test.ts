/**
 * Storage-layer behaviour the patches depend on.
 *
 * Two properties are load-bearing and neither is visible from the type-checker:
 * the store listeners exist only while something is subscribed, and a selector
 * applied to the server snapshot stays referentially stable.
 */

import { renderHook, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createStore, resetAllStores } from "@/lib/storage/createStore";
import { STORAGE_KEYS, type StorageKey } from "@/lib/storage/keys";
import { useStore, useStoreValue } from "@/lib/storage/useStore";
import { z } from "zod";

const schema = z.object({ n: z.number() });

interface Counter {
  n: number;
}

/**
 * A store with a key unique per test, so tests cannot collide.
 *
 * The key has to be a real `StorageKey`; each test borrows a different one so
 * no two stores share a localStorage slot.
 */
let keyCursor = 0;

function makeStore(initial: Counter = { n: 0 }) {
  const keys = Object.values(STORAGE_KEYS) as string[];
  const key = keys[keyCursor % keys.length] as StorageKey;
  keyCursor += 1;

  return createStore<Counter>({
    key,
    defaultValue: initial,
    schema: schema as unknown as z.ZodType<Counter>,
  });
}

afterEach(() => {
  resetAllStores();
});

/* ------------------------------------------------------------------ */
/* PERF-01: listener lifetime                                          */
/* ------------------------------------------------------------------ */

describe("store listener lifetime", () => {
  it("attaches on first subscribe and detaches on the last unsubscribe", () => {
    const store = makeStore();

    expect(store.isListening).toBe(false);

    const first = store.subscribe(() => undefined);
    expect(store.subscriberCount).toBe(1);
    expect(store.isListening).toBe(true);

    const second = store.subscribe(() => undefined);
    expect(store.subscriberCount).toBe(2);

    first();
    expect(store.isListening).toBe(true);

    second();
    expect(store.subscriberCount).toBe(0);
    expect(store.isListening).toBe(false);
  });

  it("removes the window listeners, so later writes notify nobody", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const store = makeStore();

    const unsubscribe = store.subscribe(() => undefined);
    const addedStorage = add.mock.calls.filter(([type]) => type === "storage").length;

    expect(addedStorage).toBe(1);

    unsubscribe();

    const removedStorage = remove.mock.calls.filter(([type]) => type === "storage").length;
    expect(removedStorage).toBe(1);
    expect(store.isListening).toBe(false);

    add.mockRestore();
    remove.mockRestore();
  });

  it("does not attach merely because the value was read", () => {
    const store = makeStore();

    store.get();
    store.get();

    // A read hits the cache; only a subscriber can be told about a change.
    expect(store.isListening).toBe(false);
  });

  it("re-attaches after a detach", () => {
    const store = makeStore();

    const first = store.subscribe(() => undefined);
    first();
    expect(store.isListening).toBe(false);

    const second = store.subscribe(() => undefined);
    expect(store.isListening).toBe(true);

    second();
  });
});

/* ------------------------------------------------------------------ */
/* DATA-03: server snapshot stability                                  */
/* ------------------------------------------------------------------ */

describe("server snapshot stability", () => {
  it("returns one reference per snapshot when the selector builds a new object", () => {
    const store = makeStore();
    const renders: Array<Record<string, number>> = [];

    const { rerender } = renderHook(() => {
      // A selector that allocates on every call: the classic shape that makes
      // `useSyncExternalStore` believe the snapshot changed on every render.
      const value = useStore(store, (snapshot: Counter) => ({ doubled: snapshot.n * 2 }));
      renders.push(value);
      return value;
    });

    // Re-render with no store change. A stable selector must hand back the
    // same object; an allocating one produces a new one each time and React
    // warns that the server snapshot is not cached.
    rerender();
    rerender();

    expect(renders.length).toBeGreaterThanOrEqual(3);
    expect(renders[1]).toBe(renders[0]);
    expect(renders[2]).toBe(renders[0]);

    // A real change does produce a new reference.
    act(() => store.set({ n: 1 }));
    expect(renders.at(-1)).not.toBe(renders[0]);
    expect(renders.at(-1)).toEqual({ doubled: 2 });
  });

  it("keeps the server cache separate from the client cache", () => {
    const store = makeStore({ n: 0 });
    store.set({ n: 5 });

    const { result } = renderHook(() => useStoreValue(store));

    // The client's snapshot is the stored value; the server default is separate.
    // Sharing one cache would hand the client the empty default instead.
    expect(result.current).toEqual({ n: 5 });
    expect(store.getServerSnapshot()).toEqual({ n: 0 });
  });

  it("reflects a cross-store write through the selector", () => {
    const store = makeStore({ n: 1 });

    const { result } = renderHook(() => useStore(store, (snapshot) => snapshot.n * 10));

    expect(result.current).toBe(10);

    act(() => store.set({ n: 2 }));
    expect(result.current).toBe(20);
  });
});