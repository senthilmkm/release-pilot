import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';

/** Notification permission status, projected to a UI-friendly enum.
 *
 *  - `granted`      → push notifications will arrive
 *  - `denied`       → user said no; only iOS Settings can re-enable
 *  - `undetermined` → never asked; we can still prompt
 *  - `unsupported`  → web / simulator without notification support
 */
export type NotificationPermissionState =
  | 'granted'
  | 'denied'
  | 'undetermined'
  | 'unsupported';

/**
 * Reactive notification-permission status that also re-syncs whenever
 * the app returns from the background. Without the AppState listener,
 * a user who taps "open iOS Settings → toggle notifications on" would
 * come back to the app and still see "denied" until they relaunched.
 */
export function useNotificationPermission(): NotificationPermissionState {
  const [state, setState] = useState<NotificationPermissionState>('undetermined');

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const perm = await Notifications.getPermissionsAsync();
        if (cancelled) return;
        // iOS reports a granular status; we collapse to our 4-state enum.
        if (perm.granted) {
          setState('granted');
        } else if (perm.canAskAgain) {
          setState('undetermined');
        } else {
          setState('denied');
        }
      } catch {
        if (!cancelled) setState('unsupported');
      }
    };

    void refresh();
    const onChange = (s: AppStateStatus) => {
      if (s === 'active') void refresh();
    };
    const sub = AppState.addEventListener('change', onChange);

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  return state;
}
