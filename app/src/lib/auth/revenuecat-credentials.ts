import * as SecureStore from 'expo-secure-store';

/**
 * RevenueCat credential storage.
 *
 * Why per-app (not per-account): each app in App Store Connect maps to
 * its own RevenueCat project, even when all apps share a single Apple
 * Developer Team. We therefore key RC credentials by the ASC app `id`
 * (e.g. "1234567890"), NOT by issuer ID.
 *
 * Storage split (mirrors how ASC credentials are partitioned):
 *  - Non-secret metadata (projectId, lastVerifiedAtMs, currency hint)
 *    → MMKV via `app-revenuecat.ts` Zustand store
 *  - Secret API key (sk_xxx)
 *    → expo-secure-store → iOS Keychain (`kSecAttrAccessibleWhenUnlocked`)
 *
 * We do NOT require Face ID for read: the briefing screen polls this
 * every time it refreshes (3+ apps), and gating that behind biometrics
 * would mean a Face ID prompt every pull-to-refresh. Acceptable trade-off
 * because the secret key is per-app and read-scoped (charts only — no
 * subscriber mutation).
 */

const KEY_PREFIX = 'rc.secret.';

function secretKey(ascAppId: string): string {
  return `${KEY_PREFIX}${ascAppId}`;
}

export type StoreRevenueCatSecretArgs = {
  ascAppId: string;
  secretKey: string;
};

/**
 * Save the RevenueCat secret API key for a specific ASC app.
 * Stored in iOS Keychain; never written to MMKV or git.
 */
export async function storeRevenueCatSecret(
  args: StoreRevenueCatSecretArgs,
): Promise<void> {
  await SecureStore.setItemAsync(secretKey(args.ascAppId), args.secretKey, {
    requireAuthentication: false,
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

/**
 * Read the RevenueCat secret API key. Returns null if not stored.
 *
 * No biometric prompt (see file-header note).
 */
export async function loadRevenueCatSecret(ascAppId: string): Promise<string | null> {
  return SecureStore.getItemAsync(secretKey(ascAppId), {
    requireAuthentication: false,
  });
}

/**
 * Remove RevenueCat credentials for an app (e.g. user disconnects).
 * Safe to call even if no key is stored.
 */
export async function deleteRevenueCatSecret(ascAppId: string): Promise<void> {
  await SecureStore.deleteItemAsync(secretKey(ascAppId));
}
