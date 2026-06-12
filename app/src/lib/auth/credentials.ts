import * as SecureStore from 'expo-secure-store';

export {
  isValidIssuerId,
  isValidKeyId,
  isValidP8PEM,
  validationMessage,
} from './credentials-format';

/**
 * App Store Connect credential storage.
 *
 * Sensitive: the .p8 private key never leaves expo-secure-store. We never
 * cache it in JS heap longer than the JWT signing call (~ms).
 *
 *  - Issuer ID + Key ID + Team Name → stored in MMKV (non-sensitive, fast)
 *    via `accounts.ts` Zustand store
 *  - p8 PEM contents → expo-secure-store with biometric prompt on access
 *
 * Why expo-secure-store: it writes to Keychain on iOS with
 * `kSecAttrAccessibleWhenUnlocked`. Touch / Face ID gate via
 * `requireAuthentication: true` when needed.
 */

const KEY_PREFIX = 'asc.key.';

function pemKey(issuerId: string): string {
  return `${KEY_PREFIX}${issuerId}`;
}

export type StoreP8Args = {
  issuerId: string;
  p8PEM: string;
};

/**
 * Save the .p8 PEM for an Issuer ID.
 *
 * `requireAuthentication: true` prompts Face ID / Touch ID at READ time.
 * On WRITE we skip the prompt — user just authed via the app (paste form)
 * and re-prompting is friction. Apple-pattern apps work this way.
 */
export async function storeP8(args: StoreP8Args): Promise<void> {
  await SecureStore.setItemAsync(pemKey(args.issuerId), args.p8PEM, {
    requireAuthentication: false,
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

/**
 * Read the .p8 PEM for an Issuer ID. Triggers Face ID / Touch ID prompt.
 */
export async function loadP8(issuerId: string): Promise<string | null> {
  return SecureStore.getItemAsync(pemKey(issuerId), {
    requireAuthentication: true,
    authenticationPrompt:
      'Unlock to sign an App Store Connect request',
  });
}

/**
 * Remove credentials for an Issuer ID (e.g. when user disconnects a team).
 */
export async function deleteP8(issuerId: string): Promise<void> {
  await SecureStore.deleteItemAsync(pemKey(issuerId));
}
