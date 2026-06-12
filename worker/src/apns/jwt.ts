/**
 * APNs provider JWT — ES256, same algorithm as ASC but different
 * audience/claims.
 *
 * Per Apple's docs (Setting Up a Connection to APNs Providers):
 *   header  = { alg: "ES256", kid: <APNS_KEY_ID> }
 *   payload = { iss: <APNS_TEAM_ID>, iat: <unix-seconds> }
 *
 * Tokens are valid for 60 minutes; we cache and refresh at the 30-min
 * mark to stay well under Apple's 1-hour ceiling and avoid 403
 * ExpiredProviderToken errors in flight.
 */

import { signEs256Jwt } from './ec-sign';

type CachedToken = { token: string; expiresAtMs: number };

let cached: CachedToken | null = null;

const REFRESH_AT_AGE_MS = 30 * 60 * 1000;

export async function getApnsProviderJwt(args: {
  teamId: string;
  keyId: string;
  p8PEM: string;
  /** Optional clock injection for tests. */
  nowMs?: () => number;
}): Promise<string> {
  const now = (args.nowMs ?? Date.now)();
  if (cached && cached.expiresAtMs > now) {
    return cached.token;
  }

  const iatSeconds = Math.floor(now / 1000);
  const token = await signEs256Jwt({
    header: { alg: 'ES256', kid: args.keyId, typ: 'JWT' },
    payload: { iss: args.teamId, iat: iatSeconds },
    p8PEM: args.p8PEM,
  });

  cached = { token, expiresAtMs: now + REFRESH_AT_AGE_MS };
  return token;
}

/** Test-only: wipe the cached token so a subsequent call re-signs. */
export function clearApnsTokenCache(): void {
  cached = null;
}
