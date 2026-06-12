/**
 * Pure-function validators for App Store Connect credential fields.
 *
 * Isolated from `credentials.ts` (which depends on `expo-secure-store`)
 * so that these can be unit-tested in a plain Node/tsx environment
 * without pulling in React Native shims.
 *
 * Used by:
 *  - The paste form (live validation as user types)
 *  - The verify-and-persist step (sanity check before API call)
 */

export function isValidIssuerId(s: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(s.trim());
}

export function isValidKeyId(s: string): boolean {
  return /^[A-Z0-9]{10}$/.test(s.trim());
}

export function isValidP8PEM(s: string): boolean {
  const trimmed = s.trim();
  if (!trimmed.startsWith('-----BEGIN PRIVATE KEY-----')) return false;
  if (!trimmed.endsWith('-----END PRIVATE KEY-----')) return false;
  const body = trimmed
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  return body.length > 32 && /^[A-Za-z0-9+/=]+$/.test(body);
}

export function validationMessage(field: 'issuerId' | 'keyId' | 'p8', value: string): string | null {
  const v = value.trim();
  if (v.length === 0) return null;
  if (field === 'issuerId') return isValidIssuerId(v) ? null : 'Should look like a GUID (8-4-4-4-12 hex)';
  if (field === 'keyId') return isValidKeyId(v) ? null : 'Should be 10 uppercase letters or digits';
  if (field === 'p8') return isValidP8PEM(v) ? null : 'Should start with "-----BEGIN PRIVATE KEY-----" and end with the END marker';
  return null;
}
