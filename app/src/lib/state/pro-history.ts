import { storage } from './storage';

/**
 * Tracks when the user was last seen as Pro, so the widget can render
 * a "Renew Pro" headline for recently-lapsed users without nagging
 * forever.
 *
 * Why a separate file: this is read by `derive-widget-pro-status.ts`
 * (pure), called from `useNativeSurfaceSync` (RN side), and tested
 * via the buildSharedState tests. Keeping the MMKV key isolated avoids
 * dragging the storage import into a pure file.
 */

const LAST_PRO_MS_KEY = 'subscription.last-seen-pro-ms.v1';

/** Stamp "the user is Pro right now". Idempotent — safe to call every
 *  render even if they were already Pro. */
export function markProSeen(nowMs: number = Date.now()): void {
  storage.set(LAST_PRO_MS_KEY, nowMs);
}

/** Returns the epoch ms when we last saw the user as Pro, or `null` if
 *  they've never been Pro on this install. */
export function getLastProMs(): number | null {
  const raw = storage.getNumber(LAST_PRO_MS_KEY);
  return raw === undefined ? null : raw;
}

/** Test/diagnostic helper — wipes the counter. */
export function resetProHistory(): void {
  storage.remove(LAST_PRO_MS_KEY);
}
