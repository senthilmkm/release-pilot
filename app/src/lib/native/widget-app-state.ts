import {
  StateColors,
  StateLabels,
  StateShortLabels,
  type SemanticState,
} from '@/constants/state-tokens';
import type { AggregatedAppRow } from '@/lib/api/asc-queries';
import type { LatestStateSnapshot } from '@/lib/domain/version-events';

import {
  WIDGET_APPS_CAP,
  type SharedAppState,
  type WidgetAppRow,
  type WidgetProStatus,
} from './shared-app-state';

/**
 * Hero-slot priority: "which app should fill the lock-screen rectangle
 * and home-screen small widget" — i.e. `apps[0]` after sorting.
 *
 * Ordered by how much attention the state needs from the developer:
 *  1. rejected           — your build is blocked, must fix + resubmit
 *  2. approved_waiting   — action available, tap "Release" in ASC
 *  3. in_review          — Apple is actively looking RIGHT NOW
 *  4. approved_scheduled — Apple will auto-release on the scheduled date
 *  5. submitted          — in the queue, waiting for in_review
 *  6. drafting           — you're actively preparing the next release
 *  7. live               — shipped, no action needed (lowest signal value)
 *
 * Lower number = higher priority = appears first in `apps` array.
 *
 * Why drafting beats live: a live app is a stable end-state — it's on
 * the App Store and there's nothing to do. A drafting app means there's
 * work in flight on YOUR side. Indie devs glance at the Lock Screen to
 * remember what they're working on; "you have v2.0 still in draft" is
 * useful, "your already-shipped v1.9 is still live" is not.
 *
 * (Stale drafts that have been sitting there forever DO get surfaced —
 * intentionally. If a draft has been languishing the nudge is healthy.
 * Pin-a-specific-app via AppIntent will be the escape hatch for users
 * who don't want to see drafts on their lock screen.)
 */
export const HERO_PRIORITY: Record<SemanticState, number> = {
  rejected:           1,
  approved_waiting:   2,
  in_review:          3,
  approved_scheduled: 4,
  submitted:          5,
  drafting:           6,
  live:               7,
};

/**
 * Pure projection: turn the in-app data (apps + their latest snapshots)
 * into the compact shape the Widget / Live Activity reads from the App
 * Group.
 *
 * Lives in its own file so it's testable in plain Node without RN deps.
 *
 * Tier-aware behavior:
 *  - `pro`    → all apps with non-empty snapshots (HERO_PRIORITY-sorted), no headline
 *  - `free`   → the SAME 1 app the rest of the app calls "the free app"
 *               (alphabetically first by name, case-insensitive). Matches
 *               useFreeApp / Releases / Reviews / Today / Checklist tabs.
 *               Soft "Upgrade to track all apps" headline IF 2+ apps.
 *  - `lapsed` → same alphabetically-first pick + prominent
 *               "Renew Pro to see all apps" headline.
 *
 * Why NOT HERO_PRIORITY for free/lapsed:
 *   If we picked the most-urgent app for free users, the widget would
 *   surface an app they CAN'T tap into (it would be locked for them in
 *   the in-app drilldown). The widget would also disagree with which
 *   app is unlocked in the Releases / Reviews / Today / Checklist tabs.
 *   The whole point of "1 app free" is to be a consistent rule.
 */
export function buildSharedState(args: {
  apps: AggregatedAppRow[];
  snapshots: Map<string, LatestStateSnapshot>;
  nowMs: number;
  proStatus: WidgetProStatus;
}): SharedAppState {
  const allRows: WidgetAppRow[] = args.apps
    .map((app) => projectApp(app, args.snapshots.get(app.ascId) ?? null, args.nowMs))
    .filter((row): row is WidgetAppRow => row !== null);

  // Two sort modes:
  //  - Pro: HERO_PRIORITY (most-urgent state first). Tiebreaker is
  //    alphabetical so the choice is deterministic frame-to-frame.
  //  - Free / lapsed: alphabetical only. Combined with the cap-of-1,
  //    this guarantees apps[0] is the SAME app the rest of the freemium
  //    surfaces treat as "the free one". Honors the "1 app for free"
  //    rule end-to-end and prevents the widget from advertising a
  //    locked app the user can't actually open.
  const isPro = args.proStatus === 'pro';
  allRows.sort((a, b) => {
    if (isPro) {
      const dp = HERO_PRIORITY[a.state] - HERO_PRIORITY[b.state];
      if (dp !== 0) return dp;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  // Cap visible apps based on subscription tier.
  const cap = WIDGET_APPS_CAP[args.proStatus];
  const apps = allRows.slice(0, cap);

  return {
    v: 1,
    lastUpdatedMs: args.nowMs,
    apps,
    proStatus: args.proStatus,
    headline: buildHeadline({
      proStatus: args.proStatus,
      totalAppCount: allRows.length,
    }),
  };
}

/** Compute the optional CTA banner shown above the app rows. */
function buildHeadline(args: {
  proStatus: WidgetProStatus;
  totalAppCount: number;
}): string | null {
  switch (args.proStatus) {
    case 'pro':
      return null;
    case 'lapsed':
      // Always nag a lapsed user — they had Pro, they know the value.
      return 'Renew Pro to see all apps';
    case 'free':
      // Only nag if they actually have more than 1 app. A solo-app user
      // shouldn't see "Upgrade for more" copy when they have nothing
      // more to upgrade for.
      return args.totalAppCount > 1 ? 'Upgrade to track all apps' : null;
  }
}

function projectApp(
  app: AggregatedAppRow,
  snapshot: LatestStateSnapshot | null,
  nowMs: number,
): WidgetAppRow | null {
  if (!snapshot || snapshot.isEmpty) return null;

  const state: SemanticState = snapshot.state;
  const light = StateColors.light[state];
  const dark = StateColors.dark[state];

  return {
    ascId: app.ascId,
    name: app.name,
    bundleId: app.bundleId,
    state,
    stateLabel: StateLabels[state],
    stateShortLabel: StateShortLabels[state],
    versionString: snapshot.versionString,
    buildNumber: snapshot.buildNumber,
    // Stamped at projection time. Not used for ordering (HERO_PRIORITY
    // is used for that), but kept in the payload for the live activity
    // attributes shape and for any future "last changed X minutes ago"
    // copy in the widget. Per-state-change timestamps from ASC would
    // be more accurate; tracked as future work.
    lastChangedAt: new Date(nowMs).toISOString(),
    stateFgLight: light.fg,
    stateBgLight: light.bg,
    stateFgDark: dark.fg,
    stateBgDark: dark.bg,
  };
}
