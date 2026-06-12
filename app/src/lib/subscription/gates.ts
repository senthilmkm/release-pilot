import type { GateDecision } from './types';

/**
 * Pure paywall-gate logic.
 *
 * The free tier (verified against the indie iOS dev market — 99% have
 * 1 Apple Developer account containing 1-20+ apps):
 *
 *   1. ADD-ACCOUNT      — Free users get ONE ASC account. 2nd+ → Pro.
 *                         (Mostly hits agencies / consultants.)
 *
 *   2. ADD-APP          — Free users get ONE app tracked with full
 *                         features. App #2+ in their account → Pro.
 *                         This is the PRIMARY metering dimension that
 *                         drives indie revenue, because most devs ship
 *                         2+ apps over time.
 *
 *   3. REPLY-TO-REVIEW  — Free users get TWO replies per rolling 30
 *                         days. Lets them build the habit on us, then
 *                         Pro for unlimited.
 *
 *   4. CHECKLIST-WEEKLY — Free users get 3 checklist runs per rolling
 *                         7-day window. 4th+ → Pro. Power users (4+
 *                         submissions/week) upgrade.
 *
 *   5. CONNECT-RC       — RevenueCat integration is Pro-only. Connecting
 *                         RC is a "I'm a serious dev tracking growth"
 *                         signal — best moment to convert.
 *
 *   6. PUSH-NOTIFS      — Push notifications for review-state changes
 *                         are Pro-only. The whole reason this product
 *                         exists; differentiator vs Apple's free ASC
 *                         iOS app (which only does basic stats).
 *
 *   7. LOCK-SCREEN      — Lock-screen / Home-screen widget is Pro-only.
 *                         Sticky daily ritual: replaces 4 dashboards.
 *
 *   8. LIVE-ACTIVITY    — Live Activities during the review-wait period
 *                         are Pro-only. Anxiety-relief during the
 *                         7-30 day wait.
 *
 * Why these in this combination:
 *  - Free is a real, usable product: 1 app, weekly checklist, 2 review
 *    replies/month, basic dashboard. Solo devs with their first app
 *    can ship calmly using just the free tier.
 *  - Every gate fires on the dev's natural growth path. Ship app #2 →
 *    upgrade. Want lock-screen widget → upgrade. Connect RC → upgrade.
 *  - "Add account" still exists for completeness (consultancies) but
 *    is no longer the load-bearing revenue gate — that's "add app".
 *
 * All free-tier limits are encoded HERE so we have one place to tweak.
 */

export const FREE_TIER_LIMITS = {
  accounts: 1,
  apps: 1,
  checklistRunsPerWeek: 3,
  reviewRepliesPerMonth: 2,
} as const;

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Add account
// ---------------------------------------------------------------------------

/** Gate the "add an ASC account" flow. */
export function gateAddAccount(args: {
  isPro: boolean;
  currentAccountCount: number;
}): GateDecision {
  if (args.isPro) return { allowed: true };
  if (args.currentAccountCount < FREE_TIER_LIMITS.accounts) return { allowed: true };
  return { allowed: false, reason: 'add-account-limit' };
}

// ---------------------------------------------------------------------------
// Add app  (the PRIMARY revenue gate)
// ---------------------------------------------------------------------------

/**
 * Gate "I want to interact with this app" — covers tapping into an
 * app's detail page, enabling push for it, adding its data to the
 * briefing, etc.
 *
 * Why we pass `appIndex` rather than `currentAppCount`:
 *  - The user's ASC account may contain 5 apps. We want to allow
 *    interaction with app #0 (alphabetically first) for free, but
 *    paywall apps #1..#4.
 *  - Caller passes the index of the app they're trying to access
 *    (deterministic ordering = sort-by-name in the UI). This lets us
 *    paywall consistently no matter which app the user taps first.
 */
export function gateAddApp(args: {
  isPro: boolean;
  appIndex: number;
}): GateDecision {
  if (args.isPro) return { allowed: true };
  if (args.appIndex < FREE_TIER_LIMITS.apps) return { allowed: true };
  return { allowed: false, reason: 'add-app-limit' };
}

// ---------------------------------------------------------------------------
// Reply to review (rolling monthly quota)
// ---------------------------------------------------------------------------

/**
 * Count how many review replies happened in the past 30 days.
 *
 * Input: an array of epoch-ms timestamps (e.g. from MMKV counter store).
 * Pure — caller does the disk I/O.
 */
export function countRecentReviewReplies(args: {
  replyTimestampsMs: readonly number[];
  nowMs: number;
}): number {
  const cutoff = args.nowMs - MONTH_MS;
  return args.replyTimestampsMs.filter((t) => t >= cutoff).length;
}

/**
 * Gate the "send review reply" action.
 *
 * Free tier gets 2 replies per rolling 30 days — enough to feel the
 * value (1 for an angry 1-star, 1 for a happy 5-star), then Pro for
 * unlimited. We count BEFORE the action, so the 1st + 2nd of the month
 * pass; the 3rd attempt fires the paywall.
 */
export function gateReplyToReview(args: {
  isPro: boolean;
  replyTimestampsMs: readonly number[];
  nowMs: number;
}): GateDecision {
  if (args.isPro) return { allowed: true };
  const recent = countRecentReviewReplies({
    replyTimestampsMs: args.replyTimestampsMs,
    nowMs: args.nowMs,
  });
  if (recent < FREE_TIER_LIMITS.reviewRepliesPerMonth) return { allowed: true };
  return { allowed: false, reason: 'reply-to-review-limit' };
}

// ---------------------------------------------------------------------------
// Checklist runs / rolling week
// ---------------------------------------------------------------------------

/**
 * Count how many checklist runs happened in the past 7 days.
 *
 * Input: an array of epoch-ms timestamps (e.g. from MMKV counter store).
 * Pure — caller does the disk I/O.
 */
export function countRecentChecklistRuns(args: {
  runTimestampsMs: readonly number[];
  nowMs: number;
}): number {
  const cutoff = args.nowMs - WEEK_MS;
  return args.runTimestampsMs.filter((t) => t >= cutoff).length;
}

/**
 * Gate the "run checklist" action.
 *
 * Note we count BEFORE the action — so the 1st, 2nd, and 3rd runs of
 * the week pass; the 4th fires the paywall.
 */
export function gateChecklistRun(args: {
  isPro: boolean;
  runTimestampsMs: readonly number[];
  nowMs: number;
}): GateDecision {
  if (args.isPro) return { allowed: true };
  const recent = countRecentChecklistRuns({
    runTimestampsMs: args.runTimestampsMs,
    nowMs: args.nowMs,
  });
  if (recent < FREE_TIER_LIMITS.checklistRunsPerWeek) return { allowed: true };
  return { allowed: false, reason: 'checklist-weekly-limit' };
}

// ---------------------------------------------------------------------------
// Pro-only features (no free quota)
// ---------------------------------------------------------------------------

/** Connecting a RevenueCat project. Pro-only — high-intent upsell moment. */
export function gateConnectRevenueCat(args: { isPro: boolean }): GateDecision {
  if (args.isPro) return { allowed: true };
  return { allowed: false, reason: 'connect-revenuecat-pro' };
}

/**
 * Enabling push notifications for App Store Connect state changes.
 * Pro-only — this is the core differentiator vs Apple's free ASC app
 * and the reason indie devs sign up.
 */
export function gateEnablePushNotifications(args: { isPro: boolean }): GateDecision {
  if (args.isPro) return { allowed: true };
  return { allowed: false, reason: 'push-notifications-pro' };
}

/**
 * Using the Lock-Screen / Home-Screen widget. Pro-only — the "replaces
 * 4 dashboards" promise. Widget data is gated on the data-write side
 * (we don't push fresh shared data unless the user is Pro).
 */
export function gateLockScreenWidget(args: { isPro: boolean }): GateDecision {
  if (args.isPro) return { allowed: true };
  return { allowed: false, reason: 'lock-screen-widget-pro' };
}

/** Starting a Live Activity for a review-in-progress build. Pro-only. */
export function gateLiveActivity(args: { isPro: boolean }): GateDecision {
  if (args.isPro) return { allowed: true };
  return { allowed: false, reason: 'live-activity-pro' };
}

// ---------------------------------------------------------------------------
// Human-readable copy
// ---------------------------------------------------------------------------

/** Returns the title + body the paywall shows above the plans, so the
 *  user understands EXACTLY why they're seeing it. */
export function paywallCopyFor(reason: import('./types').GateBlockReason): {
  title: string;
  body: string;
} {
  switch (reason) {
    case 'add-account-limit':
      return {
        title: 'Connect more App Store Connect accounts',
        body: 'Free includes 1 account. Upgrade to Pro to manage every team you ship for.',
      };
    case 'add-app-limit':
      return {
        title: 'Track all your apps',
        body: `Free includes ${FREE_TIER_LIMITS.apps} app. Upgrade to Pro to monitor your entire portfolio — releases, reviews, revenue, and pre-submit checks for every app.`,
      };
    case 'reply-to-review-limit':
      return {
        title: 'Reply to every customer',
        body: `Free includes ${FREE_TIER_LIMITS.reviewRepliesPerMonth} review replies per month. Upgrade to Pro for unlimited one-tap responses.`,
      };
    case 'checklist-weekly-limit':
      return {
        title: 'You\'re using the checklist a lot',
        body: `Free includes ${FREE_TIER_LIMITS.checklistRunsPerWeek} checklist runs per week. Upgrade to Pro for unlimited pre-submit checks.`,
      };
    case 'connect-revenuecat-pro':
      return {
        title: 'Connect RevenueCat',
        body: 'See your live MRR, revenue, and active subscribers right on the Today screen — without opening another dashboard. Available on Pro.',
      };
    case 'push-notifications-pro':
      return {
        title: 'Stop refreshing ASC every 5 minutes',
        body: 'Get a push notification the moment your build moves to In Review, gets Approved, or is Ready for Sale. Pro-only — the reason this app exists.',
      };
    case 'lock-screen-widget-pro':
      return {
        title: 'One widget. Four dashboards.',
        body: 'Add the Release Pilot widget to your Lock Screen or Home Screen and see release status, reviews, and revenue at a glance. Pro-only.',
      };
    case 'live-activity-pro':
      return {
        title: 'Track review wait time live',
        body: 'A Live Activity on your Lock Screen shows exactly where your submission sits in Apple\'s review queue — no more F5 anxiety. Pro-only.',
      };
  }
}
