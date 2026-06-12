import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { storage } from './storage';

/**
 * Account = an App Store Connect API key the user has connected.
 * We may have multiple (one per Apple Developer Team).
 *
 * The actual p8 private key never lives here — it's stored in
 * expo-secure-store (Keychain) under `asc.key.<issuerId>`. This store
 * only holds public metadata: issuerId, keyId, teamName, addedAt.
 */

export type AccountMeta = {
  issuerId: string;
  keyId: string;
  teamName: string;
  addedAt: number;
};

type AccountState = {
  accounts: AccountMeta[];
  addAccount: (account: AccountMeta) => void;
  removeAccount: (issuerId: string) => void;
};

export const useAccountsStore = create<AccountState>()(
  persist(
    (set) => ({
      accounts: [],
      addAccount: (account) =>
        set((s) => ({
          accounts: [
            ...s.accounts.filter((a) => a.issuerId !== account.issuerId),
            account,
          ],
        })),
      removeAccount: (issuerId) =>
        set((s) => ({
          accounts: s.accounts.filter((a) => a.issuerId !== issuerId),
        })),
    }),
    {
      name: 'accounts',
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

/** Fast synchronous read for routing decisions. */
export function useHasAnyAccount(): boolean {
  return useAccountsStore((s) => s.accounts.length > 0);
}
