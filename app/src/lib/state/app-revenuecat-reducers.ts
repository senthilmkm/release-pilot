/**
 * Pure reducer functions + types for the per-app RevenueCat store.
 *
 * Lives in its own file (no react-native deps) so the test runner can
 * import it under node/tsx without crashing on `react-native-mmkv` →
 * `react-native` side-effects.
 *
 * The zustand store in `app-revenuecat.ts` is a thin wrapper that calls
 * these reducers. New behavior added to the store SHOULD live as a
 * reducer here first, then get a one-line set() call in the wrapper.
 */

export type AppRevenueCatMeta = {
  ascAppId: string;
  projectId: string;
  /** True iff a secret key was successfully verified at least once. */
  verified: boolean;
  /** Last successful `/metrics/overview` verification (epoch ms). */
  lastVerifiedAtMs: number | null;
  /** RC's reporting currency (e.g. "USD"). Cached for UI formatting. */
  currency: string;
  /** When the user first wired up RC for this app (epoch ms). */
  connectedAtMs: number;
};

export type AppRevenueCatMap = Record<string, AppRevenueCatMeta>;

export const reducers = {
  upsert(state: AppRevenueCatMap, meta: AppRevenueCatMeta): AppRevenueCatMap {
    return { ...state, [meta.ascAppId]: meta };
  },
  markVerified(
    state: AppRevenueCatMap,
    ascAppId: string,
    verifiedAtMs: number,
    currency: string,
  ): AppRevenueCatMap {
    const existing = state[ascAppId];
    if (!existing) return state;
    return {
      ...state,
      [ascAppId]: {
        ...existing,
        verified: true,
        lastVerifiedAtMs: verifiedAtMs,
        currency,
      },
    };
  },
  remove(state: AppRevenueCatMap, ascAppId: string): AppRevenueCatMap {
    if (!state[ascAppId]) return state;
    const { [ascAppId]: _removed, ...rest } = state;
    void _removed; // intentional discard — the rest spread is the result
    return rest;
  },
};
