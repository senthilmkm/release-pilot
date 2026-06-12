import { useEffect, useRef } from 'react';

import {
  StateColors,
  StateLabels,
  StateShortLabels,
  type SemanticState,
} from '@/constants/theme';
import type { AggregatedAppRow } from '@/lib/api/asc-queries';
import type { LatestStateSnapshot } from '@/lib/domain/version-events';
import { decideActivityAction } from '@/lib/domain/live-activity-sync';
import {
  clearActivityRecord,
  getActivityRecord,
  getLastObservedState,
  setActivityRecord,
  setLastObservedState,
} from '@/lib/state/active-live-activities';
import { deriveWidgetProStatus } from '@/lib/native/derive-widget-pro-status';
import { buildSharedState } from '@/lib/native/widget-app-state';
import { getLastProMs, markProSeen } from '@/lib/state/pro-history';
import { useEntitlement } from '@/hooks/use-entitlement';

import { LiveActivityBridge, type LiveActivityContentState } from 'live-activity';
import { WidgetDataBridge } from 'widget-data';

/**
 * The single entry point that keeps native surfaces (Lock Screen
 * widget, Home Screen widget, Dynamic Island Live Activities) in sync
 * with the latest data from the React Query cache.
 *
 * Called once near the root of the app — typically from the Releases
 * tab so the data is already loaded by the time the hook fires.
 *
 * Responsibilities:
 *  1. Push the latest aggregated state into the App Group (so widgets
 *     refresh) — tier-aware. Free users see 1 app + optional CTA;
 *     lapsed users get a "Renew Pro" headline; Pro sees everything.
 *  2. For each app, diff the previous semantic state vs the new one,
 *     and START/UPDATE/END a Live Activity as appropriate — Pro-only.
 *  3. Stamp `last-seen-pro` whenever the user IS Pro, so future free
 *     renders can correctly classify them as 'lapsed'.
 *
 * Subscription gating (per the Phase-7 free-tier model):
 *  - Widget data is ALWAYS written so the widget can render its tier-
 *    appropriate view (empty / 1 app / lapsed banner / all apps).
 *    Gating happens INSIDE the projection via `proStatus`.
 *  - Live Activities are Pro-only — if not Pro, we end any in-flight
 *    activities and skip the start/update path entirely.
 *
 * Side effects are firewalled inside `useEffect` and gated on the
 * `snapshots`/`apps` references changing (plus `isPro`), so re-renders
 * of unrelated components don't ping ActivityKit.
 */
export function useNativeSurfaceSync(args: {
  apps: AggregatedAppRow[];
  snapshots: Map<string, LatestStateSnapshot>;
}) {
  const { apps, snapshots } = args;
  const { isPro } = useEntitlement();

  // We track in a ref to detect "this is the first sync after mount"
  // so the self-heal path (start an LA we have no record of) doesn't
  // accidentally double-fire on every render.
  const hasRunOnce = useRef(false);

  useEffect(() => {
    void syncNativeSurfaces({ apps, snapshots, isPro, isFirstRun: !hasRunOnce.current });
    hasRunOnce.current = true;
    // We intentionally depend on the OBJECT references — React Query
    // gives us a fresh Map on each successful refetch, which is exactly
    // the trigger we want here. `isPro` is in deps so a subscription
    // change immediately re-renders the widget (e.g. user upgrades and
    // sees their other apps appear instantly).
  }, [apps, snapshots, isPro]);
}

// ---------------------------------------------------------------------------
// Internal driver (exported for testing in isolation)
// ---------------------------------------------------------------------------

export async function syncNativeSurfaces(args: {
  apps: AggregatedAppRow[];
  snapshots: Map<string, LatestStateSnapshot>;
  isPro: boolean;
  isFirstRun: boolean;
}): Promise<void> {
  const { apps, snapshots, isPro } = args;
  const nowMs = Date.now();

  // Stamp "user was last seen Pro" so we can later classify a free
  // user as 'lapsed' (vs. never-was-Pro) within the 60-day nag window.
  if (isPro) markProSeen(nowMs);

  // ---------- 1. Push to App Group for widgets ----------
  const proStatus = deriveWidgetProStatus({
    isPro,
    lastProMs: getLastProMs(),
    nowMs,
  });
  if (WidgetDataBridge.isAvailable()) {
    const shared = buildSharedState({ apps, snapshots, nowMs, proStatus });
    try {
      await WidgetDataBridge.writeSharedState(shared);
    } catch {
      // Widget refresh isn't critical — log via __DEV__ only
      if (__DEV__) console.warn('[native-sync] widget write failed');
    }
  }

  // ---------- 2. Live Activity transitions per app ----------
  if (!LiveActivityBridge.isAvailable()) return;

  // Pro-only feature. When a user lapses we tear down any in-flight
  // activities so the lock-screen surface doesn't keep showing old data.
  if (!isPro) {
    for (const app of apps) {
      const record = getActivityRecord(app.ascId);
      if (!record) continue;
      try {
        const snapshot = snapshots.get(app.ascId);
        const fallbackState = snapshot?.state ?? record.lastState;
        await LiveActivityBridge.end(record.activityId, buildContentState(fallbackState, nowMs));
      } catch {
        // Best-effort teardown; iOS will time out stale LAs eventually.
      }
      clearActivityRecord(app.ascId);
    }
    return;
  }

  // Pre-flight: if Live Activities are disabled in Settings we can skip
  // all of this work and avoid spamming the bridge.
  const enabled = await LiveActivityBridge.areLiveActivitiesEnabled();
  if (!enabled) return;

  for (const app of apps) {
    const snapshot = snapshots.get(app.ascId);
    if (!snapshot || snapshot.isEmpty) continue;

    const previous = getLastObservedState(app.ascId);
    const current = snapshot.state;
    const record = getActivityRecord(app.ascId);

    const action = decideActivityAction({
      previous,
      current,
      hasActiveActivity: record !== null,
    });

    try {
      switch (action.kind) {
        case 'start': {
          const id = await LiveActivityBridge.start(
            {
              appAscId: app.ascId,
              appName: app.name,
              versionString: snapshot.versionString,
              buildNumber: snapshot.buildNumber,
            },
            buildContentState(current, nowMs),
          );
          if (id) {
            setActivityRecord(app.ascId, {
              activityId: id,
              lastState: current,
              versionString: snapshot.versionString,
              buildNumber: snapshot.buildNumber,
              updatedAtMs: nowMs,
            });
          }
          break;
        }

        case 'update': {
          if (!record) break;
          // If the version string changed (Apple rejected and dev
          // submitted a new version), end the old LA and start fresh
          // so the "version" header in the banner is correct.
          if (record.versionString !== snapshot.versionString) {
            await LiveActivityBridge.end(record.activityId, buildContentState(current, nowMs));
            clearActivityRecord(app.ascId);
            const id = await LiveActivityBridge.start(
              {
                appAscId: app.ascId,
                appName: app.name,
                versionString: snapshot.versionString,
                buildNumber: snapshot.buildNumber,
              },
              buildContentState(current, nowMs),
            );
            if (id) {
              setActivityRecord(app.ascId, {
                activityId: id,
                lastState: current,
                versionString: snapshot.versionString,
                buildNumber: snapshot.buildNumber,
                updatedAtMs: nowMs,
              });
            }
          } else {
            await LiveActivityBridge.update(record.activityId, buildContentState(current, nowMs));
            setActivityRecord(app.ascId, {
              ...record,
              lastState: current,
              updatedAtMs: nowMs,
            });
          }
          break;
        }

        case 'end': {
          if (!record) break;
          await LiveActivityBridge.end(record.activityId, buildContentState(current, nowMs));
          clearActivityRecord(app.ascId);
          break;
        }

        case 'noop':
          break;
      }
    } catch (err) {
      if (__DEV__) console.warn('[native-sync] live activity action failed', action.kind, err);
    }

    setLastObservedState(app.ascId, current);
  }
}

// ---------------------------------------------------------------------------

function buildContentState(state: SemanticState, nowMs: number): LiveActivityContentState {
  const light = StateColors.light[state];
  const dark  = StateColors.dark[state];
  return {
    semanticState: state,
    stateLabel: StateLabels[state],
    stateShortLabel: StateShortLabels[state],
    stateFgLight: light.fg,
    stateBgLight: light.bg,
    stateFgDark: dark.fg,
    stateBgDark: dark.bg,
    lastChangedAtMs: nowMs,
  };
}
