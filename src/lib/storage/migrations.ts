/**
 * Schema migrations and retention.
 *
 * The migration runner is deliberately tiny: an ordered array of pure steps,
 * applied to the raw persisted map until the stored version matches the array
 * length. Adding a step is the only supported way to change the shape.
 */

import { z } from "zod";

import { activityDaySchema, schemaVersionSchema } from "../schemas";
import type { ActivityDay } from "../types";
import { localDateKey, shiftLocalDateKey } from "../utils/time";
import { ACTIVITY_RETENTION_DAYS, STORAGE_KEYS, type StorageKey } from "./keys";
import { readRaw, removeRaw, writeRaw } from "./createStore";

/** The persisted namespace, as raw JSON. */
export type PersistedDb = Record<string, unknown>;

/** A migration step. Must be pure and idempotent. */
export type MigrationStep = (db: PersistedDb) => PersistedDb;

/** Read every namespaced key out of storage into a plain object. */
export function readDb(): PersistedDb {
  const db: PersistedDb = {};

  for (const key of Object.values(STORAGE_KEYS)) {
    const raw = readRaw(key);
    if (raw === null) continue;

    try {
      db[key] = JSON.parse(raw);
    } catch {
      // A key we cannot parse is treated as absent; the owning store will
      // repair or discard it on first read.
    }
  }

  return db;
}

/** Write a whole db back to storage, skipping absent keys. */
export function writeDb(db: PersistedDb): void {
  for (const [key, value] of Object.entries(db)) {
    if (value === undefined) {
      removeRaw(key as StorageKey);
      continue;
    }

    writeRaw(key as StorageKey, JSON.stringify(value));
  }
}

/** The current version of the persisted schema. */
export function currentSchemaVersion(): number {
  return MIGRATIONS.length;
}

/** The version recorded in storage, or `0` when absent or unreadable. */
export function readSchemaVersion(): number {
  const raw = readRaw(STORAGE_KEYS.schema);
  if (raw === null) return 0;

  try {
    const parsed = schemaVersionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.version : 0;
  } catch {
    return 0;
  }
}

/**
 * Ordered migration steps.
 *
 * Version 1 is the identity baseline: it establishes the empty shape so a
 * first-run store is indistinguishable from a migrated one. Later steps must be
 * appended, never reordered, so a browser that skipped a version can still be
 * brought forward.
 */
export const MIGRATIONS: readonly MigrationStep[] = [
  // v1 — identity baseline.
  (db) => db,
];

/** Result of {@link runMigrations}, returned so callers can report progress. */
export interface MigrationResult {
  from: number;
  to: number;
  /** Versions actually executed, ascending. */
  applied: number[];
  db: PersistedDb;
}

/**
 * Bring a stored database up to {@link currentSchemaVersion}.
 *
 * Steps run in order for each missing version and the cursor is written last,
 * so an interrupted boot re-runs only the steps it had not finished.
 */
export function runMigrations(db: PersistedDb = readDb()): MigrationResult {
  const from = readSchemaVersion();
  const to = currentSchemaVersion();

  let working = db;
  const applied: number[] = [];

  for (let version = from; version < to; version += 1) {
    const step = MIGRATIONS[version];
    if (!step) continue;

    working = step(working);
    applied.push(version + 1);
  }

  working[STORAGE_KEYS.schema] = { version: to };
  writeDb(working);

  return { from, to, applied, db: working };
}

/* ------------------------------------------------------------------ */
/* Activity retention                                                  */
/* ------------------------------------------------------------------ */

/**
 * Drop activity days older than `retentionDays` local calendar days.
 *
 * Used on boot (400-day window) and again when a write hits the storage quota
 * (90-day window), which is the only place in the app that sheds data.
 */
export function pruneActivityMap(
  map: Record<string, ActivityDay>,
  retentionDays: number = ACTIVITY_RETENTION_DAYS,
  today: string = localDateKey(),
): Record<string, ActivityDay> {
  const cutoff = shiftLocalDateKey(today, -(retentionDays - 1));
  const kept: Record<string, ActivityDay> = {};

  for (const [key, day] of Object.entries(map)) {
    const parsed = activityDaySchema.safeParse(day);
    if (!parsed.success) continue;
    if (parsed.data.date < cutoff) continue;

    kept[key] = parsed.data;
  }

  return kept;
}
