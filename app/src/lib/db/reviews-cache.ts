import * as SQLite from 'expo-sqlite';

import {
  deserializeList,
  reviewsCacheKey,
  serializeList,
} from './cache-utils';
import type { ReviewSummary } from '@/lib/domain/review-feed';

/**
 * On-device cache for the customer-reviews collection per app.
 *
 * Same stale-while-revalidate pattern as `versions_cache` — TanStack
 * `placeholderData` is seeded from disk so the inbox renders instantly
 * on cold start, then a background fetch refreshes.
 *
 * We deliberately share the SQLite database file with `cache.ts` to
 * keep a single WAL log + one open connection.
 */

const DB_NAME = 'release-pilot.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (dbPromise === null) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS reviews_cache (
          key TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          fetched_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS reply_queue (
          review_id TEXT PRIMARY KEY,
          app_id TEXT NOT NULL,
          issuer_id TEXT NOT NULL,
          body TEXT NOT NULL,
          queued_at INTEGER NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT
        );
        CREATE INDEX IF NOT EXISTS reply_queue_app ON reply_queue(app_id);
      `);
      return db;
    })();
  }
  return dbPromise;
}

// ---------------------------------------------------------------------------
// Reviews cache
// ---------------------------------------------------------------------------

export type CachedReviews = {
  reviews: ReviewSummary[];
  fetchedAt: number;
};

export async function getCachedReviews(appId: string): Promise<CachedReviews | null> {
  try {
    const db = await getDb();
    const row = await db.getFirstAsync<{ payload: string; fetched_at: number }>(
      'SELECT payload, fetched_at FROM reviews_cache WHERE key = ?',
      reviewsCacheKey(appId),
    );
    if (!row) return null;
    const reviews = deserializeList<ReviewSummary>(row.payload);
    if (!reviews) return null;
    return { reviews, fetchedAt: row.fetched_at };
  } catch {
    return null;
  }
}

export async function setCachedReviews(appId: string, reviews: ReviewSummary[]): Promise<void> {
  try {
    const db = await getDb();
    await db.runAsync(
      `INSERT OR REPLACE INTO reviews_cache (key, payload, fetched_at) VALUES (?, ?, ?)`,
      reviewsCacheKey(appId),
      serializeList(reviews),
      Date.now(),
    );
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Offline reply queue
// ---------------------------------------------------------------------------

export type QueuedReply = {
  reviewId: string;
  appId: string;
  issuerId: string;
  body: string;
  queuedAt: number;
  attempts: number;
  lastError: string | null;
};

/**
 * Add (or replace) a queued reply. We use the review_id as PK so a
 * second tap on Send for the same review overwrites the previous queued
 * draft rather than creating duplicates.
 */
export async function enqueueReply(args: {
  reviewId: string;
  appId: string;
  issuerId: string;
  body: string;
}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO reply_queue
     (review_id, app_id, issuer_id, body, queued_at, attempts, last_error)
     VALUES (?, ?, ?, ?, ?, 0, NULL)`,
    args.reviewId,
    args.appId,
    args.issuerId,
    args.body,
    Date.now(),
  );
}

export async function dequeueReply(reviewId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM reply_queue WHERE review_id = ?`, reviewId);
}

export async function markReplyError(reviewId: string, errorMessage: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE reply_queue SET attempts = attempts + 1, last_error = ? WHERE review_id = ?`,
    errorMessage,
    reviewId,
  );
}

export async function listQueuedReplies(): Promise<QueuedReply[]> {
  try {
    const db = await getDb();
    const rows = await db.getAllAsync<{
      review_id: string;
      app_id: string;
      issuer_id: string;
      body: string;
      queued_at: number;
      attempts: number;
      last_error: string | null;
    }>('SELECT * FROM reply_queue ORDER BY queued_at ASC');
    return rows.map((r) => ({
      reviewId: r.review_id,
      appId: r.app_id,
      issuerId: r.issuer_id,
      body: r.body,
      queuedAt: r.queued_at,
      attempts: r.attempts,
      lastError: r.last_error,
    }));
  } catch {
    return [];
  }
}

/** Index queued replies by reviewId for fast lookup in the inbox UI. */
export async function getQueuedRepliesMap(): Promise<Map<string, QueuedReply>> {
  const all = await listQueuedReplies();
  const map = new Map<string, QueuedReply>();
  for (const q of all) map.set(q.reviewId, q);
  return map;
}
