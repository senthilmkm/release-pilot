import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export async function syncUrgentSignalBadgeCount(count: number): Promise<void> {
  if (Platform.OS !== 'ios') return;

  try {
    const safeCount = Math.max(0, Math.floor(count));
    const permission = await Notifications.getPermissionsAsync();
    if (permission.status !== 'granted' && safeCount > 0) return;
    await Notifications.setBadgeCountAsync(safeCount);
  } catch {
    // Badge sync should never block Today rendering.
  }
}
