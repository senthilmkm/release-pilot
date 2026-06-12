import type { SemanticState } from '@/constants/state-tokens';

/**
 * Shape of the JSON blob that the RN app writes into the App Group
 * shared container (`group.app.releasepilot.shared`) at key
 * `release-pilot.state.v1`.
 *
 * Both the WidgetKit widget AND the Live Activity views deserialize
 * THIS exact shape on the Swift side (see `targets/widget/SharedAppState.swift`).
 *
 * IMPORTANT: If you add/rename a field here, you MUST bump the version
 * envelope (`v`) and update the Swift decoder. Mismatch = stale or
 * broken widget.
 *
 * Schema versioning policy:
 *   The `v` envelope is reserved for BREAKING shape changes. Field
 *   additions are made WITHOUT bumping `v`, because Swift's Codable
 *   ignores unknown fields by default — so old widget binaries
 *   gracefully ignore new fields, and new widget binaries can read old
 *   payloads because the new fields are declared Optional on the
 *   Swift side.
 *
 *   v1 — initial release: { v, lastUpdatedMs, apps }
 *        — additive (no bump): proStatus, headline
 */

export type WidgetAppRow = {
  /** ASC app id — stable across runs. */
  ascId: string;
  /** App's display name (e.g. "Recall: Personal Memory"). */
  name: string;
  /** Bundle identifier (e.g. "com.acme.recall"). */
  bundleId: string;
  /** Our 7 semantic states. */
  state: SemanticState;
  /** Human-readable label e.g. "Live on App Store". */
  stateLabel: string;
  /** Compact label e.g. "Live". */
  stateShortLabel: string;
  /** Version e.g. "1.8.23". */
  versionString: string;
  /** Build number e.g. "29" — nullable when no build attached. */
  buildNumber: string | null;
  /** ISO 8601 timestamp of when this state was last observed. */
  lastChangedAt: string;
  /** Hex string e.g. "#7A5C00" — foreground tint for the state badge. */
  stateFgLight: string;
  stateFgDark: string;
  /** Background tint for the state badge. */
  stateBgLight: string;
  stateBgDark: string;
};

/**
 * Subscription state visible to the widget. The widget renders
 * differently for each:
 *  - `pro`     → full data (up to N apps), no CTA banner
 *  - `free`    → 1 app + soft "Upgrade for all apps" headline
 *  - `lapsed`  → 1 app + prominent "Renew Pro" headline (user used to
 *                be Pro within the last 60 days; we want to nudge them
 *                back without nagging forever)
 */
export type WidgetProStatus = 'pro' | 'free' | 'lapsed';

export type SharedAppState = {
  v: 1;
  /** Epoch milliseconds when the RN app last wrote this state. */
  lastUpdatedMs: number;
  /** Apps sorted by `HERO_PRIORITY` ascending (most-urgent first), so
   *  `apps[0]` is the right pick for the lock-screen rectangle + home
   *  small widget. Cap depends on `proStatus` (free/lapsed = 1). */
  apps: WidgetAppRow[];
  /** Subscription state (drives headline + apps cap). Additive field —
   *  old Swift binaries (pre-tier-aware widget) silently ignore. */
  proStatus: WidgetProStatus;
  /** Optional banner copy. When present, the widget renders this
   *  prominently with a "tap to open Release Pilot" affordance.
   *  Additive field — old Swift binaries silently ignore. */
  headline: string | null;
};

/** Key under UserDefaults(suiteName:) used by both the writer and Swift. */
export const SHARED_STATE_KEY = 'release-pilot.state.v1';

/** App Group suite name (matches `entitlements` in `app.json`). */
export const APP_GROUP_ID = 'group.app.releasepilot.shared';

/** How many apps the widget shows for each tier. Pro is effectively
 *  unbounded (Apple caps a `systemLarge` at ~6 visible rows anyway). */
export const WIDGET_APPS_CAP: Record<WidgetProStatus, number> = {
  pro: 99,
  free: 1,
  lapsed: 1,
};
