import type { Env } from '../lib/env';
import { getApnsProviderJwt } from './jwt';
import {
  buildApnsHeaders,
  buildReleasePayload,
  type PushKind,
  type ReleasePushInput,
} from './payload';

/**
 * Thin wrapper around APNs's HTTP/2 send endpoint, callable from
 * Cloudflare Workers using `fetch` (Workers proxy HTTP/2 transparently).
 *
 * Returns a structured response so the caller can record success/failure
 * in `push_log` without needing to parse Apple's error JSON itself.
 */

export type ApnsSendResult = {
  status: number;
  reason: string | null;
  /** APNs-assigned unique id for the push attempt — useful for support. */
  apnsId: string | null;
};

export async function sendApns(args: {
  env: Env;
  deviceToken: string;
  kind: PushKind;
  input: ReleasePushInput;
}): Promise<ApnsSendResult> {
  const jwt = await getApnsProviderJwt({
    teamId: args.env.APNS_TEAM_ID,
    keyId: args.env.APNS_KEY_ID,
    p8PEM: args.env.APNS_KEY_P8,
  });

  const payload = buildReleasePayload({ kind: args.kind, input: args.input });
  const headers = buildApnsHeaders({
    jwt,
    bundleId: args.env.APNS_BUNDLE_ID,
    kind: args.kind,
    appId: args.input.ascAppId,
  });

  const url = `${args.env.APNS_HOST}/3/device/${args.deviceToken}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const apnsId = response.headers.get('apns-id');
  if (response.ok) {
    return { status: response.status, reason: null, apnsId };
  }

  // Apple returns JSON with `{ reason: "BadDeviceToken", ... }` on errors
  let reason: string | null = null;
  try {
    const json = (await response.json()) as { reason?: string };
    reason = json.reason ?? null;
  } catch {
    reason = await response.text().catch(() => null);
  }
  return { status: response.status, reason, apnsId };
}

/**
 * Classify an APNs failure to decide what to do with the device row.
 *  - "drop"   = the device token is permanently bad; delete the row
 *  - "retry"  = transient (rate-limited, server hiccup) — bump error counter
 *  - "ignore" = success or non-fatal info (we already handled it)
 */
export function classifyApnsFailure(result: ApnsSendResult): 'drop' | 'retry' | 'ignore' {
  if (result.status >= 200 && result.status < 300) return 'ignore';

  // These mean the device token is invalid forever
  // (uninstalled / regenerated / wrong env). Stop polling for it.
  if (result.status === 410) return 'drop';
  if (result.reason === 'BadDeviceToken') return 'drop';
  if (result.reason === 'Unregistered')   return 'drop';
  if (result.reason === 'DeviceTokenNotForTopic') return 'drop';

  // Auth problems — could be transient (clock skew) or permanent (key revoked)
  // Treat as retry, but the consecutive-errors counter will eventually drop
  // the row if it persists.
  return 'retry';
}
