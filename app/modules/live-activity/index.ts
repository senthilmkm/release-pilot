import { NativeModule, requireNativeModule } from 'expo';
import { Platform } from 'react-native';

/**
 * Native interface — mirrors `LiveActivityModule.swift`.
 *
 * The JS side passes plain dictionaries (no SemanticState enum) — Swift
 * decodes them directly into `ReleaseActivityAttributes.ContentState`.
 */
declare class LiveActivityNative extends NativeModule {
  /** Whether the device supports ActivityKit AND the user hasn't disabled
   *  Live Activities in Settings. Phase 5 UX uses this to decide whether
   *  to even attempt to start one. */
  areLiveActivitiesEnabled(): Promise<boolean>;

  /** Starts a new Live Activity for an in-flight release.
   *  Returns the iOS-side activity id, which the JS layer stores in
   *  MMKV so subsequent update/end calls can target it. */
  startActivity(
    attributes: LiveActivityAttributes,
    initialState: LiveActivityContentState,
  ): Promise<string>;

  updateActivity(activityId: string, state: LiveActivityContentState): Promise<void>;

  /** End the activity and dismiss the banner. */
  endActivity(activityId: string, finalState: LiveActivityContentState): Promise<void>;

  /** Convenience used on app start — ends any orphaned activities we
   *  no longer have an id for (e.g. user reinstalled the app while an
   *  LA was running). Returns the number of activities ended. */
  endAllActivities(): Promise<number>;
}

export type LiveActivityAttributes = {
  appAscId: string;
  appName: string;
  versionString: string;
  buildNumber: string | null;
};

export type LiveActivityContentState = {
  semanticState: string;
  stateLabel: string;
  stateShortLabel: string;
  stateFgLight: string;
  stateBgLight: string;
  stateFgDark: string;
  stateBgDark: string;
  lastChangedAtMs: number;
};

// On non-iOS or before a dev-client build exists, we silently no-op.
// The pure JS deriver still runs, just nothing renders on screen.
const native: LiveActivityNative | null = (() => {
  if (Platform.OS !== 'ios') return null;
  try {
    return requireNativeModule<LiveActivityNative>('LiveActivity');
  } catch {
    return null;
  }
})();

export const LiveActivityBridge = {
  isAvailable: () => native !== null,

  async areLiveActivitiesEnabled(): Promise<boolean> {
    if (!native) return false;
    return native.areLiveActivitiesEnabled();
  },

  async start(
    attributes: LiveActivityAttributes,
    initialState: LiveActivityContentState,
  ): Promise<string | null> {
    if (!native) return null;
    return native.startActivity(attributes, initialState);
  },

  async update(activityId: string, state: LiveActivityContentState): Promise<void> {
    if (!native) return;
    await native.updateActivity(activityId, state);
  },

  async end(activityId: string, finalState: LiveActivityContentState): Promise<void> {
    if (!native) return;
    await native.endActivity(activityId, finalState);
  },

  async endAll(): Promise<number> {
    if (!native) return 0;
    return native.endAllActivities();
  },
};
