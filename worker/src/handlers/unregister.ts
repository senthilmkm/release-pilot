import type { Env } from '../lib/env';
import { deleteDevice } from '../storage/repo';
import { badReq, ok, readJson } from './http-utils';

/**
 * POST /v1/unregister
 *
 * Body: { deviceToken, issuerId? }
 *
 * Removes either:
 *  - All registrations for the given device token (omit issuerId), or
 *  - A specific (device, issuer) pair (pass issuerId).
 *
 * Called when:
 *  - The user disconnects an ASC account in the app
 *  - The user disables notifications
 *  - APNs returns 410 Gone for this device token (worker-initiated)
 */

type Body = { deviceToken: string; issuerId?: string };

export async function handleUnregister(req: Request, env: Env): Promise<Response> {
  const body = await readJson<Body>(req);
  if (!body || !body.deviceToken) return badReq('deviceToken is required');

  const deleted = await deleteDevice({
    db: env.DB,
    deviceToken: body.deviceToken,
    ...(body.issuerId ? { issuerId: body.issuerId } : {}),
  });

  return ok({ deleted });
}
