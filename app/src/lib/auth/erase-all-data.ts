import * as Notifications from 'expo-notifications';
import Purchases from 'react-native-purchases';
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

import { deleteP8 } from '@/lib/auth/credentials';
import { deleteRevenueCatSecret } from '@/lib/auth/revenuecat-credentials';
import { clearAllJwts } from '@/lib/auth/jwt-cache';
import { storage } from '@/lib/state/storage';
import { useAccountsStore } from '@/lib/state/accounts';
import { useAppRevenueCatStore } from '@/lib/state/app-revenuecat';
import { usePushRegistrationStore } from '@/lib/state/push-registration';
import { useSubscriptionStore } from '@/lib/state/subscription';
import { WorkerClient } from '@/lib/push/worker-client';
import { LiveActivityBridge } from 'live-activity';
import { WidgetDataBridge } from 'widget-data';
import {
  APP_GROUP_ID,
  SHARED_STATE_KEY,
  type SharedAppState,
} from '@/lib/native/shared-app-state';

/**
 * Complete on-device wipe for App Store Connect Review Guideline 5.1.1(v)
 * "account deletion" compliance.
 *
 * Release Pilot does NOT have a traditional user account — credentials
 * live on-device in iOS Keychain — but the App Store Connect API key
 * the user pastes IS the closest analogue. Connecting that key also
 * registers a row on the Release Pilot worker (so the worker can poll
 * ASC on the user's behalf and deliver push notifications). Deleting
 * the key alone leaves orphan rows on the worker. This wipe handles
 * BOTH local and remote cleanup in one user action.
 *
 * Order of operations is intentional and load-bearing:
 *
 *   1. End any active Live Activities (so the Dynamic Island /
 *      Lock-Screen banners don't keep showing stale data while the
 *      wipe is in flight).
 *
 *   2. Snapshot accounts + device token BEFORE wiping local state —
 *      we need the issuer-IDs to locate Keychain entries, and the
 *      device token to call /v1/unregister on the worker.
 *
 *   3. Best-effort worker unregister. We swallow network errors
 *      because the wipe MUST succeed even if the user is offline —
 *      a stale row on the worker is harmless (APNs returns 410 next
 *      poll and the worker prunes it).
 *
 *   4. RevenueCat `logOut()` — disconnects the anonymous subscriber
 *      so the next install starts from a fresh subscriber identity.
 *      Does NOT cancel the iCloud subscription itself — Apple owns
 *      that and the user manages it via Settings → Apple ID. We
 *      surface that fact in the confirmation screen.
 *
 *   5. Delete every Keychain entry (per-account .p8 PEMs +
 *      per-app RevenueCat secrets). Iterate BEFORE the MMKV wipe
 *      so we still have the keys to look up.
 *
 *   6. Cancel scheduled notifications (the daily 7am briefing
 *      notification, plus any test notifications still queued).
 *
 *   7. Drop SQLite tables — wipes cached app rows, version
 *      summaries, reviews, and the offline reply queue.
 *
 *   8. Clear in-memory JWT cache.
 *
 *   9. `storage.clearAll()` — single call wipes EVERY MMKV-backed
 *      Zustand store at once (accounts, subscription, push-
 *      registration, app-revenuecat, gate-counters, pro-history,
 *      briefing-snapshot, active-live-activities, canned-templates,
 *      onboarding-draft).
 *
 *  10. Reset in-memory Zustand state for the stores the user can
 *      still see during the wipe — `clearAll()` only touches the
 *      persistence layer; the in-memory React state holds the old
 *      data until each store is told to reset.
 *
 *  11. Write an empty SharedAppState to the widget App Group so the
 *      Lock-Screen / Home-Screen widget falls back to its empty
 *      state immediately (rather than caching the last known
 *      payload until iOS triggers a timeline refresh, which can
 *      take up to 15 minutes).
 *
 * Every step is independently try/caught. The function NEVER throws:
 * a partially-failed wipe still returns and the caller routes the
 * user to onboarding (where the lack of credentials forces them
 * through verification again — which surfaces any orphan state).
 */

export type EraseResult = {
  /** True iff every step finished without throwing. Used by the UI
   *  to choose between "All data erased" and "Some cleanup failed". */
  ok: boolean;
  /** Per-step outcome — surfaced in Diagnostics so users (and
   *  Apple's review team) can verify what happened. */
  steps: Array<{ name: string; ok: boolean; detail?: string }>;
};

export async function eraseAllData(): Promise<EraseResult> {
  const steps: EraseResult['steps'] = [];
  const log = (name: string, ok: boolean, detail?: string): void => {
    steps.push({ name, ok, detail });
  };

  // ---- 1. End any active Live Activities ----
  try {
    if (LiveActivityBridge.isAvailable()) {
      const ended = await LiveActivityBridge.endAll();
      log('endLiveActivities', true, `ended ${ended}`);
    } else {
      log('endLiveActivities', true, 'bridge not available');
    }
  } catch (e) {
    log('endLiveActivities', false, errMessage(e));
  }

  // ---- 2. Snapshot what we need before destroying state ----
  const accountsSnapshot = useAccountsStore.getState().accounts.map((a) => a.issuerId);
  const rcAppIdsSnapshot = Object.keys(useAppRevenueCatStore.getState().byAscAppId);
  const deviceToken = usePushRegistrationStore.getState().deviceToken;

  // ---- 3. Best-effort worker unregister ----
  if (deviceToken) {
    try {
      const res = await WorkerClient.unregister({ deviceToken });
      log('workerUnregister', res.ok, res.ok ? `deleted ${res.data.deleted}` : res.reason);
    } catch (e) {
      log('workerUnregister', false, errMessage(e));
    }
  } else {
    log('workerUnregister', true, 'no device token to unregister');
  }

  // ---- 4. RevenueCat logOut ----
  if (Platform.OS === 'ios') {
    try {
      await Purchases.logOut();
      log('revenueCatLogout', true);
    } catch (e) {
      // logOut() throws if the user is anonymous, which is the
      // common case (we never call logIn() with a custom alias).
      // Treat as success — there's nothing to disconnect.
      log('revenueCatLogout', true, errMessage(e));
    }
  } else {
    log('revenueCatLogout', true, 'non-iOS');
  }

  // ---- 5. Delete every Keychain entry ----
  for (const issuerId of accountsSnapshot) {
    try {
      await deleteP8(issuerId);
      log(`deleteP8(${shortId(issuerId)})`, true);
    } catch (e) {
      log(`deleteP8(${shortId(issuerId)})`, false, errMessage(e));
    }
  }
  for (const ascAppId of rcAppIdsSnapshot) {
    try {
      await deleteRevenueCatSecret(ascAppId);
      log(`deleteRcSecret(${ascAppId})`, true);
    } catch (e) {
      log(`deleteRcSecret(${ascAppId})`, false, errMessage(e));
    }
  }

  // ---- 6. Cancel scheduled notifications ----
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    log('cancelScheduledNotifications', true);
  } catch (e) {
    log('cancelScheduledNotifications', false, errMessage(e));
  }

  // ---- 7. Drop SQLite tables ----
  try {
    const db = await SQLite.openDatabaseAsync('release-pilot.db');
    await db.execAsync(`
      DELETE FROM apps_cache;
      DELETE FROM versions_cache;
      DELETE FROM reviews_cache;
      DELETE FROM reply_queue;
    `);
    log('clearSqliteCache', true);
  } catch (e) {
    // Tables may not exist if the user never connected — that's fine.
    log('clearSqliteCache', true, errMessage(e));
  }

  // ---- 8. Clear in-memory JWT cache ----
  try {
    clearAllJwts();
    log('clearJwtCache', true);
  } catch (e) {
    log('clearJwtCache', false, errMessage(e));
  }

  // ---- 9. Wipe ALL MMKV ----
  try {
    storage.clearAll();
    log('clearMmkv', true);
  } catch (e) {
    log('clearMmkv', false, errMessage(e));
  }

  // ---- 10. Reset in-memory Zustand state for visible stores ----
  // MMKV.clearAll() only wipes the persisted blob; the live React
  // state still holds the previous accounts/subscription/etc until
  // each store is told to reset, otherwise the next render flashes
  // stale data before the routing redirect lands.
  try {
    useAccountsStore.setState({ accounts: [] });
    useAppRevenueCatStore.setState({ byAscAppId: {} });
    usePushRegistrationStore.setState({ deviceToken: null, registrations: {} });
    useSubscriptionStore.setState({
      entitlement: {
        isPro: false,
        isInTrial: false,
        tier: 'free',
        activeProductId: null,
        expiresAtMs: null,
        isInGracePeriod: false,
        originalAppVersion: null,
      },
      offering: null,
      status: 'ready',
    });
    log('resetInMemoryStores', true);
  } catch (e) {
    log('resetInMemoryStores', false, errMessage(e));
  }

  // ---- 11. Write empty widget state ----
  try {
    if (WidgetDataBridge.isAvailable()) {
      const empty: SharedAppState = {
        v: 1,
        lastUpdatedMs: Date.now(),
        apps: [],
        proStatus: 'free',
        headline: null,
      };
      await WidgetDataBridge.writeSharedState(empty);
      log('resetWidgetState', true);
    } else {
      log('resetWidgetState', true, 'bridge not available');
    }
  } catch (e) {
    log('resetWidgetState', false, errMessage(e));
  }

  const ok = steps.every((s) => s.ok);
  return { ok, steps };
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function shortId(issuerId: string): string {
  return issuerId.length > 12 ? `${issuerId.slice(0, 8)}…` : issuerId;
}

/** Re-exported so the wipe screen can render the same constants the
 *  worker / widget use, e.g. for "this also clears widget at
 *  group.app.releasepilot.shared" copy. */
export { APP_GROUP_ID, SHARED_STATE_KEY };
