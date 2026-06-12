import type { SemanticState } from '@/constants/state-tokens';
import { storage } from './storage';

/**
 * Bookkeeping for in-flight Live Activities + last-observed semantic
 * states (per app).
 *
 * Persisted in MMKV because:
 *  - Synchronous reads/writes are fine on the JS thread for tiny payloads
 *  - We need this to survive force-quit so we don't accidentally start a
 *    second Live Activity for the same app on app relaunch
 *  - It's NOT secret — no need for Keychain overhead
 *
 * Two storage keys:
 *  - `live-activity.records.v1` → Record<appAscId, ActiveActivityRecord>
 *  - `live-activity.last-state.v1` → Record<appAscId, SemanticState>
 *
 * The "last state" lives separately so we can detect transitions on apps
 * that have never had an LA (e.g. drafting → submitted needs to know the
 * previous "drafting" was observed).
 */

export type ActiveActivityRecord = {
  /** iOS-side ActivityKit id returned by `Activity.request(...).id`. */
  activityId: string;
  /** Semantic state when we last started or updated this activity. */
  lastState: SemanticState;
  /** ASC version + build at the time we started — used to detect when
   *  a NEW version arrives (which should end the old activity and
   *  start a fresh one rather than update). */
  versionString: string;
  buildNumber: string | null;
  /** Epoch ms when we last touched this activity. */
  updatedAtMs: number;
};

const RECORDS_KEY    = 'live-activity.records.v1';
const LAST_STATE_KEY = 'live-activity.last-state.v1';

// ---------- Active activity records ----------------------------------------

function readRecords(): Record<string, ActiveActivityRecord> {
  const raw = storage.getString(RECORDS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, ActiveActivityRecord>;
  } catch {
    return {};
  }
}

function writeRecords(records: Record<string, ActiveActivityRecord>): void {
  storage.set(RECORDS_KEY, JSON.stringify(records));
}

export function getActivityRecord(appAscId: string): ActiveActivityRecord | null {
  return readRecords()[appAscId] ?? null;
}

export function setActivityRecord(appAscId: string, record: ActiveActivityRecord): void {
  const all = readRecords();
  all[appAscId] = record;
  writeRecords(all);
}

export function clearActivityRecord(appAscId: string): void {
  const all = readRecords();
  if (!(appAscId in all)) return;
  delete all[appAscId];
  writeRecords(all);
}

export function getAllActivityRecords(): Record<string, ActiveActivityRecord> {
  return readRecords();
}

// ---------- Last-observed semantic state -----------------------------------

function readLastStates(): Record<string, SemanticState> {
  const raw = storage.getString(LAST_STATE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, SemanticState>;
  } catch {
    return {};
  }
}

export function getLastObservedState(appAscId: string): SemanticState | null {
  return readLastStates()[appAscId] ?? null;
}

export function setLastObservedState(appAscId: string, state: SemanticState): void {
  const all = readLastStates();
  if (all[appAscId] === state) return;
  all[appAscId] = state;
  storage.set(LAST_STATE_KEY, JSON.stringify(all));
}
