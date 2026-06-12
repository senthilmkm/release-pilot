/**
 * Generic ES256 (ECDSA P-256, SHA-256) JWT signer using Web Crypto.
 *
 * Works in Cloudflare Workers AND Node 20+ (both expose `crypto.subtle`).
 * Used by both APNs (here) and the ASC poller (shared spec across the
 * worker — kept in a sibling module so each call site stays focused).
 *
 * Differences vs the iOS-side asc-jwt module:
 *  - No CryptoKit; Web Crypto's PKCS#8 import does the lifting
 *  - Signature is the raw 64-byte (r||s) form, which APNs + ASC both
 *    accept (it's actually the JOSE-mandated encoding)
 */

export type JwtHeader = {
  alg: 'ES256';
  kid: string;
  typ: 'JWT';
};

export type JwtPayload = Record<string, string | number | boolean>;

export async function signEs256Jwt(args: {
  header: JwtHeader;
  payload: JwtPayload;
  p8PEM: string;
}): Promise<string> {
  const headerB64  = b64urlEncodeJson(args.header);
  const payloadB64 = b64urlEncodeJson(args.payload);
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await importP256PrivateKey(args.p8PEM);
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${b64urlEncodeBytes(new Uint8Array(sig))}`;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function importP256PrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  const der = b64ToBytes(body);
  return crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

function b64urlEncodeJson(obj: unknown): string {
  return b64urlEncodeBytes(new TextEncoder().encode(JSON.stringify(obj)));
}

function b64urlEncodeBytes(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
