import type { Env } from '../lib/env';
import { encryptCreds } from '../crypto/creds';
import { upsertDevice } from '../storage/repo';
import { badReq, ok, readJson, serverErr } from './http-utils';

/**
 * POST /v1/register
 *
 * Body: { deviceToken, issuerId, keyId, p8PEM }
 *
 * Stores the device + its (encrypted) credentials. Idempotent — calling
 * twice with the same (deviceToken, issuerId) refreshes the row and
 * resets the consecutive-error counter.
 *
 * The iOS app calls this:
 *  - After onboarding completes successfully
 *  - When the APNs token rotates (iOS reassigns it occasionally)
 *  - When credentials are re-verified (key swap)
 */

type Body = {
  deviceToken: string;
  issuerId: string;
  keyId: string;
  p8PEM: string;
  /** Pro entitlement at the time of registration. Defaults to false if
   *  the client (e.g. an older version) doesn't send it — fail-closed:
   *  unknown subscription state = no pushes. */
  isPro?: boolean;
};

const HEX_TOKEN_RE   = /^[0-9a-fA-F]{40,200}$/;
const ISSUER_GUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const KEY_ID_RE      = /^[A-Z0-9]{10}$/;

export async function handleRegister(req: Request, env: Env): Promise<Response> {
  const body = await readJson<Body>(req);
  if (!body) return badReq('missing or invalid JSON body');

  if (!body.deviceToken || !HEX_TOKEN_RE.test(body.deviceToken)) {
    return badReq('deviceToken is not a valid hex APNs token');
  }
  if (!body.issuerId || !ISSUER_GUID_RE.test(body.issuerId)) {
    return badReq('issuerId is not a valid GUID');
  }
  if (!body.keyId || !KEY_ID_RE.test(body.keyId)) {
    return badReq('keyId must be 10 uppercase letters or digits');
  }
  if (!body.p8PEM || !body.p8PEM.includes('-----BEGIN PRIVATE KEY-----')) {
    return badReq('p8PEM must be a PKCS#8 PEM');
  }

  try {
    const encrypted = await encryptCreds({
      plaintext: body.p8PEM,
      masterKeyB64: env.CREDS_MASTER_KEY_B64,
    });

    await upsertDevice({
      db: env.DB,
      deviceToken: body.deviceToken,
      issuerId: body.issuerId,
      keyId: body.keyId,
      p8: encrypted,
      // Fail-closed: only set isPro=true if the client explicitly said so.
      // Older clients that don't send the field are treated as free.
      isPro: body.isPro === true,
      nowSec: Math.floor(Date.now() / 1000),
    });

    return ok({ registered: true, isPro: body.isPro === true });
  } catch (e) {
    return serverErr(e instanceof Error ? e.message : 'unknown');
  }
}
