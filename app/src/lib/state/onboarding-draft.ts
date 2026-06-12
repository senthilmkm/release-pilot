import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { storage } from './storage';

/**
 * Store for credentials being typed during onboarding.
 *
 * IMPORTANT — partial persistence policy:
 *
 *   - issuerId + keyId persist via MMKV so that if the user accidentally
 *     backgrounds the app mid-onboarding (e.g. to open ASC and copy a
 *     value), they don't have to re-type these GUIDs on return. These
 *     two fields are NOT sensitive (issuerId is publicly visible on
 *     Apple's Keys page; keyId is similarly visible).
 *   - p8PEM is NEVER persisted. The private key is the only sensitive
 *     credential and must only live in memory during onboarding. We rely
 *     on the user pasting it once and the verify-and-persist step
 *     immediately committing it to Keychain via expo-secure-store.
 *   - All fields are cleared on `reset()` once the verify step succeeds.
 */

type DraftState = {
  issuerId: string;
  keyId: string;
  p8PEM: string;
  setField: (field: 'issuerId' | 'keyId' | 'p8PEM', value: string) => void;
  reset: () => void;
};

export const useOnboardingDraft = create<DraftState>()(
  persist(
    (set) => ({
      issuerId: '',
      keyId: '',
      p8PEM: '',
      setField: (field, value) => set({ [field]: value } as Partial<DraftState>),
      reset: () => set({ issuerId: '', keyId: '', p8PEM: '' }),
    }),
    {
      name: 'onboarding-draft.v1',
      storage: createJSONStorage(() => ({
        getItem: (n) => storage.getString(n) ?? null,
        setItem: (n, v) => storage.set(n, v),
        removeItem: (n) => { storage.remove(n); },
      })),
      // CRITICAL: never persist the private key. Only the safe fields.
      partialize: (s) => ({ issuerId: s.issuerId, keyId: s.keyId }),
    },
  ),
);
