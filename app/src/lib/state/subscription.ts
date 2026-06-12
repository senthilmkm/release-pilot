import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import type { EntitlementStatus, PaywallOffering } from '@/lib/subscription/types';
import { storage } from './storage';

/**
 * Reactive subscription store.
 *
 * The RC SDK writes through `subscription/init.ts → applyCustomerInfo`
 * (NOT this file directly) so the UI gets re-rendered the moment the
 * customer info changes (purchase / restore / billing).
 *
 * Two pieces persist via MMKV so the UI doesn't flash "free" on a cold
 * start while RC reaches the network:
 *   - `entitlement`  → last-known status
 *   - `offering`     → last-known plans (so the paywall renders prices
 *                      immediately even offline)
 *
 * `status` does NOT persist — it always starts at `loading` and the
 * init task pushes it forward.
 */

export type SubscriptionLifecycle =
  | 'loading'        // initial state; RC not yet configured
  | 'unconfigured'   // app.json doesn't have a RC key (dev / preview)
  | 'ready'          // RC configured + first sync done
  | 'error';         // network failure on first sync — UI shows degraded mode

const FREE_STATUS: EntitlementStatus = {
  isPro: false,
  isInTrial: false,
  tier: 'free',
  activeProductId: null,
  expiresAtMs: null,
  isInGracePeriod: false,
  originalAppVersion: null,
};

type SubscriptionState = {
  status: SubscriptionLifecycle;
  entitlement: EntitlementStatus;
  offering: PaywallOffering | null;
  /** Wall-clock ms when the store was last populated from a
   *  successful RC fetch. `null` until the first sync completes. Used
   *  by the More tab to render "Synced 12s ago" so users can tell at
   *  a glance whether they're looking at stale data. Persisted so the
   *  indicator survives cold starts. */
  lastSyncedAtMs: number | null;
};

const INITIAL_STATE: SubscriptionState = {
  status: 'loading',
  entitlement: FREE_STATUS,
  offering: null,
  lastSyncedAtMs: null,
};

export const useSubscriptionStore = create<SubscriptionState>()(
  persist(
    () => INITIAL_STATE,
    {
      name: 'subscription.v1',
      storage: createJSONStorage(() => ({
        getItem: (name) => storage.getString(name) ?? null,
        setItem: (name, value) => storage.set(name, value),
        removeItem: (name) => storage.remove(name),
      })),
      partialize: (s) => ({
        entitlement: s.entitlement,
        offering: s.offering,
        lastSyncedAtMs: s.lastSyncedAtMs,
      }),
    },
  ),
);
