import { signAppStoreConnectJwt } from 'asc-jwt';

import { ASCError } from '@/lib/api/asc-errors';

/**
 * In-memory JWT cache.
 *
 * Apple JWTs are valid up to 20 minutes. We mint with an 18-minute TTL
 * and cache for 17 minutes; any time we're within 1 minute of expiration
 * we mint a new one.
 *
 * The cache is keyed by Issuer ID, so multiple Apple Developer teams
 * each get their own token.
 *
 * Performance / UX consequence:
 *   `getJwt(...)` takes a *lazy* credentials provider. We only call the
 *   provider (which on the hot path does a Keychain read + Face ID prompt)
 *   when there's a cache miss. This means the user authenticates with
 *   Face ID at most every ~17 minutes, not on every API call.
 */

type CachedToken = {
  jwt: string;
  expiresAt: number;
};

const cache = new Map<string, CachedToken>();
const TTL_SECONDS = 18 * 60;
const SAFETY_WINDOW_MS = 60 * 1000;

export type JwtCredentials = {
  issuerId: string;
  keyId: string;
  p8PEM: string;
};

/**
 * Direct mint-and-cache (used by the verify flow, where we already have
 * fresh-from-paste credentials in memory).
 */
export async function mintJwt(creds: JwtCredentials): Promise<string> {
  const now = Date.now();
  let jwt: string;
  try {
    jwt = await signAppStoreConnectJwt({
      keyId: creds.keyId,
      issuerId: creds.issuerId,
      p8PEM: creds.p8PEM,
      ttlSeconds: TTL_SECONDS,
    });
  } catch (e) {
    throw new ASCError('jwt_signing_failed', {
      detail: e instanceof Error ? e.message : String(e),
      cause: e,
    });
  }
  cache.set(creds.issuerId, {
    jwt,
    expiresAt: now + TTL_SECONDS * 1000,
  });
  return jwt;
}

/**
 * Lazy variant: only loads credentials (triggering Face ID) when there's
 * a cache miss. Used by query hooks on the hot path.
 */
export async function getJwtLazy(args: {
  issuerId: string;
  loadCredentials: () => Promise<JwtCredentials>;
}): Promise<string> {
  const now = Date.now();
  const cached = cache.get(args.issuerId);
  if (cached && cached.expiresAt - now > SAFETY_WINDOW_MS) {
    return cached.jwt;
  }
  const creds = await args.loadCredentials();
  return mintJwt(creds);
}

export function clearJwt(issuerId: string): void {
  cache.delete(issuerId);
}

export function clearAllJwts(): void {
  cache.clear();
}

/** Test-only: inspect whether a JWT is currently cached for an issuer. */
export function hasFreshJwt(issuerId: string): boolean {
  const cached = cache.get(issuerId);
  if (!cached) return false;
  return cached.expiresAt - Date.now() > SAFETY_WINDOW_MS;
}
