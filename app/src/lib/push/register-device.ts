import { loadP8 } from '@/lib/auth/credentials';
import { useAccountsStore } from '@/lib/state/accounts';
import { usePushRegistrationStore } from '@/lib/state/push-registration';
import { WorkerClient } from './worker-client';

/**
 * Orchestrates registering THIS device's APNs token with the worker
 * for every connected ASC account.
 *
 * Idempotent: skips pairs we've already registered (unless `force: true`).
 *
 * Triggers a Face ID prompt PER ACCOUNT because we need to read the
 * .p8 from Keychain. That's acceptable as a one-off action; we don't
 * call this on every app launch.
 */

export type RegisterAllResult = {
  attempted: number;
  registered: number;
  skipped: number;
  failures: { issuerId: string; reason: string }[];
};

export async function registerDeviceWithWorker(args: {
  deviceToken: string;
  /** If true, re-register even pairs we believe are already up-to-date.
   *  Used when the user manually taps "Re-sync" or rotates a key. */
  force?: boolean;
}): Promise<RegisterAllResult> {
  const accounts = useAccountsStore.getState().accounts;
  const reg = usePushRegistrationStore.getState();

  const result: RegisterAllResult = {
    attempted: 0,
    registered: 0,
    skipped: 0,
    failures: [],
  };

  reg.setDeviceToken(args.deviceToken);

  for (const account of accounts) {
    const k = `${account.issuerId}|${args.deviceToken}`;
    if (!args.force && reg.registrations[k]) {
      result.skipped += 1;
      continue;
    }

    result.attempted += 1;
    try {
      const p8 = await loadP8(account.issuerId);
      if (!p8) {
        result.failures.push({ issuerId: account.issuerId, reason: 'no-credentials' });
        continue;
      }

      const response = await WorkerClient.register({
        deviceToken: args.deviceToken,
        issuerId: account.issuerId,
        keyId: account.keyId,
        p8PEM: p8,
      });

      if (response.ok) {
        reg.recordRegistration({
          deviceToken: args.deviceToken,
          issuerId: account.issuerId,
          registeredAtMs: Date.now(),
        });
        result.registered += 1;
      } else {
        result.failures.push({
          issuerId: account.issuerId,
          reason: response.reason + (response.status ? ` (${response.status})` : ''),
        });
      }
    } catch (e) {
      result.failures.push({
        issuerId: account.issuerId,
        reason: e instanceof Error ? e.message : 'unknown',
      });
    }
  }

  return result;
}

/**
 * Unregister a single ASC account with the worker (called when the
 * user disconnects an account in the More tab).
 */
export async function unregisterAccount(args: { issuerId: string }): Promise<boolean> {
  const deviceToken = usePushRegistrationStore.getState().deviceToken;
  if (!deviceToken) return true; // nothing to do

  const response = await WorkerClient.unregister({
    deviceToken,
    issuerId: args.issuerId,
  });

  usePushRegistrationStore.getState().forgetIssuer(args.issuerId);
  return response.ok;
}
