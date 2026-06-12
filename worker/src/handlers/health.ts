import { ok } from './http-utils';

/**
 * GET /health
 *
 * Public liveness check used by the iOS app to detect "worker is
 * down — fall back to local polling". Returns 200 + a tiny JSON
 * with the cron version baked in.
 */
export async function handleHealth(): Promise<Response> {
  return ok({
    status: 'ok',
    name: 'release-pilot-worker',
    version: 1,
    now: Math.floor(Date.now() / 1000),
  });
}
