import { useMemo } from 'react';

import { useEntitlement } from './use-entitlement';
import { useAllAppsQuery } from '@/lib/api/asc-queries';
import {
  getFreeAppAscId,
  isAppLockedForFree,
} from '@/lib/subscription/free-app';

/**
 * The single source-of-truth for "which app does this free user get for
 * free, and is this specific app locked behind the paywall?"
 *
 * Returns:
 *  - `freeAppAscId` — the `ascId` of the alphabetically-first app, or
 *    `null` if the user has no apps. Pro users see this too, but they
 *    shouldn't gate on it.
 *  - `isLocked(ascId)` — convenience predicate. Always `false` for Pro.
 *  - `isPro` — passthrough, so callers don't need a second hook
 *
 * Why this hook exists: every screen that surfaces a list of apps needs
 * to mark some of them "PRO" and gate taps. Doing the alphabetical sort
 * + comparison inline at each call site invites drift. Centralized here.
 */
export function useFreeApp(): {
  freeAppAscId: string | null;
  isLocked: (ascId: string) => boolean;
  isPro: boolean;
} {
  const { isPro } = useEntitlement();
  const appsQuery = useAllAppsQuery();
  const apps = appsQuery.data?.apps ?? [];

  const freeAppAscId = useMemo(() => getFreeAppAscId(apps), [apps]);

  const isLocked = useMemo(() => {
    return (ascId: string) =>
      isAppLockedForFree({ apps, ascId, isPro });
  }, [apps, isPro]);

  return { freeAppAscId, isLocked, isPro };
}
