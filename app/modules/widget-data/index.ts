import { NativeModule, requireNativeModule } from 'expo';
import { Platform } from 'react-native';

import type { SharedAppState } from '@/lib/native/shared-app-state';

declare class WidgetDataNative extends NativeModule {
  /** Persist the JSON-encoded SharedAppState to the App Group's
   *  UserDefaults under `release-pilot.state.v1`. Then call
   *  WidgetCenter.shared.reloadAllTimelines() so the home/lock screen
   *  widgets refresh immediately (rather than waiting up to 15 minutes
   *  for the timeline's next entry). */
  writeSharedState(jsonString: string): Promise<void>;

  /** Manually trigger a widget reload without changing data. Useful
   *  when the app comes back from background and we want users to see
   *  a fresh "last refreshed" timestamp. */
  reloadWidgets(): Promise<void>;

  /** Read whatever is currently in the App Group. Returns a JSON string
   *  or `null` if the container is empty. Mostly used for diagnostics +
   *  the "Open in Recall" deep link in onboarding. */
  readSharedState(): Promise<string | null>;
}

const native: WidgetDataNative | null = (() => {
  if (Platform.OS !== 'ios') return null;
  try {
    return requireNativeModule<WidgetDataNative>('WidgetData');
  } catch {
    return null;
  }
})();

export const WidgetDataBridge = {
  isAvailable: () => native !== null,

  async writeSharedState(state: SharedAppState): Promise<void> {
    if (!native) return;
    await native.writeSharedState(JSON.stringify(state));
  },

  async reload(): Promise<void> {
    if (!native) return;
    await native.reloadWidgets();
  },

  async readSharedState(): Promise<SharedAppState | null> {
    if (!native) return null;
    const json = await native.readSharedState();
    if (!json) return null;
    try {
      return JSON.parse(json) as SharedAppState;
    } catch {
      return null;
    }
  },
};
