import Constants from 'expo-constants';

/**
 * HTTP client for the Release Pilot worker (`worker/` package).
 *
 * The worker URL is config — staging vs prod — read from `expo-constants`
 * extras. Set per-environment via `eas.json`'s `env` block or via
 * `.env.local` for dev. Falls back to a placeholder so the app still
 * loads in early Phase 6 before the worker is deployed.
 */

const DEFAULT_WORKER_URL = 'https://release-pilot.workers.dev';

function workerBaseUrl(): string {
  const fromExtras = (Constants.expoConfig?.extra as { workerUrl?: string } | undefined)
    ?.workerUrl;
  return fromExtras ?? DEFAULT_WORKER_URL;
}

export type RegisterArgs = {
  deviceToken: string;
  issuerId: string;
  keyId: string;
  p8PEM: string;
};

export type WorkerResponse<T> =
  | { ok: true; data: T }
  | { ok: false; reason: 'network' | 'http' | 'bad_request' | 'server'; status?: number; message?: string };

async function post<T>(path: string, body: unknown): Promise<WorkerResponse<T>> {
  let response: Response;
  try {
    response = await fetch(`${workerBaseUrl()}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, reason: 'network', message: e instanceof Error ? e.message : 'fetch failed' };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // OK to fall through — some endpoints return empty
  }

  if (response.ok) {
    return { ok: true, data: (payload ?? {}) as T };
  }
  if (response.status === 400) {
    return {
      ok: false,
      reason: 'bad_request',
      status: 400,
      message: (payload as { message?: string } | null)?.message ?? 'bad request',
    };
  }
  if (response.status >= 500) {
    return { ok: false, reason: 'server', status: response.status };
  }
  return { ok: false, reason: 'http', status: response.status };
}

export const WorkerClient = {
  baseUrl: workerBaseUrl,

  async health(): Promise<boolean> {
    try {
      const response = await fetch(`${workerBaseUrl()}/health`);
      return response.ok;
    } catch {
      return false;
    }
  },

  async register(args: RegisterArgs): Promise<WorkerResponse<{ registered: boolean }>> {
    return post('/v1/register', args);
  },

  async unregister(args: { deviceToken: string; issuerId?: string }): Promise<WorkerResponse<{ deleted: number }>> {
    return post('/v1/unregister', args);
  },

  async refresh(args: { deviceToken: string }): Promise<
    WorkerResponse<{ polled: number; pushed?: number; errors?: number; skipped?: string; retryAfter?: number }>
  > {
    return post('/v1/refresh', args);
  },
};
