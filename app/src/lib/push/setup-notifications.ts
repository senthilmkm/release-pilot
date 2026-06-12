import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { router } from 'expo-router';

import { usePushRegistrationStore } from '@/lib/state/push-registration';
import { registerDeviceWithWorker } from './register-device';
import {
  isBriefingNotificationScheduled,
  scheduleBriefingNotification,
} from './schedule-briefing';

/**
 * Wires up everything notifications-related at app start:
 *
 *  1. Sets the foreground-presentation handler (alert/sound shown
 *     even when the app is open — indie devs want to KNOW immediately)
 *  2. Fetches the APNs device token (no permission prompt; only works
 *     if permission has already been granted)
 *  3. If we have a token + any connected accounts, calls
 *     `registerDeviceWithWorker()` to make sure the worker knows about us
 *  4. Registers a listener for incoming pushes — silent pushes trigger
 *     a TanStack Query invalidation so the UI refreshes immediately
 *
 * Safe to call multiple times; idempotent. Returns an unsubscribe fn.
 */

export type NotificationsSetupArgs = {
  /** Called when a push arrives, AFTER the local data refresh. UI uses
   *  this to flash a banner or scroll to the changed app. */
  onPushReceived?: (info: { appId: string | null; newState: string | null }) => void;
};

let foregroundHandlerInstalled = false;

export async function setUpNotifications(args: NotificationsSetupArgs = {}): Promise<() => void> {
  if (Platform.OS !== 'ios') return () => {};

  installForegroundHandler();
  const unsubReceived = installReceivedHandler(args.onPushReceived);
  const unsubResponse = installResponseHandler();
  await captureDeviceToken();
  await ensureBriefingScheduled();

  return () => {
    unsubReceived();
    unsubResponse();
  };
}

function installForegroundHandler(): void {
  if (foregroundHandlerInstalled) return;
  foregroundHandlerInstalled = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

function installReceivedHandler(
  cb?: NotificationsSetupArgs['onPushReceived'],
): () => void {
  const sub = Notifications.addNotificationReceivedListener((notification) => {
    const data = notification.request.content.data as
      | { app_id?: string; new_state?: string }
      | undefined;
    cb?.({
      appId: data?.app_id ?? null,
      newState: data?.new_state ?? null,
    });
  });
  return () => sub.remove();
}

/**
 * Tap-router. When the user TAPS a notification (vs receives it while
 * the app is foregrounded), iOS launches the app + fires this listener.
 * We read `data.type` and route accordingly:
 *
 *   - `briefing`           → /(tabs)/briefing  (the 7am local push)
 *   - `state_change`+app_id → /(tabs)/releases/[id]
 *   - default               → no-op (let iOS show its default behavior)
 */
function installResponseHandler(): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as
      | { type?: string; app_id?: string }
      | undefined;
    if (!data) return;

    if (data.type === 'briefing') {
      router.push('/(tabs)/briefing');
      return;
    }
    if (data.app_id) {
      router.push({ pathname: '/(tabs)/releases/[id]', params: { id: data.app_id } });
    }
  });
  return () => sub.remove();
}

/**
 * Self-heal: every app launch, confirm the daily briefing notification
 * is still scheduled. If it's missing (because the user toggled
 * notifications off then back on, or iOS dropped it after a reinstall),
 * re-create it. Cheap call — single `getAllScheduledNotificationsAsync`
 * lookup + conditional re-schedule.
 */
async function ensureBriefingScheduled(): Promise<void> {
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (perm.status !== 'granted') return;
    const isScheduled = await isBriefingNotificationScheduled();
    if (!isScheduled) {
      await scheduleBriefingNotification();
    }
  } catch {
    // Don't block app startup on notification plumbing errors
  }
}

async function captureDeviceToken(): Promise<void> {
  try {
    // `getDevicePushTokenAsync` returns the raw APNs hex token — what
    // the worker needs. `getExpoPushTokenAsync` returns an Expo-side
    // token which would route through Expo's push service. We bypass
    // Expo since we own the APNs key in the worker.
    const tokenObj = await Notifications.getDevicePushTokenAsync();
    if (tokenObj.type !== 'ios') return;

    const token = tokenObj.data;
    if (!token) return;

    const previous = usePushRegistrationStore.getState().deviceToken;
    usePushRegistrationStore.getState().setDeviceToken(token);

    // Only register with the worker if it's a fresh token. Otherwise
    // we'd Face-ID-prompt on every cold start, which is awful UX.
    if (token !== previous) {
      void registerDeviceWithWorker({ deviceToken: token });
    }
  } catch {
    // Likely: notification permission not granted. Silently fine — the
    // 15-min background fetch fallback covers the gap.
  }
}
