import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createStore, parseMapSafely, readRaw, writeRaw, type Store } from "@/lib/storage/createStore";
import { STORAGE_KEYS, STORE_EVENT } from "@/lib/storage/keys";
import { MIGRATIONS, readSchemaVersion, runMigrations } from "@/lib/storage/migrations";
import { noteSchema } from "@/lib/schemas";
import { enrollmentsStore, notesStore, settingsStore } from "@/lib/storage/stores";
import { createNote, createEnrollment } from "@/lib/storage/stores";
import { activityRecordSchema } from "@/lib/schemas";
import { pruneActivityMap } from "@/lib/storage/migrations";
import type { ActivityDay } from "@/lib/types";
import { shiftLocalDateKey } from "@/lib/utils/time";

const NOW = "2026-01-31T09:00:00.000Z";

interface Counter {
  count: number;
}

const counterSchema = z.object({ count: z.number().int().min(0) });

/**
 * A fresh store per test.
 *
 * The store caches at module-instance level, so a shared instance would let one
 * test's write leak into the next — exactly the coupling these tests exist to
 * rule out.
 */
function makeCounterStore(): Store<Counter> {
  return createStore<Counter>({
    key: STORAGE_KEYS.durations,
    defaultValue: { count: 0 },
    schema: counterSchema,
  });
}

describe("createStore cache identity", () => {
  it("returns the same reference until a write happens", () => {
    const counterStore = makeCounterStore();
    const first = counterStore.get();
    const second = counterStore.get();

    expect(first).toBe(second);

    counterStore.set({ count: 1 });
    const third = counterStore.get();

    expect(third).not.toBe(first);
    expect(third).toEqual({ count: 1 });
    expect(counterStore.get()).toBe(third);
  });

  it("keeps a stable reference after reading from storage twice", () => {
    const counterStore = makeCounterStore();
    writeRaw(STORAGE_KEYS.durations, JSON.stringify({ count: 5 }));

    const first = counterStore.get();
    const second = counterStore.get();

    expect(first).toBe(second);
    expect(first).toEqual({ count: 5 });
  });

  it("always answers getServerSnapshot with the default", () => {
    const counterStore = makeCounterStore();
    counterStore.set({ count: 9 });

    expect(counterStore.getServerSnapshot()).toEqual({ count: 0 });
  });

  it("supports functional updates", () => {
    const counterStore = makeCounterStore();
    counterStore.set((prev) => ({ count: prev.count + 3 }));

    expect(counterStore.get()).toEqual({ count: 3 });
  });

  it("notifies subscribers on write and stops after unsubscribe", () => {
    const counterStore = makeCounterStore();
    const listener = vi.fn();
    const unsubscribe = counterStore.subscribe(listener);

    counterStore.set({ count: 1 });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    counterStore.set({ count: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("dispatches a same-tab custom event carrying the key and its source", () => {
    const counterStore = makeCounterStore();
    const handler = vi.fn();
    window.addEventListener(STORE_EVENT, handler);

    counterStore.set({ count: 2 });

    expect(handler).toHaveBeenCalledTimes(1);
    const detail = (handler.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.key).toBe(STORAGE_KEYS.durations);
    expect(typeof detail.source).toBe("string");

    window.removeEventListener(STORE_EVENT, handler);
  });

  it("does not invalidate its own cache when it writes", () => {
    // The originating store must ignore its own dispatched event: handling it
    // would drop the cache and hand the next `get()` a new reference, which is
    // exactly the identity guarantee `useSyncExternalStore` relies on.
    const counterStore = makeCounterStore();
    counterStore.set({ count: 3 });

    const first = counterStore.get();
    const second = counterStore.get();

    expect(first).toBe(second);
    expect(first).toEqual({ count: 3 });
  });

  it("re-reads when a cross-tab storage event arrives", () => {
    const counterStore = makeCounterStore();
    expect(counterStore.get()).toEqual({ count: 0 });

    window.localStorage.setItem(STORAGE_KEYS.durations, JSON.stringify({ count: 42 }));
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEYS.durations }));

    expect(counterStore.get()).toEqual({ count: 42 });
  });

  it("ignores a storage event for a different key while subscribed", () => {
    const counterStore = makeCounterStore();

    // Subscribing is what attaches the window listeners; only then is the
    // cache authoritative between notifications.
    const unsubscribe = counterStore.subscribe(() => undefined);

    expect(counterStore.get()).toEqual({ count: 0 });
    window.localStorage.setItem(STORAGE_KEYS.durations, JSON.stringify({ count: 42 }));

    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEYS.profile }));

    // Still the cached value: the event named someone else's key.
    expect(counterStore.get()).toEqual({ count: 0 });
    unsubscribe();
  });

  it("re-derives an unsubscribed store from storage, since nothing can notify it", () => {
    const counterStore = makeCounterStore();

    // No subscriber, so no listener is attached (PERF-01). A change made by
    // another tab still has to be visible on the next read, which is why the
    // raw payload is compared rather than trusting the cache.
    expect(counterStore.get()).toEqual({ count: 0 });
    expect(counterStore.isListening).toBe(false);

    window.localStorage.setItem(STORAGE_KEYS.durations, JSON.stringify({ count: 42 }));

    expect(counterStore.get()).toEqual({ count: 42 });
    // Unchanged payload, unchanged reference: identity still holds.
    const first = counterStore.get();
    expect(counterStore.get()).toBe(first);
  });

  it("treats a cleared area (key === null) as invalidation", () => {
    const counterStore = makeCounterStore();
    writeRaw(STORAGE_KEYS.durations, JSON.stringify({ count: 7 }));
    expect(counterStore.get()).toEqual({ count: 7 });

    window.localStorage.clear();
    window.dispatchEvent(new StorageEvent("storage", { key: null }));

    expect(counterStore.get()).toEqual({ count: 0 });
  });
});

describe("createStore validation and repair", () => {
  it("rejects an invalid write and leaves the cache untouched", () => {
    const counterStore = makeCounterStore();
    counterStore.set({ count: 4 });
    counterStore.set({ count: -1 });

    expect(counterStore.get()).toEqual({ count: 4 });
  });

  it("falls back to the default for unparseable JSON", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const counterStore = makeCounterStore();
    writeRaw(STORAGE_KEYS.durations, "{not json");

    expect(counterStore.get()).toEqual({ count: 0 });
    expect(warn).toHaveBeenCalled();
  });

  it("falls back to the default for a schema-invalid payload", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const counterStore = makeCounterStore();
    writeRaw(STORAGE_KEYS.durations, JSON.stringify({ count: "many" }));

    expect(counterStore.get()).toEqual({ count: 0 });
    expect(warn).toHaveBeenCalled();
  });

  it("keeps valid records when one entry in a map is corrupt", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    notesStore.refresh();

    const good = createNote("c1", "l1", 5, "keep me", NOW);
    writeRaw(
      STORAGE_KEYS.notes,
      JSON.stringify({ [good.id]: good, broken: { id: "broken" } }),
    );

    const map = notesStore.get();
    expect(Object.keys(map)).toEqual([good.id]);
    expect(warn).toHaveBeenCalled();
  });

  it("drops invalid map entries individually via parseMapSafely", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const parsed = parseMapSafely(
      { a: { id: "n1", courseId: "c", lessonId: "l", timestampSec: 0, body: "x", createdAt: NOW, updatedAt: NOW } },
      noteSchema,
      STORAGE_KEYS.notes,
    );

    expect(Object.keys(parsed)).toEqual(["a"]);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("createStore quota handling", () => {
  it("reports a quota failure through onQuotaExceeded", () => {
    const onQuotaExceeded = vi.fn();
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });

    const store = createStore<Counter>({
      key: STORAGE_KEYS.settings,
      defaultValue: { count: 0 },
      schema: z.object({ count: z.number().int().min(0) }),
      onQuotaExceeded,
    });

    store.set({ count: 1 });
    expect(onQuotaExceeded).toHaveBeenCalledWith(STORAGE_KEYS.settings);

    setItem.mockRestore();
  });

  it("prunes and retries once when onQuotaPrune makes room", () => {
    let failNext = true;
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      if (failNext) {
        failNext = false;
        throw new DOMException("quota", "QuotaExceededError");
      }
    });

    const onQuotaExceeded = vi.fn();
    const store = createStore<Counter>({
      key: STORAGE_KEYS.durations,
      defaultValue: { count: 0 },
      schema: z.object({ count: z.number().int().min(0) }),
      onQuotaPrune: (current) => ({ count: Math.max(0, current.count - 1) }),
      onQuotaExceeded,
    });

    store.set({ count: 10 });

    expect(onQuotaExceeded).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});

describe("migrations", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts at version 0 and records the current version on boot", () => {
    expect(readSchemaVersion()).toBe(0);

    const result = runMigrations();

    expect(result.from).toBe(0);
    expect(result.to).toBe(MIGRATIONS.length);
    expect(result.applied).toEqual([1]);
    expect(readSchemaVersion()).toBe(MIGRATIONS.length);
  });

  it("is a no-op once the cursor is current", () => {
    runMigrations();
    const second = runMigrations();

    expect(second.from).toBe(second.to);
    expect(second.applied).toEqual([]);
  });

  it("runs only the missing steps", () => {
    writeRaw(STORAGE_KEYS.schema, JSON.stringify({ version: 1 }));

    const result = runMigrations();
    expect(result.from).toBe(1);
    expect(result.applied).toEqual([]);
  });
});

describe("pruneActivityMap", () => {
  const today = "2026-01-31";

  function day(date: string): ActivityDay {
    return {
      id: date,
      date,
      secondsWatched: 120,
      lessonsCompleted: 1,
      createdAt: NOW,
      updatedAt: NOW,
    };
  }

  it("keeps days inside the retention window", () => {
    const map = { [today]: day(today), [shiftLocalDateKey(today, -3)]: day(shiftLocalDateKey(today, -3)) };

    expect(Object.keys(pruneActivityMap(map, 400, today)).sort()).toEqual(
      [shiftLocalDateKey(today, -3), today].sort(),
    );
  });

  it("drops days beyond the window", () => {
    const old = shiftLocalDateKey(today, -120);
    const map = { [today]: day(today), [old]: day(old) };

    expect(Object.keys(pruneActivityMap(map, 90, today))).toEqual([today]);
  });

  it("drops structurally invalid records", () => {
    const map = { [today]: day(today), bad: { id: "bad" } as unknown as ActivityDay };

    expect(Object.keys(pruneActivityMap(map, 400, today))).toEqual([today]);
    expect(activityRecordSchema.safeParse(pruneActivityMap(map, 400, today)).success).toBe(true);
  });
});

describe("concrete stores", () => {
  it("starts the settings store at documented defaults", () => {
    expect(settingsStore.get()).toEqual({
      playbackRate: 1,
      autoplayNext: true,
      volume: 1,
      muted: false,
    });
  });

  it("round-trips an enrollment", () => {
    enrollmentsStore.refresh();
    const enrollment = createEnrollment("course_1", NOW);

    enrollmentsStore.set({ [enrollment.courseId]: enrollment });
    enrollmentsStore.refresh();

    expect(enrollmentsStore.get()[enrollment.courseId]).toEqual(enrollment);
  });

  it("persists writes as readable JSON", () => {
    notesStore.refresh();
    const note = createNote("c1", "l1", 3, "hello", NOW);
    notesStore.set({ [note.id]: note });

    const raw = readRaw(STORAGE_KEYS.notes);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)[note.id].body).toBe("hello");
  });
});
