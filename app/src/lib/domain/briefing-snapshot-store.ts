import type { BriefingSnapshot } from './briefing';
import { storage } from '@/lib/state/storage';

/**
 * Persistence layer for the last briefing snapshot.
 *
 * Why MMKV (not SQLite): the snapshot is one small JSON blob (~few KB
 * even with 3 apps × 200 review IDs). MMKV is synchronous, so the
 * Briefing tab can read it during the first render without an async
 * gate, eliminating spinner flash.
 *
 * Schema is versioned with `__v` so a future shape change can return
 * `null` (treat as first briefing) instead of crashing on parse.
 */

const KEY = 'briefing.lastSnapshot';
const SCHEMA_VERSION = 1;

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
