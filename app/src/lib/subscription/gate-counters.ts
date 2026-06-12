import { storage } from '@/lib/state/storage';
import { MONTH_MS, WEEK_MS } from './gates';

/**
 * MMKV-backed counters that feed the gate logic.
 *
 * Keys:
 *  - `paywall.checklist-runs.v1`   → epoch-ms timestamps for checklist
 *                                    runs (7-day rolling window).
 *  - `paywall.review-replies.v1`   → epoch-ms timestamps for review
 *                                    replies (30-day rolling window).
 *
 * We prune entries older than the relevant window on every read AND
 * write so each array stays bounded.
 */

const CHECKLIST_RUNS_KEY = 'paywall.checklist-runs.v1';
const REVIEW_REPLIES_KEY = 'paywall.review-replies.v1';

function readArray(key: string): number[] {
  const raw = storage.getString(key);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((n): n is number => typeof n === 'number') : [];
  } catch {
    return [];
  }
}

function writeArray(key: string, arr: number[]): void {
  storage.set(key, JSON.stringify(arr));
}

// ---------------------------------------------------------------------------
// Checklist runs (7-day rolling window)
// ---------------------------------------------------------------------------

/** Returns the list of checklist runs in the last 7 days. */
export function getChecklistRuns(nowMs: number = Date.now()): number[] {
  const all = readArray(CHECKLIST_RUNS_KEY);
  const cutoff = nowMs - WEEK_MS;
  return all.filter((t) => t >= cutoff);
}

/** Records a new checklist run RIGHT NOW (caller invokes after the
 *  query actually fires; failed/cached results don't count). */
export function recordChecklistRun(nowMs: number = Date.now()): void {
  const recent = getChecklistRuns(nowMs);
  recent.push(nowMs);
  writeArray(CHECKLIST_RUNS_KEY, recent);
}

/** Test/diagnostic helper — wipes the counter (used by More-tab "Reset
 *  paywall counters" button in debug builds). */
export function resetChecklistRuns(): void {
  storage.remove(CHECKLIST_RUNS_KEY);
}

// ---------------------------------------------------------------------------
// Review replies (30-day rolling window)
// ---------------------------------------------------------------------------

/** Returns the list of review replies in the last 30 days. */
export function getReviewReplies(nowMs: number = Date.now()): number[] {
  const all = readArray(REVIEW_REPLIES_KEY);
  const cutoff = nowMs - MONTH_MS;
  return all.filter((t) => t >= cutoff);
}

/** Records a successful review reply RIGHT NOW (caller invokes after
 *  the POST to ASC succeeds; failed replies don't count). */
export function recordReviewReply(nowMs: number = Date.now()): void {
  const recent = getReviewReplies(nowMs);
  recent.push(nowMs);
  writeArray(REVIEW_REPLIES_KEY, recent);
}

/** Test/diagnostic helper — wipes the counter. */
export function resetReviewReplies(): void {
  storage.remove(REVIEW_REPLIES_KEY);
}
