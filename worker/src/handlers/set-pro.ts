import type { Env } from '../lib/env';
import { setDeviceIsPro } from '../storage/repo';
import { badReq, ok, readJson, serverErr } from './http-utils';

/**
 * POST /v1/set-pro
 *
 * Body: { deviceToken: string, isPro: boolean }
 *
 * Lightweight isPro flip used by the iOS subscription-lifecycle watcher
 * when the user upgrades to Pro or downgrades to free. Unlike /v1/register
 * this does NOT require .p8 PEM (so no Face ID prompt on plan change) —
 * the deviceToken itself is treated as the authenticator: only the device
 * holding that APNs token could have learned it from iOS.
 *
 * Updates EVERY row for the given device_token (i.e. all ASC accounts
 * registered from this device). Returns the number of rows touched.
 *
 * Idempotent: safe to call on every app launch with the current value.
 */

type Body = {
  deviceToken: string;
  isPro: boolean;
};

const HEX_TOKEN_RE = /^[0-9a-fA-F]{40,200}$/;

export async function handleSetPro(req: Request, env: Env): Promise<Response> {
  const body = await readJson<Body>(req);
  if (!body) return badReq('missing or invalid JSON body');

  if (!body.deviceToken || !HEX_TOKEN_RE.test(body.deviceToken)) {
    return badReq('deviceToken is not a valid hex APNs token');
  }
  if (typeof body.isPro !== 'boolean') {
    return badReq('isPro must be a boolean');
  }

  try {
    const changed = await setDeviceIsPro({
      db: env.DB,
      deviceToken: body.deviceToken,
      isPro: body.isPro,
    });
    return ok({ updated: changed, isPro: body.isPro });
  } catch (e) {
    return serverErr(e instanceof Error ? e.message : 'unknown');
  }
}
