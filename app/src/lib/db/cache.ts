import * as SQLite from 'expo-sqlite';

import {
  appsCacheKey,
  deserializeSummaries,
  serializeSummaries,
  versionsCacheKey,
} from './cache-utils';
import type { AggregatedAppRow } from '@/lib/api/asc-queries';
import type { VersionSummary } from '@/lib/domain/version-events';

/**
 * Persistent on-device cache backed by expo-sqlite.
 *
 * Two tables:
 *
 *   apps_cache(key TEXT PRIMARY KEY, payload TEXT, fetched_at INTEGER)
 *   versions_cache(key TEXT PRIMARY KEY, payload TEXT, fetched_at INTEGER)
 *
 * Why two tables instead of one polymorphic table:
 *   - Different payload shapes mean different read paths
 *   - Cleaner to vacuum/migrate independently when one schema changes
 *
 * Why we cache derived shapes (`VersionSummary`, `AggregatedAppRow`) and not
 * raw ASC JSON:
 *   - Smaller on disk (one JSON blob, no included relationships)
 *   - Already in the shape the UI wants — no per-render mapping cost
 *   - Cache invalidation = one row per app, never partial
 *
 * Consumer pattern (used by `asc-queries.ts`):
 *   1. on query mount, `getCachedVersions(appId)` synchronously seeds
 *      `initialData` so the UI never sees a spinner on cold start
 *   2. TanStack Query then refetches in the background
 *   3. on network success, `setCachedVersions(appId, summaries)` overwrites
 */

const DB_NAME = 'release-pilot.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (dbPromise === null) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS apps_cache (
          key TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          fetched_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS versions_cache (
          key TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          fetched_at INTEGER NOT NULL
        );
      `);
      return db;
    })();
  }
  return dbPromise;
}

// ---------------------------------------------------------------------------
// Versions cache
// ---------------------------------------------------------------------------

export type CachedVersions = {
  summaries: VersionSummary[];
  fetchedAt: number;
};

export async function getCachedVersions(appId: string): Promise<CachedVersions | null> {
  try {
    const db = await getDb();
    const row = await db.getFirstAsync<{ payload: string; fetched_at: number }>(
      'SELECT payload, fetched_at FROM versions_cache WHERE key = ?',
      versionsCacheKey(appId),
    );
    if (!row) return null;
    const summaries = deserializeSummaries(row.payload);
    if (!summaries) return null;
    return { summaries, fetchedAt: row.fetched_at };
  } catch {
    // Treat any DB hiccup as a cache miss; the network fetch will recover.
    return null;
  }
}

export async function setCachedVersions(appId: string, summaries: VersionSummary[]): Promise<void> {
  try {
    const db = await getDb();
    await db.runAsync(
      `INSERT OR REPLACE INTO versions_cache (key, payload, fetched_at) VALUES (?, ?, ?)`,
      versionsCacheKey(appId),
      serializeSummaries(summaries),
      Date.now(),
    );
  } catch {
    // Cache write failures are non-fatal — silently swallow.
  }
}

// ---------------------------------------------------------------------------
// Apps cache (aggregated app rows across teams)
// ---------------------------------------------------------------------------

export type CachedApps = {
  apps: AggregatedAppRow[];
  fetchedAt: number;
};

export async function getCachedApps(issuerId: string): Promise<CachedApps | null> {
  try {
    const db = await getDb();
    const row = await db.getFirstAsync<{ payload: string; fetched_at: number }>(
      'SELECT payload, fetched_at FROM apps_cache WHERE key = ?',
      appsCacheKey(issuerId),
    );
    if (!row) return null;
    try {
      const parsed = JSON.parse(row.payload) as { v: 1; rows: AggregatedAppRow[] } | unknown;
      if (parsed && typeof parsed === 'object' && (parsed as { v?: number }).v === 1) {
        return { apps: (parsed as { rows: AggregatedAppRow[] }).rows, fetchedAt: row.fetched_at };
      }
    } catch {
      return null;
    }
    return null;
  } catch {
    return null;
  }
}

export async function setCachedApps(issuerId: string, apps: AggregatedAppRow[]): Promise<void> {
  try {
    const db = await getDb();
    await db.runAsync(
      `INSERT OR REPLACE INTO apps_cache (key, payload, fetched_at) VALUES (?, ?, ?)`,
      appsCacheKey(issuerId),
      JSON.stringify({ v: 1, rows: apps }),
      Date.now(),
    );
  } catch {
    // ignore
  }
}

/**
 * Nuclear option — used when the user disconnects a team. Wipes ALL cached
 * data for that issuer so a fresh re-connect starts clean.
 */
export async function clearCacheForIssuer(issuerId: string, appIds: string[]): Promise<void> {
  try {
    const db = await getDb();
    await db.runAsync('DELETE FROM apps_cache WHERE key = ?', appsCacheKey(issuerId));
    for (const id of appIds) {
      await db.runAsync('DELETE FROM versions_cache WHERE key = ?', versionsCacheKey(id));
    }
  } catch {
    // ignore
  }
}
