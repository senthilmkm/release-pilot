import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import {
  reducers,
  type AppRevenueCatMap,
  type AppRevenueCatMeta,
} from './app-revenuecat-reducers';
import { storage } from './storage';

/**
 * Per-ASC-app RevenueCat metadata store.
 *
 * Keyed by ASC app `id` (e.g. "6446901999"), NOT bundle ID — see header
 * note in `revenuecat-credentials.ts` for the rationale.
 *
 * The secret API key lives in expo-secure-store. This store only carries
 * safe metadata for routing + UI:
 *   - is this app's RC wired up?
 *   - when did we last verify the key?
 *   - what currency to format MRR in?
 *
 * Pure state transitions live in `app-revenuecat-reducers.ts` so they're
 * unit-testable without pulling MMKV/RN into a node test.
 */

export type { AppRevenueCatMeta, AppRevenueCatMap };

type AppRevenueCatState = {
  byAscAppId: AppRevenueCatMap;
  upsert: (meta: AppRevenueCatMeta) => void;
  markVerified: (ascAppId: string, verifiedAtMs: number, currency: string) => void;
  remove: (ascAppId: string) => void;
};

export const useAppRevenueCatStore = create<AppRevenueCatState>()(
  persist(
    (set) => ({
      byAscAppId: {},
      upsert: (meta) =>
        set((s) => ({ byAscAppId: reducers.upsert(s.byAscAppId, meta) })),
      markVerified: (ascAppId, verifiedAtMs, currency) =>
        set((s) => ({
          byAscAppId: reducers.markVerified(s.byAscAppId, ascAppId, verifiedAtMs, currency),
        })),
      remove: (ascAppId) =>
        set((s) => ({ byAscAppId: reducers.remove(s.byAscAppId, ascAppId) })),
    }),
    {
      name: 'app-revenuecat',
      storage: createJSONStorage(() => ({
        getItem: (name) => storage.getString(name) ?? null,
        setItem: (name, value) => storage.set(name, value),
        removeItem: (name) => {
          storage.remove(name);
        },
      })),
    },
  ),
);

/** Fast synchronous lookup for "does this app have RC connected?" badges. */
export function useIsRevenueCatConnected(ascAppId: string): boolean {
  return useAppRevenueCatStore((s) => Boolean(s.byAscAppId[ascAppId]?.verified));
}

/** Count of apps with RC connected. Used by More tab + briefing visibility. */
export function useConnectedRevenueCatCount(): number {
  return useAppRevenueCatStore(
    (s) => Object.values(s.byAscAppId).filter((m) => m.verified).length,
  );
}
