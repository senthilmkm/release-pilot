/**
 * Helpers for the FREE-tier "1 app with full features" gate.
 *
 * The free tier gives the user full interaction with ONE app from their
 * App Store Connect portfolio. The chosen app is the **alphabetically
 * first** one by `name` (case-insensitive). Apps after that show a "PRO"
 * lock and tap-to-paywall.
 *
 * Why alphabetical (and not "first added" or "most recently active"):
 *  - Deterministic — same answer every render, no flicker
 *  - Stable — removing/re-adding an account doesn't shuffle the free app
 *  - Predictable for the user — "the one at the top of my list is free"
 *  - Equitable across multi-account setups — apps from all accounts are
 *    merged and sorted as one flat list
 *
 * Pro users are NEVER subject to this gate; all apps are accessible.
 * Callers should still skip these helpers when `isPro === true` for
 * clarity, but the helpers themselves don't know about subscription
 * state — that's the gate's job.
 */

type AppLike = {
  ascId: string;
  name: string;
};

/**
 * Sort apps alphabetically by name (case-insensitive, locale-aware).
 * Returns a NEW array; never mutates the input.
 */
export function sortAppsAlphabetically<T extends AppLike>(apps: readonly T[]): T[] {
  return [...apps].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  );
}

/**
 * The `ascId` of the alphabetically-first app — the one that's free
 * on the free tier. Returns `null` if the user has zero apps.
 */
export function getFreeAppAscId<T extends AppLike>(apps: readonly T[]): string | null {
  if (apps.length === 0) return null;
  const sorted = sortAppsAlphabetically(apps);
  return sorted[0]!.ascId;
}

/**
 * 0-based index of the given app within the alphabetically-sorted list.
 * Returns `-1` if the app isn't in the list (caller should treat that as
 * "deny" — we don't know about this app).
 */
export function getAppIndex<T extends AppLike>(
  apps: readonly T[],
  ascId: string,
): number {
  const sorted = sortAppsAlphabetically(apps);
  return sorted.findIndex((a) => a.ascId === ascId);
}

/**
 * Convenience: should this specific app be locked behind the paywall
 * for a free-tier user? Returns `false` for Pro users regardless.
 *
 * This is the only function callers need at the tap-handler boundary.
 */
export function isAppLockedForFree<T extends AppLike>(args: {
  apps: readonly T[];
  ascId: string;
  isPro: boolean;
}): boolean {
  if (args.isPro) return false;
  const freeId = getFreeAppAscId(args.apps);
  return freeId !== null && args.ascId !== freeId;
}
