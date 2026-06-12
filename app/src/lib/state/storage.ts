import { createMMKV } from 'react-native-mmkv';

/**
 * Single shared MMKV instance. Synchronous, fast, encrypted.
 *
 * Usage:
 *   storage.set('key', 'value')
 *   storage.getString('key')
 *
 * For sensitive data (ASC API keys) DO NOT use this — use expo-secure-store
 * which writes to Keychain with biometric protection.
 */
export const storage = createMMKV({ id: 'release-pilot.app' });
