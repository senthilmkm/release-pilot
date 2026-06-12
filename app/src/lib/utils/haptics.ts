import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Thin wrapper around expo-haptics so we have ONE place that defines
 * which haptic style means what in this app.
 *
 * Apple's HIG:
 *  - Light/Medium  → tactile confirmation of a tap (selection, refresh)
 *  - Success       → completed action (purchase, reply sent)
 *  - Warning       → soft block (paywall gate, validation failure)
 *  - Error         → hard failure (purchase declined, network down)
 *
 * Every helper is a no-op on Android (we ship iOS-only for v1) and
 * silently swallows errors — haptics must NEVER block UX.
 */

const isOn = Platform.OS === 'ios';

const safe = async (fn: () => Promise<void>): Promise<void> => {
  if (!isOn) return;
  try {
    await fn();
  } catch {
    // Haptics fail silently on simulators / sandboxed contexts.
  }
};

export const haptic = {
  /** Light tap — e.g. selecting a filter chip. */
  selection:    () => safe(() => Haptics.selectionAsync()),
  /** A small "you did something" tap — e.g. pull-to-refresh completed. */
  light:        () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** A firmer "this is a real action" — e.g. opening paywall. */
  medium:       () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Completed positive outcome — purchase, reply sent, restore succeeded. */
  success:      () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Soft block — gated action, validation failure. */
  warning:      () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  /** Hard error — purchase declined, network died, ASC rejected. */
  error:        () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
