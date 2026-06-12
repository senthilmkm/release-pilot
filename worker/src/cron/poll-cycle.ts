import type { Env } from '../lib/env';
import type { DeviceRow } from '../storage/repo';
import { decryptCreds } from '../crypto/creds';
import { pollIssuerApps } from '../ascpoll/poll';
import {
  getKnownStates,
  insertPushLog,
  markDevicePolled,
  recentPushesForDevice,
  upsertKnownState,
} from '../storage/repo';
import {
  COOLDOWN_MS,
  decidePushOnStateChange,
  isDuplicate,
} from '../lib/push-diff';
import { classifyApnsFailure, sendApns } from '../apns/client';
import { buildReleasePayload } from '../apns/payload';
import { deleteDevice } from '../storage/repo';

/**
 * The heart of the worker: for each registered device, poll Apple,
 * diff against last-seen state, send pushes for changes.
 *
 * Runs every 15 minutes via cron AND on-demand via `/v1/refresh`.
 *
 * Concurrency: we run `POLL_CONCURRENCY` issuer polls in parallel.
 * Past that, Workers' fetch limits kick in and we'd just queue.
 */

export type PollCycleResult = {
  pushed: number;
  errors: number;
};

export async function runPollCycle(args: {
  env: Env;
  devices: DeviceRow[];
}): Promise<PollCycleResult> {
  const concurrency = Math.max(1, Number(args.env.POLL_CONCURRENCY) || 5);

  let pushed = 0;
  let errors = 0;

  // Chunk into groups of `concurrency`
  for (let i = 0; i < args.devices.length; i += concurrency) {
    const slice = args.devices.slice(i, i + concurrency);
    const results = await Promise.all(slice.map((device) => pollOneDevice(args.env, device)));
    for (const r of results) {
      pushed += r.pushed;
      errors += r.errors;
    }
  }

  return { pushed, errors };
}

// ---------------------------------------------------------------------------
// Per-device polling
// ---------------------------------------------------------------------------

async function pollOneDevice(env: Env, device: DeviceRow): Promise<{ pushed: number; errors: number }> {
  const nowMs = Date.now();
  const nowSec = Math.floor(nowMs / 1000);
  let pushed = 0;
  let errors = 0;

  let p8PEM: string;
  try {
    p8PEM = await decryptCreds({
      encrypted: device.p8,
      masterKeyB64: env.CREDS_MASTER_KEY_B64,
    });
  } catch {
    // Corrupted row — never recoverable. Drop it so we stop wasting
    // cron cycles on it.
    await deleteDevice({ db: env.DB, deviceToken: device.deviceToken, issuerId: device.issuerId });
    return { pushed: 0, errors: 1 };
  }

  let polled;
  try {
    polled = await pollIssuerApps({
      issuerId: device.issuerId,
      keyId: device.keyId,
      p8PEM,
    });
  } catch {
    await markDevicePolled({
      db: env.DB,
      deviceToken: device.deviceToken,
      issuerId: device.issuerId,
      nowSec,
      ok: false,
    });
    return { pushed: 0, errors: 1 };
  }

  const known = await getKnownStates({ db: env.DB, issuerId: device.issuerId });
  const recent = await recentPushesForDevice({
    db: env.DB,
    deviceToken: device.deviceToken,
    sinceSec: nowSec - Math.floor(COOLDOWN_MS / 1000),
  });

  for (const app of polled) {
    const previous = known.get(app.ascAppId)?.semanticState ?? null;
    const decision = decidePushOnStateChange({ previous, current: app.semanticState });

    // Always update known_states (even on noop) so the observed_at
    // column is accurate for diagnostics
    await upsertKnownState({
      db: env.DB,
      issuerId: device.issuerId,
      appId: app.ascAppId,
      appName: app.appName,
      bundleId: app.bundleId,
      semanticState: app.semanticState,
      rawState: app.rawState,
      versionString: app.versionString,
      buildNumber: app.buildNumber,
      nowSec,
    });

    if (decision.kind === 'skip') continue;

    if (isDuplicate({
      recent,
      candidate: { appId: app.ascAppId, newState: app.semanticState },
      nowMs,
    })) continue;

    const input = {
      appName: app.appName,
      versionString: app.versionString,
      buildNumber: app.buildNumber,
      previousState: previous,
      newState: app.semanticState,
      ascAppId: app.ascAppId,
      bundleId: app.bundleId,
    };
    const payload = buildReleasePayload({ kind: decision.push, input });

    const result = await sendApns({
      env,
      deviceToken: device.deviceToken,
      kind: decision.push,
      input,
    });

    await insertPushLog({
      db: env.DB,
      entry: {
        deviceToken: device.deviceToken,
        issuerId: device.issuerId,
        appId: app.ascAppId,
        previousState: previous,
        newState: app.semanticState,
        payloadJson: JSON.stringify(payload),
        apnsStatus: result.status,
        apnsReason: result.reason,
        sentAt: nowSec,
      },
    });

    if (result.status >= 200 && result.status < 300) {
      pushed += 1;
    } else {
      errors += 1;
      const fate = classifyApnsFailure(result);
      if (fate === 'drop') {
        // Token is permanently bad — wipe ALL rows for this device,
        // not just this (device, issuer) pair, since the token is dead.
        await deleteDevice({ db: env.DB, deviceToken: device.deviceToken });
        return { pushed, errors };
      }
    }
  }

  await markDevicePolled({
    db: env.DB,
    deviceToken: device.deviceToken,
    issuerId: device.issuerId,
    nowSec,
    ok: true,
  });

  return { pushed, errors };
}
