import type { BriefingSnapshot } from './briefing';
import { storage } from '@/lib/state/storage';

/**
 * Persistence layer for the briefing baseline snapshot.
 *
 * Why MMKV (not SQLite): the snapshot is one small JSON blob (~few KB
 * even with 3 apps × 200 review IDs). MMKV is synchronous, so the
 * Briefing tab can read it during the first render without an async
 * gate, eliminating spinner flash.
 *
 * Schema is versioned with `__v` so a future shape change can return
 * `null` (treat as first briefing) instead of crashing on parse.
 *
 * Baseline lifecycle (anchored at 7am local):
 *   - The persisted snapshot represents "the state of the world at the
 *     start of today's briefing window" (i.e. the most recent 7am that
 *     has passed in the user's local time).
 *   - On briefing build, we compare current state against this baseline
 *     and surface the deltas (state changes, new reviews, ...).
 *   - The baseline is REPLACED only when it's older than the most recent
 *     7am — i.e. once per day at most, on the first open after 7am.
 *   - Mid-day re-opens DO NOT overwrite the baseline, so multi-app
 *     state changes accumulate naturally throughout the day instead of
 *     evaporating after the first glance.
 *   - The 7am anchor intentionally matches the existing daily push so
 *     the push notification and the Today tab speak about the same
 *     "today" window.
 */

const KEY = 'briefing.lastSnapshot';
const SCHEMA_VERSION = 1;

/**
 * Hour-of-day (0..23, local time) at which the briefing window rolls
 * over. Must stay in sync with the daily push schedule in
 * `setup-notifications.ts`.
 */
export const DAILY_BOUNDARY_HOUR_LOCAL = 7;

type StoredSnapshot = BriefingSnapshot & { __v: number };

export function loadLastBriefingSnapshot(): BriefingSnapshot | null {
  const raw = storage.getString(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredSnapshot;
    if (parsed.__v !== SCHEMA_VERSION) return null;
    // Defensive: ensure expected fields are present
    if (
      typeof parsed.atMs !== 'number' ||
      typeof parsed.statesByAppId !== 'object' ||
      typeof parsed.knownReviewIdsByAppId !== 'object'
    ) {
      return null;
    }
    return {
      atMs: parsed.atMs,
      statesByAppId: parsed.statesByAppId,
      knownReviewIdsByAppId: parsed.knownReviewIdsByAppId,
    };
  } catch {
    // Corrupt JSON → wipe and start fresh
    storage.remove(KEY);
    return null;
  }
}

export function saveBriefingSnapshot(snapshot: BriefingSnapshot): void {
  const wrapped: StoredSnapshot = { ...snapshot, __v: SCHEMA_VERSION };
  storage.set(KEY, JSON.stringify(wrapped));
}

/** For testing + diagnostics. Not used by app code. */
export function clearBriefingSnapshot(): void {
  storage.remove(KEY);
}

// ---------------------------------------------------------------------------
// Daily-window helpers
// ---------------------------------------------------------------------------

/**
 * Returns the timestamp of the most recent {@link DAILY_BOUNDARY_HOUR_LOCAL}
 * (default 7am) local time, relative to `nowMs`.
 *
 *   - If `now` is at or after today's 7am → returns today's 7am.
 *   - If `now` is before today's 7am → returns yesterday's 7am.
 *
 * Used to decide whether the persisted baseline snapshot is still
 * valid for "today's" briefing, or whether the day has rolled over and
 * the baseline needs to be rotated.
 *
 * Pure / deterministic. Honors the host machine's local timezone via
 * `Date`'s local-time constructors — no `expo-localization` dependency
 * needed.
 */
export function mostRecent7amLocal(nowMs: number): number {
  const now = new Date(nowMs);
  const today7am = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    DAILY_BOUNDARY_HOUR_LOCAL,
    0,
    0,
    0,
  );
  if (nowMs >= today7am.getTime()) return today7am.getTime();
  // Before 7am today → most recent boundary is yesterday's 7am.
  // We subtract 24h rather than `setDate(date-1)` so DST edge cases
  // (spring-forward / fall-back) shift the anchor by ±1h, which is
  // acceptable for a daily window and avoids invalid-date pitfalls.
  return today7am.getTime() - 24 * 60 * 60 * 1000;
}

/**
 * Returns `true` when the persisted baseline is from BEFORE the most
 * recent 7am local boundary — meaning the day has rolled over since it
 * was saved, and the briefing tab should rotate to a fresh baseline.
 *
 * Treats a `null` snapshot as stale (first-ever briefing).
 */
export function isSnapshotStaleForToday(
  snapshot: BriefingSnapshot | null,
  nowMs: number,
): boolean {
  if (!snapshot) return true;
  return snapshot.atMs < mostRecent7amLocal(nowMs);
}
