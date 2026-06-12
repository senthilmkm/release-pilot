import type { SemanticState } from '@/constants/theme';
import type { LatestStateSnapshot } from '@/lib/domain/version-events';
import type { ReviewSummary } from '@/lib/domain/review-feed';
import type { RevenueCatOverview } from '@/lib/api/revenuecat-types';

/**
 * Pure aggregator for the Daily Briefing tab.
 *
 * INPUT: latest per-app data the rest of the app already fetched —
 *   - ASC state snapshots (the Releases tab uses these)
 *   - ReviewSummary lists (the Reviews tab uses these)
 *   - RevenueCat overviews (per connected app)
 *   - The previous briefing's snapshot (for delta computation)
 *
 * OUTPUT: a fully-projected `Briefing` ready to render, plus a fresh
 * `BriefingSnapshot` to persist so tomorrow's briefing can compute
 * deltas from it.
 *
 * Design rules:
 *   - 100% pure / deterministic. No I/O. Easy to unit-test.
 *   - Tolerates partial data: missing reviews / states / revenue all
 *     degrade gracefully (we show "—" rather than crash).
 *   - Mixed currencies → we omit the totals MRR sum and tell the UI
 *     to render per-currency rows (or hide the rollup).
 */

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export type BriefingAppInput = {
  ascAppId: string;
  appName: string;
  bundleId: string;
};

export type BriefingInputs = {
  apps: BriefingAppInput[];
  statesByAppId: Map<string, LatestStateSnapshot>;
  reviewsByAppId: Map<string, ReviewSummary[]>;
  /** Only RC-connected apps will be in this map. */
  revenueByAppId: Map<string, RevenueCatOverview>;
  /** From MMKV — `null` on first-ever briefing. */
  previousSnapshot: BriefingSnapshot | null;
  /** Injectable for tests. */
  nowMs: number;
};

// ---------------------------------------------------------------------------
// Persisted snapshot — minimal data needed to compute deltas tomorrow
// ---------------------------------------------------------------------------

export type BriefingSnapshot = {
  atMs: number;
  /** Map of ascAppId → semantic state at the time of last briefing. */
  statesByAppId: Record<string, SemanticState>;
  /**
   * For each app, the set of review IDs we'd already seen at last
   * briefing. Anything NOT in this set on the next briefing is "new".
   * We cap to the most recent 200 IDs per app (review IDs grow forever
   * otherwise; 200 is well above typical daily review volume).
   */
  knownReviewIdsByAppId: Record<string, string[]>;
};

// ---------------------------------------------------------------------------
// Output — what the Briefing tab renders
// ---------------------------------------------------------------------------

export type StateTransition = {
  from: SemanticState;
  to: SemanticState;
};

export type ReviewBuckets = {
  oneStar: number;
  twoStar: number;
  threeStar: number;
  fourStar: number;
  fiveStar: number;
};

export type BriefingRevenue =
  | {
      connected: true;
      mrr: number;
      currency: string;
      activeSubscriptions: number;
      activeTrials: number;
      revenueLast28Days: number;
      newCustomersLast28Days: number;
      activeUsersLast28Days: number;
      fetchedAtMs: number;
      /** True iff the cached overview is older than 24h. */
      stale: boolean;
    }
  | { connected: false };

export type AppBriefingCard = {
  ascAppId: string;
  appName: string;
  bundleId: string;
  /** Current ASC state, or null if we haven't seen any version yet. */
  currentState: SemanticState | null;
  currentVersionLabel: string | null;
  /** Null on first briefing for this app, or when no transition happened. */
  stateTransition: StateTransition | null;
  /** Reviews whose ASC id wasn't in yesterday's snapshot. */
  newReviewsCount: number;
  newReviewsByRating: ReviewBuckets;
  /** New reviews ≤ 2★ that don't yet have a reply (urgent items). */
  unrepliedLowRatingCount: number;
  revenue: BriefingRevenue;
};

export type BriefingTotals = {
  /** How many apps had a state transition since last briefing. */
  appsWithStateChange: number;
  /** Total new reviews across all apps. */
  totalNewReviews: number;
  /** Across all apps + currencies. */
  totalUnrepliedLowReviews: number;
  /**
   * Sum of MRR across all RC-connected apps WHEN they all share a single
   * currency. `null` if mixed currencies (UI should hide the rollup
   * row and render per-app values instead).
   */
  totalMrr: number | null;
  totalMrrCurrency: string | null;
  totalActiveSubscriptions: number;
  totalActiveTrials: number;
  /** Sum of active users in the last 28 days across all RC-connected apps. */
  totalActiveUsersLast28Days: number;
  /** Sum of new customers in the last 28 days across all RC-connected apps. */
  totalNewCustomersLast28Days: number;
  /**
   * Sum of revenue in the last 28 days across all RC-connected apps WHEN
   * they all share a single currency. Same `null` rule as `totalMrr`.
   */
  totalRevenueLast28Days: number | null;
  rcConnectedAppsCount: number;
};

export type Briefing = {
  generatedAtMs: number;
  /** Null on first-ever briefing. */
  previousGeneratedAtMs: number | null;
  /** Per-app cards, sorted: state-changers first, then RC-connected. */
  cards: AppBriefingCard[];
  totals: BriefingTotals;
  /** `true` when no apps have any of: state change, new reviews, revenue. */
  isEmpty: boolean;
};

// ---------------------------------------------------------------------------
// Snapshot staleness threshold
// ---------------------------------------------------------------------------

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const MAX_KNOWN_REVIEW_IDS_PER_APP = 200;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildBriefing(inputs: BriefingInputs): {
  briefing: Briefing;
  nextSnapshot: BriefingSnapshot;
} {
  const cards = inputs.apps.map((app) => buildCardForApp(app, inputs));
  const sortedCards = sortCards(cards);
  const totals = computeTotals(sortedCards);

  const briefing: Briefing = {
    generatedAtMs: inputs.nowMs,
    previousGeneratedAtMs: inputs.previousSnapshot?.atMs ?? null,
    cards: sortedCards,
    totals,
    isEmpty: isBriefingEmpty(sortedCards, totals),
  };

  const nextSnapshot = projectNextSnapshot(inputs);

  return { briefing, nextSnapshot };
}

// ---------------------------------------------------------------------------
// Per-app card construction
// ---------------------------------------------------------------------------

function buildCardForApp(
  app: BriefingAppInput,
  inputs: BriefingInputs,
): AppBriefingCard {
  const state = inputs.statesByAppId.get(app.ascAppId);
  const reviews = inputs.reviewsByAppId.get(app.ascAppId) ?? [];
  const revenueRaw = inputs.revenueByAppId.get(app.ascAppId) ?? null;

  const currentState = state ? state.state : null;
  const currentVersionLabel = state ? formatVersionLabel(state) : null;
  const stateTransition = deriveStateTransition(
    app.ascAppId,
    currentState,
    inputs.previousSnapshot,
  );

  const known = new Set(
    inputs.previousSnapshot?.knownReviewIdsByAppId[app.ascAppId] ?? [],
  );
  const newReviews = inputs.previousSnapshot
    ? reviews.filter((r) => !known.has(r.ascId))
    : []; // first briefing → don't surface everything as "new"

  const newReviewsByRating = bucketReviews(newReviews);
  const unrepliedLowRatingCount = newReviews.filter(
    (r) => r.rating <= 2 && r.reply.kind === 'none',
  ).length;

  const revenue: BriefingRevenue = revenueRaw
    ? {
        connected: true,
        mrr: revenueRaw.mrr,
        currency: revenueRaw.currency,
        activeSubscriptions: revenueRaw.activeSubscriptions,
        activeTrials: revenueRaw.activeTrials,
        revenueLast28Days: revenueRaw.revenueLast28Days,
        newCustomersLast28Days: revenueRaw.newCustomersLast28Days,
        activeUsersLast28Days: revenueRaw.activeUsersLast28Days,
        fetchedAtMs: revenueRaw.fetchedAtMs,
        stale: inputs.nowMs - revenueRaw.fetchedAtMs > STALE_AFTER_MS,
      }
    : { connected: false };

  return {
    ascAppId: app.ascAppId,
    appName: app.appName,
    bundleId: app.bundleId,
    currentState,
    currentVersionLabel,
    stateTransition,
    newReviewsCount: newReviews.length,
    newReviewsByRating,
    unrepliedLowRatingCount,
    revenue,
  };
}

function deriveStateTransition(
  ascAppId: string,
  currentState: SemanticState | null,
  previousSnapshot: BriefingSnapshot | null,
): StateTransition | null {
  if (!previousSnapshot || !currentState) return null;
  const previous = previousSnapshot.statesByAppId[ascAppId];
  if (!previous) return null;
  if (previous === currentState) return null;
  return { from: previous, to: currentState };
}

function formatVersionLabel(state: LatestStateSnapshot): string | null {
  if (state.isEmpty) return null;
  const build = state.buildNumber ? ` (${state.buildNumber})` : '';
  return `v${state.versionString}${build}`;
}

function bucketReviews(reviews: ReviewSummary[]): ReviewBuckets {
  const buckets: ReviewBuckets = {
    oneStar: 0,
    twoStar: 0,
    threeStar: 0,
    fourStar: 0,
    fiveStar: 0,
  };
  for (const r of reviews) {
    if (r.rating === 1) buckets.oneStar += 1;
    else if (r.rating === 2) buckets.twoStar += 1;
    else if (r.rating === 3) buckets.threeStar += 1;
    else if (r.rating === 4) buckets.fourStar += 1;
    else if (r.rating === 5) buckets.fiveStar += 1;
  }
  return buckets;
}

// ---------------------------------------------------------------------------
// Card sorting + totals + empty detection
// ---------------------------------------------------------------------------

function sortCards(cards: AppBriefingCard[]): AppBriefingCard[] {
  // 1. State-changers first (most actionable)
  // 2. Then apps with new urgent reviews
  // 3. Then RC-connected apps (revenue snapshot is useful)
  // 4. Then alphabetical by name (stable, predictable)
  return [...cards].sort((a, b) => {
    const aScore = scoreCard(a);
    const bScore = scoreCard(b);
    if (aScore !== bScore) return bScore - aScore;
    return a.appName.localeCompare(b.appName);
  });
}

function scoreCard(card: AppBriefingCard): number {
  let score = 0;
  if (card.stateTransition) score += 1000;
  if (card.unrepliedLowRatingCount > 0) score += 100 + card.unrepliedLowRatingCount;
  if (card.newReviewsCount > 0) score += 10 + Math.min(card.newReviewsCount, 50);
  if (card.revenue.connected) score += 1;
  return score;
}

function computeTotals(cards: AppBriefingCard[]): BriefingTotals {
  let appsWithStateChange = 0;
  let totalNewReviews = 0;
  let totalUnrepliedLowReviews = 0;
  let totalActiveSubscriptions = 0;
  let totalActiveTrials = 0;
  let totalActiveUsersLast28Days = 0;
  let totalNewCustomersLast28Days = 0;
  let rcConnectedAppsCount = 0;

  // Track currencies → if we see >1 distinct currency we omit the money sums
  let mrrSum = 0;
  let revenue28dSum = 0;
  let mrrCurrency: string | null = null;
  let mrrMixed = false;

  for (const c of cards) {
    if (c.stateTransition) appsWithStateChange += 1;
    totalNewReviews += c.newReviewsCount;
    totalUnrepliedLowReviews += c.unrepliedLowRatingCount;

    if (c.revenue.connected) {
      rcConnectedAppsCount += 1;
      totalActiveSubscriptions += c.revenue.activeSubscriptions;
      totalActiveTrials += c.revenue.activeTrials;
      totalActiveUsersLast28Days += c.revenue.activeUsersLast28Days;
      totalNewCustomersLast28Days += c.revenue.newCustomersLast28Days;
      mrrSum += c.revenue.mrr;
      revenue28dSum += c.revenue.revenueLast28Days;
      if (mrrCurrency === null) {
        mrrCurrency = c.revenue.currency;
      } else if (mrrCurrency !== c.revenue.currency) {
        mrrMixed = true;
      }
    }
  }

  const moneySumsValid = !mrrMixed && rcConnectedAppsCount > 0;

  return {
    appsWithStateChange,
    totalNewReviews,
    totalUnrepliedLowReviews,
    totalMrr: moneySumsValid ? mrrSum : null,
    totalMrrCurrency: moneySumsValid ? mrrCurrency : null,
    totalActiveSubscriptions,
    totalActiveTrials,
    totalActiveUsersLast28Days,
    totalNewCustomersLast28Days,
    totalRevenueLast28Days: moneySumsValid ? revenue28dSum : null,
    rcConnectedAppsCount,
  };
}

function isBriefingEmpty(cards: AppBriefingCard[], totals: BriefingTotals): boolean {
  if (totals.appsWithStateChange > 0) return false;
  if (totals.totalNewReviews > 0) return false;
  if (totals.rcConnectedAppsCount > 0) return false;
  if (cards.length === 0) return true;
  // No state changes, no new reviews, no RC connections — first-launch case.
  return true;
}

// ---------------------------------------------------------------------------
// Snapshot projection
// ---------------------------------------------------------------------------

function projectNextSnapshot(inputs: BriefingInputs): BriefingSnapshot {
  const statesByAppId: Record<string, SemanticState> = {};
  const knownReviewIdsByAppId: Record<string, string[]> = {};

  for (const app of inputs.apps) {
    const state = inputs.statesByAppId.get(app.ascAppId);
    if (state) statesByAppId[app.ascAppId] = state.state;

    const reviews = inputs.reviewsByAppId.get(app.ascAppId) ?? [];
    // Keep the most recent N review IDs. Sorting by createdAt desc when
    // available, else fall back to insertion order.
    const sorted = [...reviews].sort((a, b) => {
      const aT = a.createdAt ? Date.parse(a.createdAt) : 0;
      const bT = b.createdAt ? Date.parse(b.createdAt) : 0;
      return bT - aT;
    });
    knownReviewIdsByAppId[app.ascAppId] = sorted
      .slice(0, MAX_KNOWN_REVIEW_IDS_PER_APP)
      .map((r) => r.ascId);
  }

  return {
    atMs: inputs.nowMs,
    statesByAppId,
    knownReviewIdsByAppId,
  };
}
