import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { usePushRegistrationStore } from '@/lib/state/push-registration';
import { WorkerClient } from './worker-client';

/**
 * Background polling — the "what if push doesn't fire?" insurance.
 *
 * iOS only fires `BGAppRefreshTask`s when it feels like it (Apple decides
 * based on user behavior). The cadence is ~15-60 minutes when the app
 * is used frequently, longer when it's not. So we treat this as a
 * BEST-EFFORT fallback rather than a guarantee.
 *
 * What we do per execution:
 *  1. If we have a registered device token → call `/v1/refresh` on the
 *     worker. The worker handles the actual ASC poll + push send.
 *  2. If the worker is unreachable → return `Failed` so iOS backs off.
 *
 * We deliberately do NOT call ASC directly from here. Why:
 *  - Background tasks can run when the device is on cellular / metered
 *    networks. ASC's response is ~50-100 KB per app; the worker's
 *    refresh response is ~200 bytes. Cheaper for the user.
 *  - The worker also has the "diff against last-seen state" logic; if
 *    we polled directly we'd duplicate that work.
 *
 * The task identifier MUST match `BGTaskSchedulerPermittedIdentifiers`
 * in `app.json` (see Phase 0 setup).
 */

export const BACKGROUND_POLL_TASK_NAME = 'app.releasepilot.poll';

/** Minimum interval iOS will respect; it may run less often. 15 min. */
const MIN_INTERVAL_SECONDS = 15 * 60;

let taskRegistered = false;

/** Define the JS task body. MUST be called BEFORE `registerBackgroundPoll`. */
export function defineBackgroundPollTask(): void {
  if (taskRegistered) return;
  taskRegistered = true;

  TaskManager.defineTask(BACKGROUND_POLL_TASK_NAME, async () => {
    try {
      const deviceToken = usePushRegistrationStore.getState().deviceToken;
      if (!deviceToken) {
        // No registered token → nothing the worker can do for us
        return BackgroundFetch.BackgroundFetchResult.NoData;
      }

      const response = await WorkerClient.refresh({ deviceToken });
      if (!response.ok) {
        return BackgroundFetch.BackgroundFetchResult.Failed;
      }

      const polled = (response.data as { polled?: number }).polled ?? 0;
      const pushed = (response.data as { pushed?: number }).pushed ?? 0;
      // Note "new data" tells iOS we did useful work, which improves our
      // chances of getting scheduled next time.
      if (pushed > 0 || polled > 0) {
        usePushRegistrationStore.getState().recordSync(
          // sync timestamp keyed on issuer — but refresh hits all of them
          // for this device, so we mark every registered issuer as synced.
          '__all__',
          Date.now(),
        );
        return BackgroundFetch.BackgroundFetchResult.NewData;
      }
      return BackgroundFetch.BackgroundFetchResult.NoData;
    } catch {
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
}

/** Ask iOS to start scheduling the task. Safe to call multiple times. */
export async function registerBackgroundPoll(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  defineBackgroundPollTask();

  try {
    await BackgroundFetch.registerTaskAsync(BACKGROUND_POLL_TASK_NAME, {
      minimumInterval: MIN_INTERVAL_SECONDS,
      stopOnTerminate: false,  // iOS still runs us even after force-quit
      startOnBoot: true,
    });
  } catch {
    // Background-fetch registration can fail in Expo Go / non-supported
    // environments. Safe to ignore — push is the primary channel.
  }
}

export async function unregisterBackgroundPoll(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    await BackgroundFetch.unregisterTaskAsync(BACKGROUND_POLL_TASK_NAME);
  } catch {
    // Was never registered — fine.
  }
}
