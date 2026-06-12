/**
 * AES-GCM envelope around the user's ASC `.p8` private key.
 *
 * Trust model:
 *  - The encryption key is derived per-row via HKDF from a server-side
 *    master secret (`CREDS_MASTER_KEY_B64`, set via `wrangler secret put`)
 *    mixed with a 16-byte random salt stored alongside the ciphertext.
 *  - To decrypt one row you need (a) the master secret, AND (b) the row.
 *    A leaked D1 dump alone is not sufficient; a leaked master secret +
 *    a copy of the DB IS sufficient (be careful with `wrangler secret`).
 *  - Master rotation: bump `CREDS_MASTER_KEY_B64` to a new value AND
 *    re-encrypt every row (Phase 6.5 hook — not in MVP).
 *
 * Encoding:
 *  - All wire formats use base64 (NOT base64url) so they're URL-safe-ish
 *    but pasteable into D1 console for debugging.
 *  - IV is fixed at 12 bytes (NIST AES-GCM recommendation).
 *  - Salt is 16 bytes (HKDF default).
 */

export type EncryptedCreds = {
  /** AES-GCM ciphertext + 16-byte auth tag concatenated, base64. */
  ciphertextB64: string;
  /** 12-byte initialization vector, base64. */
  ivB64: string;
  /** 16-byte HKDF salt, base64. */
  saltB64: string;
};

const IV_BYTES   = 12;
const SALT_BYTES = 16;

/**
 * Encrypt `plaintext` (the .p8 PEM) using a key derived from the master
 * secret + a fresh random salt + a fresh random IV.
 */
export async function encryptCreds(args: {
  plaintext: string;
  masterKeyB64: string;
}): Promise<EncryptedCreds> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await deriveKey(args.masterKeyB64, salt);

  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(args.plaintext),
  );

  return {
    ciphertextB64: bytesToB64(new Uint8Array(ct)),
    ivB64:         bytesToB64(iv),
    saltB64:       bytesToB64(salt),
  };
}

/**
 * Decrypt a previously-encrypted blob. Throws if auth-tag validation
 * fails (any tamper attempt → decryption failure).
 */
export async function decryptCreds(args: {
  encrypted: EncryptedCreds;
  masterKeyB64: string;
}): Promise<string> {
  const iv   = b64ToBytes(args.encrypted.ivB64);
  const salt = b64ToBytes(args.encrypted.saltB64);
  const ct   = b64ToBytes(args.encrypted.ciphertextB64);
  const key  = await deriveKey(args.masterKeyB64, salt);

  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(pt);
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * HKDF derivation:
 *   ikm  = master secret bytes
 *   salt = per-row 16 random bytes (stored next to ciphertext)
 *   info = literal "release-pilot.creds.v1" — bump on schema change
 *   L    = 32 bytes (AES-256-GCM)
 */
async function deriveKey(masterKeyB64: string, salt: Uint8Array): Promise<CryptoKey> {
  const ikm = b64ToBytes(masterKeyB64);
  if (ikm.length !== 32) {
    throw new Error(`master key must be 32 bytes (256 bits); got ${ikm.length}`);
  }

  const baseKey = await crypto.subtle.importKey(
    'raw', ikm, 'HKDF', false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: new TextEncoder().encode('release-pilot.creds.v1'),
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Generate a fresh 32-byte master key. Use this once to mint your
 *  `CREDS_MASTER_KEY_B64` secret. */
export function generateMasterKeyB64(): string {
  return bytesToB64(crypto.getRandomValues(new Uint8Array(32)));
}
