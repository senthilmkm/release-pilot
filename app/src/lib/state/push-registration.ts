import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { storage } from './storage';

/**
 * Tracks which (deviceToken, issuerId) pairs we've registered with the
 * Release Pilot worker, so we don't spam `/v1/register` on every launch.
 *
 * The store is persisted in MMKV — survives force-quit, doesn't survive
 * reinstall (which is exactly the semantics we want: a reinstall yields
 * a fresh APNs device token, so the old worker rows are dead anyway and
 * APNs will return 410 next time the worker tries to use them).
 */

export type RegistrationRecord = {
  deviceToken: string;
  issuerId: string;
  /** Epoch ms when we last successfully called /v1/register for this pair. */
  registeredAtMs: number;
  /** Epoch ms of the last successful `/v1/refresh` (or worker-side push). */
  lastSyncAtMs: number | null;
};

type State = {
  /** Most recent APNs device token we got from iOS. Null until permission grant. */
  deviceToken: string | null;
  /** Registrations the worker knows about. Keyed by `${issuerId}|${deviceToken}`. */
  registrations: Record<string, RegistrationRecord>;
  setDeviceToken: (token: string | null) => void;
  recordRegistration: (record: Omit<RegistrationRecord, 'lastSyncAtMs'>) => void;
  recordSync: (issuerId: string, nowMs: number) => void;
  forgetIssuer: (issuerId: string) => void;
  forgetAll: () => void;
};

function key(issuerId: string, deviceToken: string): string {
  return `${issuerId}|${deviceToken}`;
}

export const usePushRegistrationStore = create<State>()(
  persist(
    (set) => ({
      deviceToken: null,
      registrations: {},

      setDeviceToken: (token) => set({ deviceToken: token }),

      recordRegistration: (record) =>
        set((s) => ({
          registrations: {
            ...s.registrations,
            [key(record.issuerId, record.deviceToken)]: {
              ...record,
              lastSyncAtMs: null,
            },
          },
        })),

      recordSync: (issuerId, nowMs) =>
        set((s) => {
          const updated: Record<string, RegistrationRecord> = { ...s.registrations };
          for (const [k, v] of Object.entries(updated)) {
            if (v.issuerId === issuerId) updated[k] = { ...v, lastSyncAtMs: nowMs };
          }
          return { registrations: updated };
        }),

      forgetIssuer: (issuerId) =>
        set((s) => {
          const filtered: Record<string, RegistrationRecord> = {};
          for (const [k, v] of Object.entries(s.registrations)) {
            if (v.issuerId !== issuerId) filtered[k] = v;
          }
          return { registrations: filtered };
        }),

      forgetAll: () => set({ registrations: {} }),
    }),
    {
      name: 'push-registration',
      storage: createJSONStorage(() => ({
        getItem: (n) => storage.getString(n) ?? null,
        setItem: (n, v) => storage.set(n, v),
        removeItem: (n) => { storage.remove(n); },
      })),
    },
  ),
);

/** Checks if a given (issuerId, deviceToken) pair is already registered. */
export function isRegistered(issuerId: string, deviceToken: string): boolean {
  return usePushRegistrationStore.getState().registrations[key(issuerId, deviceToken)] !== undefined;
}
