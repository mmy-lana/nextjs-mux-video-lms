/**
 * localStorage key namespace.
 *
 * Every key is versioned behind the `lms.v1.` prefix so a future schema can
 * coexist with (or cleanly replace) this one, and so the migration runner can
 * detect an empty, foreign or partially initialised store.
 */

export const STORAGE_PREFIX = "lms.v1." as const;

export const STORAGE_KEYS = {
  profile: "lms.v1.profile",
  enrollments: "lms.v1.enrollments",
  progress: "lms.v1.progress",
  notes: "lms.v1.notes",
  settings: "lms.v1.settings",
  durations: "lms.v1.durations",
  activity: "lms.v1.activity",
  studioCourses: "lms.v1.studio.courses",
  studioJobs: "lms.v1.studio.jobs",
  schema: "lms.v1.schema",
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

/** Every key, in the order the store layer reads them on boot. */
export const ALL_STORAGE_KEYS: readonly StorageKey[] = Object.values(STORAGE_KEYS);

/** Build a namespaced key; used by tests and future schema versions. */
export function storageKey(name: string): string {
  return `${STORAGE_PREFIX}${name}`;
}

/**
 * Event name for same-tab change notification.
 *
 * `storage` events only fire in *other* tabs, so the store dispatches this
 * custom event to reach its own subscribers after a write.
 */
export const STORE_EVENT = "lms:store" as const;

export interface StoreEventDetail {
  key: StorageKey;
  /**
   * Identifies the store instance that performed the write.
   *
   * The originating store ignores its own event: it has already swapped the
   * cache and notified, and handling its own event would invalidate the cache
   * and hand the next `get()` a fresh reference — breaking the identity
   * guarantee `useSyncExternalStore` depends on.
   */
  source: string;
}

/** Days of activity retained on boot; older days are pruned. */
export const ACTIVITY_RETENTION_DAYS = 400;

/** Days pruned when a write hits the storage quota. */
export const ACTIVITY_QUOTA_PRUNE_DAYS = 90;
