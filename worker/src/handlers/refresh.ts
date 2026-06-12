import type { Env } from '../lib/env';
import { listDevicesBatch } from '../storage/repo';
import { runPollCycle } from '../cron/poll-cycle';
import { badReq, ok, readJson } from './http-utils';

/**
 * POST /v1/refresh
 *
 * Body: { deviceToken }
 *
 * Manually triggers the polling logic for ALL issuers registered to
 * this device. Used by the iOS pull-to-refresh — gives users the
 * power to "check now" without waiting for the next cron tick.
 *
 * Rate-limited to prevent abuse: at most one refresh per 60 seconds
 * per device token. Anti-flood, not anti-abuse — the deviceToken is
 * a weak credential.
 */

type Body = { deviceToken: string };

const REFRESH_COOLDOWN_SEC = 60;
const refreshTimestamps = new Map<string, number>();

export async function handleRefresh(req: Request, env: Env): Promise<Response> {
  const body = await readJson<Body>(req);
  if (!body || !body.deviceToken) return badReq('deviceToken is required');

  const nowSec = Math.floor(Date.now() / 1000);
  const last = refreshTimestamps.get(body.deviceToken) ?? 0;
  if (nowSec - last < REFRESH_COOLDOWN_SEC) {
    return ok({ skipped: 'cooldown', retryAfter: REFRESH_COOLDOWN_SEC - (nowSec - last) });
  }
  refreshTimestamps.set(body.deviceToken, nowSec);

  // Find devices to poll. There's at most a handful of rows per token
  // (one per ASC account), so the batch limit is generous.
  const all = await listDevicesBatch({ db: env.DB, limit: 100 });
  const mine = all.filter((d) => d.deviceToken === body.deviceToken);

  if (mine.length === 0) {
    return ok({ skipped: 'unknown_device', polled: 0 });
  }

  const result = await runPollCycle({ env, devices: mine });
  return ok({ polled: mine.length, pushed: result.pushed, errors: result.errors });
}
