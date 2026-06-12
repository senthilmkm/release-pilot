import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Schedules (or re-schedules) the daily 7am local push that deep-links
 * into the Briefing tab.
 *
 * Local push (not APNs) so:
 *  - No server round-trip / no worker push budget consumed
 *  - Works offline, on airplane mode (iOS delivers from the local queue)
 *  - No backend cost to feature
 *
 * Identifier: 'briefing-daily'. We always cancel-then-create to make
 * the call idempotent — Expo's scheduled-notification list is
 * append-only otherwise, and you can easily end up with 5 duplicates
 * across app launches.
 *
 * Permission: this function is safe to call regardless of permission
 * state. iOS silently drops scheduled notifications when permission is
 * `denied`, so we don't gate on it here. (The onboarding flow already
 * prompts; this function runs on every app launch as a self-heal.)
 */

const BRIEFING_NOTIFICATION_ID = 'briefing-daily';
const DEFAULT_HOUR = 7;
const DEFAULT_MINUTE = 0;

export type BriefingScheduleOptions = {
  /** 0–23. Defaults to 7am. */
  hour?: number;
  /** 0–59. Defaults to 0. */
  minute?: number;
};

export async function scheduleBriefingNotification(
  options: BriefingScheduleOptions = {},
): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;

  const hour = clampInt(options.hour ?? DEFAULT_HOUR, 0, 23);
  const minute = clampInt(options.minute ?? DEFAULT_MINUTE, 0, 59);

  try {
    await Notifications.cancelScheduledNotificationAsync(BRIEFING_NOTIFICATION_ID).catch(
      () => {
        // Not-yet-scheduled is the common case — ignore.
      },
    );

    await Notifications.scheduleNotificationAsync({
      identifier: BRIEFING_NOTIFICATION_ID,
      content: {
        title: 'Your morning briefing is ready',
        body: 'Tap to see what changed overnight across your apps.',
        sound: 'default',
        // `data.type` is what `setup-notifications.ts` reads to route
        // the user into the Briefing tab on tap.
        data: { type: 'briefing' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });
    return true;
  } catch {
    // Schedule API can throw if the trigger is invalid OR if permission
    // is denied on Android (not our platform). Either way, fail open —
    // the briefing tab still works without the daily nudge.
    return false;
  }
}

export async function cancelBriefingNotification(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(BRIEFING_NOTIFICATION_ID);
  } catch {
    // Already cancelled or never scheduled — nothing to do.
  }
}

/**
 * For the More tab's diagnostics: returns true iff the briefing schedule
 * is currently active. Useful for confirming "is my morning push wired up?"
 */
export async function isBriefingNotificationScheduled(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    return all.some((n) => n.identifier === BRIEFING_NOTIFICATION_ID);
  } catch {
    return false;
  }
}

function clampInt(n: number, min: number, max: number): number {
  const i = Math.round(n);
  if (Number.isNaN(i)) return min;
  return Math.max(min, Math.min(max, i));
}
