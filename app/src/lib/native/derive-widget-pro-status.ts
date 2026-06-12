import type { WidgetProStatus } from './shared-app-state';

/** How long after Pro lapses do we keep nagging in the widget. After
 *  this window the user is treated as a regular free user (no headline
 *  unless they have 2+ apps). */
export const LAPSED_NAG_WINDOW_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

/**
 * Pure mapping: turn (isPro, last-seen-pro timestamp) into the
 * `WidgetProStatus` enum the widget renders.
 *
 *   isPro=true                                   → 'pro'
 *   isPro=false, never been Pro                  → 'free'
 *   isPro=false, last-seen-pro within 60 days    → 'lapsed'
 *   isPro=false, last-seen-pro > 60 days ago     → 'free' (de-escalate)
 *
 * Lives in its own file so it's testable in plain Node + sharable
 * between the live sync hook and the unit tests.
 */
export function deriveWidgetProStatus(args: {
  isPro: boolean;
  lastProMs: number | null;
  nowMs: number;
}): WidgetProStatus {
  if (args.isPro) return 'pro';
  if (args.lastProMs === null) return 'free';
  const elapsed = args.nowMs - args.lastProMs;
  return elapsed <= LAPSED_NAG_WINDOW_MS ? 'lapsed' : 'free';
}
