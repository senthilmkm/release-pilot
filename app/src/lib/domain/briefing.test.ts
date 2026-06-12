import { buildBriefing, type BriefingInputs, type BriefingSnapshot } from './briefing';
import type { LatestStateSnapshot } from './version-events';
import type { ReviewSummary } from './review-feed';
import type { RevenueCatOverview } from '@/lib/api/revenuecat-types';

const tests: { name: string; pass: boolean }[] = [];
const ok = (name: string, pass: boolean) => tests.push({ name, pass });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function snapshot(
  state: LatestStateSnapshot['state'],
  versionString = '1.0.0',
  buildNumber: string | null = '1',
): LatestStateSnapshot {
  return {
    state,
    versionString,
    buildNumber,
    rawState: null,
    scheduledReleaseAt: null,
    isEmpty: false,
  };
}

function review(
  ascId: string,
  rating: 1 | 2 | 3 | 4 | 5,
  options: { replied?: boolean; createdAt?: string } = {},
): ReviewSummary {
  return {
    ascId,
    appId: 'app-irrelevant',
    appName: 'irrelevant',
    rating,
    title: 't',
    body: 'b',
    reviewerNickname: 'r',
    territory: null,
    createdAt: options.createdAt ?? '2026-06-10T00:00:00Z',
    reply: options.replied
      ? { kind: 'published', body: 'thanks', lastModified: null }
      : { kind: 'none' },
  };
}

function rcOverview(overrides: Partial<RevenueCatOverview> = {}): RevenueCatOverview {
  return {
    activeTrials: 0,
    activeSubscriptions: 0,
    mrr: 0,
    revenueLast28Days: 0,
    newCustomersLast28Days: 0,
    activeUsersLast28Days: 0,
    currency: 'USD',
    fetchedAtMs: 1_000_000,
    ...overrides,
  };
}

function inputs(overrides: Partial<BriefingInputs> = {}): BriefingInputs {
  return {
    apps: [],
    statesByAppId: new Map(),
    reviewsByAppId: new Map(),
    revenueByAppId: new Map(),
    previousSnapshot: null,
    nowMs: 2_000_000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Empty inputs → empty briefing
// ---------------------------------------------------------------------------

{
  const { briefing, nextSnapshot } = buildBriefing(inputs());
  ok('empty: zero apps → empty briefing',         briefing.isEmpty === true);
  ok('empty: zero cards',                          briefing.cards.length === 0);
  ok('empty: totals all zero',
    briefing.totals.appsWithStateChange === 0 &&
    briefing.totals.totalNewReviews === 0 &&
    briefing.totals.totalMrr === null);
  ok('empty: snapshot still produced with timestamp', nextSnapshot.atMs === 2_000_000);
}

// ---------------------------------------------------------------------------
// First briefing (previousSnapshot === null) → no deltas, no "new" reviews
// ---------------------------------------------------------------------------

{
  const i = inputs({
    apps: [{ ascAppId: 'app-1', appName: 'Recall', bundleId: 'com.x.recall' }],
    statesByAppId: new Map([['app-1', snapshot('live', '1.3.0', '28')]]),
    reviewsByAppId: new Map([['app-1', [review('r1', 5), review('r2', 1)]]]),
    previousSnapshot: null,
  });
  const { briefing, nextSnapshot } = buildBriefing(i);

  ok('first: no transition (no previous to compare)',  briefing.cards[0]?.stateTransition === null);
  ok('first: no "new" reviews on first briefing',      briefing.cards[0]?.newReviewsCount === 0);
  ok('first: unreplied low count is also 0',           briefing.cards[0]?.unrepliedLowRatingCount === 0);
  ok('first: snapshot captures current state',
    nextSnapshot.statesByAppId['app-1'] === 'live');
  ok('first: snapshot remembers review ids',
    (nextSnapshot.knownReviewIdsByAppId['app-1'] ?? []).length === 2);
  ok('first: current version label assembled',
    briefing.cards[0]?.currentVersionLabel === 'v1.3.0 (28)');
}

// ---------------------------------------------------------------------------
// Second briefing — state change detected
// ---------------------------------------------------------------------------

{
  const previous: BriefingSnapshot = {
    atMs: 1_000_000,
    statesByAppId: { 'app-1': 'in_review' },
    knownReviewIdsByAppId: { 'app-1': ['r0'] },
  };
  const i = inputs({
    apps: [{ ascAppId: 'app-1', appName: 'Recall', bundleId: 'com.x.recall' }],
    statesByAppId: new Map([['app-1', snapshot('live', '1.3.0', '28')]]),
    reviewsByAppId: new Map(),
    previousSnapshot: previous,
  });
  const { briefing } = buildBriefing(i);

  ok('delta: detects state transition',
    briefing.cards[0]?.stateTransition?.from === 'in_review' &&
    briefing.cards[0]?.stateTransition?.to === 'live');
  ok('delta: appsWithStateChange counted in totals',
    briefing.totals.appsWithStateChange === 1);
  ok('delta: previousGeneratedAtMs surfaced',
    briefing.previousGeneratedAtMs === 1_000_000);
}

// State that did NOT change → no transition object
{
  const previous: BriefingSnapshot = {
    atMs: 1_000_000,
    statesByAppId: { 'app-1': 'live' },
    knownReviewIdsByAppId: {},
  };
  const i = inputs({
    apps: [{ ascAppId: 'app-1', appName: 'Recall', bundleId: 'com.x.recall' }],
    statesByAppId: new Map([['app-1', snapshot('live', '1.3.0', '28')]]),
    previousSnapshot: previous,
  });
  const { briefing } = buildBriefing(i);
  ok('delta: same state → no transition',          briefing.cards[0]?.stateTransition === null);
  ok('delta: appsWithStateChange = 0 when unchanged', briefing.totals.appsWithStateChange === 0);
}

// ---------------------------------------------------------------------------
// New reviews delta — only IDs not in previous snapshot count
// ---------------------------------------------------------------------------

{
  const previous: BriefingSnapshot = {
    atMs: 1_000_000,
    statesByAppId: { 'app-1': 'live' },
    knownReviewIdsByAppId: { 'app-1': ['r1', 'r2'] },
  };
  const i = inputs({
    apps: [{ ascAppId: 'app-1', appName: 'Recall', bundleId: 'com.x.recall' }],
    statesByAppId: new Map([['app-1', snapshot('live')]]),
    reviewsByAppId: new Map([
      ['app-1', [review('r1', 5), review('r2', 4), review('r3', 1), review('r4', 5)]],
    ]),
    previousSnapshot: previous,
  });
  const { briefing } = buildBriefing(i);

  ok('reviews: new reviews = unseen IDs',          briefing.cards[0]?.newReviewsCount === 2);
  ok('reviews: rating buckets correct',
    briefing.cards[0]?.newReviewsByRating.oneStar === 1 &&
    briefing.cards[0]?.newReviewsByRating.fiveStar === 1);
  ok('reviews: unreplied low rating tally',
    briefing.cards[0]?.unrepliedLowRatingCount === 1);
  ok('reviews: total new reviews aggregated',
    briefing.totals.totalNewReviews === 2);
}

// Replied low-rating review does NOT count as urgent
{
  const previous: BriefingSnapshot = {
    atMs: 1_000_000,
    statesByAppId: {},
    knownReviewIdsByAppId: { 'app-1': [] },
  };
  const i = inputs({
    apps: [{ ascAppId: 'app-1', appName: 'Recall', bundleId: 'com.x.recall' }],
    reviewsByAppId: new Map([
      ['app-1', [review('r-new', 1, { replied: true })]],
    ]),
    previousSnapshot: previous,
  });
  const { briefing } = buildBriefing(i);
  ok('reviews: replied low-rating not counted as urgent',
    briefing.cards[0]?.unrepliedLowRatingCount === 0);
  ok('reviews: replied low-rating still counts in newReviewsCount',
    briefing.cards[0]?.newReviewsCount === 1);
}

// ---------------------------------------------------------------------------
// Revenue projection
// ---------------------------------------------------------------------------

{
  const i = inputs({
    apps: [{ ascAppId: 'app-1', appName: 'Recall', bundleId: 'com.x.recall' }],
    statesByAppId: new Map([['app-1', snapshot('live')]]),
    revenueByAppId: new Map([
      ['app-1', rcOverview({
        mrr: 100,
        activeSubscriptions: 50,
        activeTrials: 5,
        newCustomersLast28Days: 17,
        activeUsersLast28Days: 9_812,
        revenueLast28Days: 1234.56,
        currency: 'USD',
      })],
    ]),
    previousSnapshot: null,
  });
  const { briefing } = buildBriefing(i);
  const card = briefing.cards[0]!;
  ok('revenue: connected when overview provided',
    card.revenue.connected === true);
  if (card.revenue.connected) {
    ok('revenue: maps mrr',                        card.revenue.mrr === 100);
    ok('revenue: maps activeSubscriptions',        card.revenue.activeSubscriptions === 50);
    ok('revenue: maps activeTrials',               card.revenue.activeTrials === 5);
    ok('revenue: maps newCustomersLast28Days',     card.revenue.newCustomersLast28Days === 17);
    ok('revenue: maps activeUsersLast28Days',      card.revenue.activeUsersLast28Days === 9_812);
    ok('revenue: maps revenueLast28Days',          card.revenue.revenueLast28Days === 1234.56);
  }
  ok('revenue: rollup MRR set',                    briefing.totals.totalMrr === 100);
  ok('revenue: rollup currency = USD',             briefing.totals.totalMrrCurrency === 'USD');
  ok('revenue: rcConnectedAppsCount counts it',    briefing.totals.rcConnectedAppsCount === 1);
  ok('revenue: totalActiveSubscriptions rollup',   briefing.totals.totalActiveSubscriptions === 50);
  ok('revenue: totalActiveTrials rollup',          briefing.totals.totalActiveTrials === 5);
  ok('revenue: totalActiveUsersLast28Days rollup',
    briefing.totals.totalActiveUsersLast28Days === 9_812);
  ok('revenue: totalNewCustomersLast28Days rollup',
    briefing.totals.totalNewCustomersLast28Days === 17);
  ok('revenue: totalRevenueLast28Days rollup',
    briefing.totals.totalRevenueLast28Days === 1234.56);
}

// Multi-app same-currency rollup → sums add up across apps
{
  const i = inputs({
    apps: [
      { ascAppId: 'a1', appName: 'A1', bundleId: 'com.x.a1' },
      { ascAppId: 'a2', appName: 'A2', bundleId: 'com.x.a2' },
    ],
    revenueByAppId: new Map([
      ['a1', rcOverview({
        mrr: 100, activeSubscriptions: 50, activeTrials: 5,
        newCustomersLast28Days: 10, activeUsersLast28Days: 1_000,
        revenueLast28Days: 1000, currency: 'USD',
      })],
      ['a2', rcOverview({
        mrr: 200, activeSubscriptions: 75, activeTrials: 8,
        newCustomersLast28Days: 25, activeUsersLast28Days: 4_500,
        revenueLast28Days: 2500, currency: 'USD',
      })],
    ]),
  });
  const { briefing } = buildBriefing(i);
  ok('rollup-multi: totalMrr sums',                briefing.totals.totalMrr === 300);
  ok('rollup-multi: totalActiveSubscriptions sums',briefing.totals.totalActiveSubscriptions === 125);
  ok('rollup-multi: totalActiveTrials sums',       briefing.totals.totalActiveTrials === 13);
  ok('rollup-multi: totalActiveUsersLast28Days sums',
    briefing.totals.totalActiveUsersLast28Days === 5_500);
  ok('rollup-multi: totalNewCustomersLast28Days sums',
    briefing.totals.totalNewCustomersLast28Days === 35);
  ok('rollup-multi: totalRevenueLast28Days sums',
    briefing.totals.totalRevenueLast28Days === 3500);
  ok('rollup-multi: rcConnectedAppsCount = 2',     briefing.totals.rcConnectedAppsCount === 2);
}

// App without RC → connected: false
{
  const i = inputs({
    apps: [{ ascAppId: 'app-1', appName: 'Recall', bundleId: 'com.x.recall' }],
    statesByAppId: new Map([['app-1', snapshot('live')]]),
    revenueByAppId: new Map(),
    previousSnapshot: null,
  });
  const { briefing } = buildBriefing(i);
  ok('revenue: no overview → connected:false',
    briefing.cards[0]?.revenue.connected === false);
  ok('revenue: rcConnectedAppsCount = 0 with no overviews',
    briefing.totals.rcConnectedAppsCount === 0);
  ok('revenue: rollup MRR null with no connections',
    briefing.totals.totalMrr === null);
}

// Mixed currencies → rollup MRR forced to null
{
  const i = inputs({
    apps: [
      { ascAppId: 'a1', appName: 'A1', bundleId: 'com.x.a1' },
      { ascAppId: 'a2', appName: 'A2', bundleId: 'com.x.a2' },
    ],
    statesByAppId: new Map([['a1', snapshot('live')], ['a2', snapshot('live')]]),
    revenueByAppId: new Map([
      ['a1', rcOverview({ mrr: 100, currency: 'USD' })],
      ['a2', rcOverview({ mrr: 200, currency: 'EUR' })],
    ]),
  });
  const { briefing } = buildBriefing(i);
  ok('revenue: mixed currencies → totalMrr null',  briefing.totals.totalMrr === null);
  ok('revenue: mixed currencies → totalMrrCurrency null', briefing.totals.totalMrrCurrency === null);
  ok('revenue: mixed currencies → totalRevenueLast28Days null',
    briefing.totals.totalRevenueLast28Days === null);
  ok('revenue: mixed currencies → totalActiveSubscriptions STILL summed',
    briefing.totals.totalActiveSubscriptions ===
      (i.revenueByAppId.get('a1')!.activeSubscriptions + i.revenueByAppId.get('a2')!.activeSubscriptions));
  ok('revenue: mixed currencies → totalNewCustomersLast28Days STILL summed',
    briefing.totals.totalNewCustomersLast28Days ===
      (i.revenueByAppId.get('a1')!.newCustomersLast28Days + i.revenueByAppId.get('a2')!.newCustomersLast28Days));
  ok('revenue: mixed currencies → totalActiveUsersLast28Days STILL summed',
    briefing.totals.totalActiveUsersLast28Days ===
      (i.revenueByAppId.get('a1')!.activeUsersLast28Days + i.revenueByAppId.get('a2')!.activeUsersLast28Days));
  ok('revenue: per-app MRR still preserved',
    briefing.cards.some(
      (c) => c.revenue.connected && c.revenue.mrr === 100 && c.revenue.currency === 'USD',
    ) &&
    briefing.cards.some(
      (c) => c.revenue.connected && c.revenue.mrr === 200 && c.revenue.currency === 'EUR',
    ));
}

// Stale revenue → flagged
{
  const i = inputs({
    apps: [{ ascAppId: 'a1', appName: 'A1', bundleId: 'com.x.a1' }],
    revenueByAppId: new Map([
      ['a1', rcOverview({ fetchedAtMs: 0 })], // 0 vs nowMs=2_000_000 → > 24h
    ]),
    nowMs: 100 * 24 * 60 * 60 * 1000, // way in the future
  });
  const { briefing } = buildBriefing(i);
  const r = briefing.cards[0]?.revenue;
  ok('revenue: stale flag set when fetch > 24h old',
    r?.connected === true && r.stale === true);
}

// Fresh revenue → not stale
{
  const i = inputs({
    apps: [{ ascAppId: 'a1', appName: 'A1', bundleId: 'com.x.a1' }],
    revenueByAppId: new Map([
      ['a1', rcOverview({ fetchedAtMs: 99_000_000 })],
    ]),
    nowMs: 100_000_000,
  });
  const { briefing } = buildBriefing(i);
  const r = briefing.cards[0]?.revenue;
  ok('revenue: fresh fetch → stale false',
    r?.connected === true && r.stale === false);
}

// ---------------------------------------------------------------------------
// Card sorting — state-change first, then unreplied, then RC-connected, then alpha
// ---------------------------------------------------------------------------

{
  const previous: BriefingSnapshot = {
    atMs: 1_000_000,
    statesByAppId: { boring: 'live', stateChanger: 'in_review' },
    knownReviewIdsByAppId: { boring: [], urgent: [], stateChanger: [] },
  };
  const i = inputs({
    apps: [
      { ascAppId: 'boring', appName: 'Boring', bundleId: 'com.x.boring' },
      { ascAppId: 'urgent', appName: 'Urgent', bundleId: 'com.x.urgent' },
      { ascAppId: 'stateChanger', appName: 'StateChanger', bundleId: 'com.x.sc' },
      { ascAppId: 'rcOnly', appName: 'RcOnly', bundleId: 'com.x.rc' },
    ],
    statesByAppId: new Map([
      ['boring', snapshot('live')],
      ['urgent', snapshot('live')],
      ['stateChanger', snapshot('live')],
    ]),
    reviewsByAppId: new Map([
      ['urgent', [review('low', 1)]],
    ]),
    revenueByAppId: new Map([
      ['rcOnly', rcOverview({ mrr: 50 })],
    ]),
    previousSnapshot: previous,
  });
  const { briefing } = buildBriefing(i);
  const order = briefing.cards.map((c) => c.appName);
  ok('sort: state changer first',                 order[0] === 'StateChanger');
  ok('sort: urgent low-rating second',            order[1] === 'Urgent');
  ok('sort: RC-only third (over boring)',         order[2] === 'RcOnly');
  ok('sort: boring last',                         order[3] === 'Boring');
}

// ---------------------------------------------------------------------------
// Snapshot capping — knownReviewIds truncated to top N most recent
// ---------------------------------------------------------------------------

{
  const reviews: ReviewSummary[] = [];
  for (let n = 0; n < 250; n++) {
    reviews.push(
      review(`r${n}`, 5, { createdAt: `2026-06-${String((n % 28) + 1).padStart(2, '0')}T00:00:00Z` }),
    );
  }
  const i = inputs({
    apps: [{ ascAppId: 'a1', appName: 'A', bundleId: 'com.x.a' }],
    reviewsByAppId: new Map([['a1', reviews]]),
  });
  const { nextSnapshot } = buildBriefing(i);
  const ids = nextSnapshot.knownReviewIdsByAppId['a1'] ?? [];
  ok('snapshot: cap to 200 review IDs',           ids.length === 200);
}

// ---------------------------------------------------------------------------
// isEmpty heuristic
// ---------------------------------------------------------------------------

{
  // Apps exist but no transitions, no new reviews, no RC → considered empty
  const i = inputs({
    apps: [{ ascAppId: 'app-1', appName: 'A', bundleId: 'com.x.a' }],
    statesByAppId: new Map([['app-1', snapshot('live')]]),
    previousSnapshot: {
      atMs: 1_000_000,
      statesByAppId: { 'app-1': 'live' },
      knownReviewIdsByAppId: { 'app-1': [] },
    },
  });
  const { briefing } = buildBriefing(i);
  ok('isEmpty: nothing happening → isEmpty true', briefing.isEmpty === true);
}

{
  const i = inputs({
    apps: [{ ascAppId: 'app-1', appName: 'A', bundleId: 'com.x.a' }],
    statesByAppId: new Map([['app-1', snapshot('live')]]),
    revenueByAppId: new Map([['app-1', rcOverview()]]),
  });
  const { briefing } = buildBriefing(i);
  ok('isEmpty: RC connection → isEmpty false',    briefing.isEmpty === false);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const passed = tests.filter((t) => t.pass).length;
const failed = tests.filter((t) => !t.pass);
console.log(`\nbriefing: ${passed}/${tests.length} passing`);
if (failed.length > 0) {
  console.log('FAILURES:');
  for (const t of failed) console.log(`  ✗ ${t.name}`);
  process.exit(1);
}
