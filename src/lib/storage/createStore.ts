/**
 * Reactive, SSR-safe localStorage store factory.
 *
 * Design constraints, in order of importance:
 *
 * 1. **Reference identity.** `get()` must return the *same* object until a
 *    write happens, otherwise `useSyncExternalStore` re-renders forever.
 * 2. **SSR parity.** `getServerSnapshot()` returns the default, so the server
 *    HTML and the first client render always match.
 * 3. **Per-record repair.** One corrupt entry is dropped and warned about; it
 *    never takes the whole map down.
 * 4. **Quota safety.** Every write is wrapped, with a prune-and-retry path.
 */

import type { z } from "zod";

import {
  ACTIVITY_RETENTION_DAYS,
  STORE_EVENT,
  STORAGE_KEYS,
  type StorageKey,
  type StoreEventDetail,
} from "./keys";

/** Non-throwing localStorage access; `null` during SSR or when blocked. */
export type StorageArea = Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;

export interface Store<T> {
  /** Current snapshot. The same reference is returned until `set()` runs. */
  get(): T;
  /** Validate, persist, swap the cache and notify subscribers. */
  set(next: T | ((prev: T) => T)): void;
  /** Register a listener; returns the unsubscribe function. */
  subscribe(cb: () => void): () => void;
  /** Always the default, so SSR and first paint agree. */
  getServerSnapshot(): T;
  /** Forget the cached value and re-read from storage. */
  refresh(): void;
  /** The key this store owns. */
  readonly key: StorageKey;
}

export type Updater<T> = T | ((prev: T) => T);

export interface CreateStoreOptions<T> {
  key: StorageKey;
  /** Value used on the server, on a cold client, and for corrupt payloads. */
  defaultValue: T;
  /** Validates the whole payload. Return `null` to fall back to the default. */
  schema: z.ZodType<T>;
  /**
   * Second chance for payloads the top-level schema rejected — used by the map
   * stores to keep the good records and drop only the bad ones.
   */
  repair?: (raw: unknown, fallback: T) => T;
  /**
   * Called when a write fails because the origin's quota is exhausted. The UI
   * surfaces a non-blocking toast rather than losing the write silently.
   */
  onQuotaExceeded?: (key: StorageKey) => void;
  /**
   * Shrinks the current value to make room after a quota failure.
   *
   * The write is then retried exactly once. Only the activity log supplies
   * this — it is the one dataset the app is allowed to shed, and it is pruned
   * down to a shorter retention window before the retry.
   */
  onQuotaPrune?: (current: T) => T;
  /**
   * Called after `get()` decides the stored value is usable. Only fires when
   * the value changed, so React re-renders exactly once per real change.
   */
  onHydrate?: (value: T) => void;
}

/** In-memory fallback so private-mode Safari and SSR both keep working. */
const memoryFallback = new Map<string, string>();

/** Warn at most once per key, as specified by plan §2.1. */
const warnedKeys = new Set<string>();

let storeCounter = 0;

/** Unique id per store instance, used to ignore its own dispatched event. */
function createStoreSource(): string {
  storeCounter += 1;
  return `store_${storeCounter}`;
}

function warnOnce(key: string, message: string, detail?: unknown): void {
  if (warnedKeys.has(key)) return;
  warnedKeys.add(key);

  if (detail === undefined) {
    console.warn(`[lms] ${message}`);
  } else {
    console.warn(`[lms] ${message}`, detail);
  }
}

/** Test seam: forget the "warned once" bookkeeping. */
export function resetStoreWarnings(): void {
  warnedKeys.clear();
}

/**
 * Resolve the storage area to use.
 *
 * Touching `localStorage` throws outright in some privacy modes, so even reading
 * the property is guarded.
 */
export function getStorageArea(): StorageArea {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Read a raw string, falling back to the in-memory mirror when blocked. */
export function readRaw(key: StorageKey): string | null {
  const area = getStorageArea();

  if (area) {
    try {
      return area.getItem(key);
    } catch {
      // Fall through to the memory mirror.
    }
  }

  return memoryFallback.get(key) ?? null;
}

/** Write a raw string, tracking quota failures for the caller to react to. */
export function writeRaw(key: StorageKey, value: string): boolean {
  const area = getStorageArea();

  if (area) {
    try {
      area.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  memoryFallback.set(key, value);
  return true;
}

/** Remove a key from both the real area and the in-memory mirror. */
export function removeRaw(key: StorageKey): void {
  const area = getStorageArea();

  if (area) {
    try {
      area.removeItem(key);
    } catch {
      // Nothing useful to do; the value is unreachable either way.
    }
  }

  memoryFallback.delete(key);
}

/** Test seam: drop the in-memory mirror. */
export function clearMemoryFallback(): void {
  memoryFallback.clear();
}

function parsePayload<T>(
  raw: string | null,
  options: CreateStoreOptions<T>,
): { value: T; changed: boolean } {
  if (raw === null) {
    return { value: options.defaultValue, changed: false };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    warnOnce(`${options.key}:json`, `Discarded unparseable payload for "${options.key}".`);
    return { value: options.defaultValue, changed: true };
  }

  const result = options.schema.safeParse(parsed);
  if (result.success) {
    // A zod object rebuilds the value, so the reference differs from the raw
    // object. The cache holds this rebuilt value until the next write, which is
    // what keeps `get()` referentially stable.
    return { value: result.data, changed: false };
  }

  if (options.repair) {
    const repaired = options.repair(parsed, options.defaultValue);
    warnOnce(
      `${options.key}:repair`,
      `Repaired stored payload for "${options.key}" using schema rules.`,
    );
    return { value: repaired, changed: true };
  }

  warnOnce(`${options.key}:schema`, `Discarded invalid payload for "${options.key}".`);
  return { value: options.defaultValue, changed: true };
}

/**
 * Create a store bound to one localStorage key.
 *
 * Modules call this at module scope so every consumer inside a tab shares one
 * cache, one subscription set and one cross-tab listener.
 */
export function createStore<T>(options: CreateStoreOptions<T>): Store<T> {
  const listeners = new Set<() => void>();
  const source = createStoreSource();
  let cache: T | undefined;
  let attached = false;

  const notify = (): void => {
    for (const listener of [...listeners]) listener();
  };

  const handleStorageEvent = (event: StorageEvent): void => {
    // `key === null` means the whole area was cleared.
    if (event.key !== null && event.key !== options.key) return;

    cache = undefined;
    notify();
  };

  const handleStoreEvent = (event: Event): void => {
    const detail = (event as CustomEvent<StoreEventDetail>).detail;
    if (!detail || detail.key !== options.key) return;
    // Our own write already swapped the cache and notified.
    if (detail.source === source) return;

    cache = undefined;
    notify();
  };

  const attach = (): void => {
    if (attached || typeof window === "undefined") return;
    attached = true;

    window.addEventListener("storage", handleStorageEvent);
    window.addEventListener(STORE_EVENT, handleStoreEvent);
  };

  const persist = (next: T): boolean => {
    const serialized = JSON.stringify(next);

    if (writeRaw(options.key, serialized)) return true;

    if (options.onQuotaPrune) {
      // Plan §2.2: prune, then retry exactly once.
      const current = parsePayload(readRaw(options.key), options).value;
      const pruned = options.onQuotaPrune(current);

      if (writeRaw(options.key, JSON.stringify(pruned))) return true;
    }

    options.onQuotaExceeded?.(options.key);
    return false;
  };

  const store: Store<T> = {
    key: options.key,

    get(): T {
      if (cache !== undefined) return cache;

      const raw = readRaw(options.key);
      const { value, changed } = parsePayload(raw, options);

      if (changed && raw !== null) persist(value);

      cache = value;
      attach();
      options.onHydrate?.(value);

      return cache;
    },

    set(next: Updater<T>): void {
      const previous = store.get();
      const resolved = typeof next === "function" ? (next as (prev: T) => T)(previous) : next;

      const result = options.schema.safeParse(resolved);
      if (!result.success) {
        warnOnce(
          `${options.key}:write`,
          `Rejected an invalid write to "${options.key}".`,
          result.error.issues,
        );
        return;
      }

      // Store exactly what was validated so readers never see unvalidated data.
      cache = result.data;
      persist(cache);
      attach();

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent<StoreEventDetail>(STORE_EVENT, {
            detail: { key: options.key, source },
          }),
        );
      }

      notify();
    },

    subscribe(cb: () => void): () => void {
      listeners.add(cb);
      attach();

      return () => {
        listeners.delete(cb);
      };
    },

    getServerSnapshot(): T {
      return options.defaultValue;
    },

    refresh(): void {
      cache = undefined;
      notify();
    },
  };

  return store;
}

/**
 * Parse each entry of a stored map individually, dropping the ones that fail.
 *
 * This is what keeps a single bad record from taking a whole collection with
 * it, as required by plan §2.1.
 */
export function parseMapSafely<TEntry>(
  raw: unknown,
  entrySchema: z.ZodType<TEntry>,
  key: StorageKey,
): Record<string, TEntry> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};

  const out: Record<string, TEntry> = {};
  const dropped: string[] = [];

  for (const [entryKey, entryValue] of Object.entries(raw as Record<string, unknown>)) {
    const parsed = entrySchema.safeParse(entryValue);
    if (parsed.success) {
      out[entryKey] = parsed.data;
    } else {
      dropped.push(entryKey);
    }
  }

  if (dropped.length > 0) {
    warnOnce(
      `${key}:entries`,
      `Dropped ${dropped.length} invalid record(s) from "${key}": ${dropped.join(", ")}.`,
    );
  }

  return out;
}

/** Days of activity kept by {@link pruneActivityMap}. */
export { ACTIVITY_RETENTION_DAYS };
