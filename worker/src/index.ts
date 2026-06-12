import type { Env } from './lib/env';
import { handleHealth } from './handlers/health';
import { handleRegister } from './handlers/register';
import { handleUnregister } from './handlers/unregister';
import { handleRefresh } from './handlers/refresh';
import { notFound } from './handlers/http-utils';
import { runPollCycle } from './cron/poll-cycle';
import { listDevicesBatch } from './storage/repo';

/**
 * Worker entry point.
 *
 * Two surface areas:
 *  1. `fetch` — HTTP handler for /health + /v1/* endpoints (called by iOS app)
 *  2. `scheduled` — cron handler that polls ASC + sends pushes
 */

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health' && request.method === 'GET') {
      return handleHealth();
    }
    if (url.pathname === '/v1/register' && request.method === 'POST') {
      return handleRegister(request, env);
    }
    if (url.pathname === '/v1/unregister' && request.method === 'POST') {
      return handleUnregister(request, env);
    }
    if (url.pathname === '/v1/refresh' && request.method === 'POST') {
      return handleRefresh(request, env);
    }

    return notFound('unknown route');
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const batchSize = Math.max(1, Number(env.POLL_BATCH_SIZE) || 100);
    const devices = await listDevicesBatch({ db: env.DB, limit: batchSize });
    if (devices.length === 0) return;

    // waitUntil lets the cron return immediately while we keep working.
    // Cloudflare gives schedules ~30s of CPU, plenty for typical batches.
    ctx.waitUntil(
      (async () => {
        const result = await runPollCycle({ env, devices });
        console.log(`[cron] polled=${devices.length} pushed=${result.pushed} errors=${result.errors}`);
      })(),
    );
  },
} satisfies ExportedHandler<Env>;
