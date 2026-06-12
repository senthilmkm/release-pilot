/**
 * Tiny HTTP helpers. We don't pull a framework — the worker has only
 * ~5 endpoints and shipping less code = faster cold starts.
 */

export const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

export const ok        = (body: unknown) => json(body, { status: 200 });
export const badReq    = (message: string) => json({ error: 'bad_request', message }, { status: 400 });
export const notFound  = (message = 'not found') => json({ error: 'not_found', message }, { status: 404 });
export const serverErr = (message = 'internal') => json({ error: 'server_error', message }, { status: 500 });

export async function readJson<T = unknown>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

/** Crude bot/abuse heuristic: require a non-empty UA header. Cheap. */
export function looksLikeBot(req: Request): boolean {
  const ua = req.headers.get('user-agent') ?? '';
  return ua === '' || ua === 'unknown';
}
