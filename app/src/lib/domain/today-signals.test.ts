import {
  buildTodaySignals,
  getUnreadSignalSectionIds,
  hasUnreadTodaySignals,
  mergeSeenSignalIds,
} from './today-signals';
import type { AppBriefingCard } from './briefing';
import type {
  RevenueCatCustomerMomentum,
  RevenueCatDailySeries,
  RevenueCatSubscriptionMomentum,
} from '@/lib/api/revenuecat-types';

const tests: { name: string; pass: boolean }[] = [];
const ok = (name: string, pass: boolean) => tests.push({ name, pass });

function series(overrides: Partial<RevenueCatDailySeries> = {}): RevenueCatDailySeries {
  return {
    days: [],
    total: 0,
    averagePerDay: 0,
    bestDay: null,
    fetchedAtMs: 1_000,
    trend: null,
    ...overrides,
  };
}

function customers(total: number): RevenueCatCustomerMomentum {
  return {
    customers: series({
      total,
      bestDay: total > 0 ? { date: '2026-06-25', value: total } : null,
    }),
  };
}

function subscriptions(args: {
  paid?: number;
  trials?: number;
  revenue?: RevenueCatDailySeries;
} = {}): RevenueCatSubscriptionMomentum {
  return {
    newPaidSubscriptions: series({ total: args.paid ?? 0 }),
    newTrials: series({ total: args.trials ?? 0 }),
    revenue: args.revenue ?? series(),
  };
}

function card(overrides: Partial<AppBriefingCard> = {}): AppBriefingCard {
  return {
    ascAppId: 'app-1',
    appName: 'Recall',
    bundleId: 'app.recall',
    currentState: 'live',
    currentVersionLabel: 'v1.0 (1)',
    stateTransition: null,
    newReviewsCount: 0,
    newReviewsByRating: {
      oneStar: 0,
      twoStar: 0,
      threeStar: 0,
      fourStar: 0,
      fiveStar: 0,
    },
    unrepliedLowRatingCount: 0,
    revenue: {
      connected: true,
      mrr: 100,
      currency: 'USD',
      activeSubscriptions: 10,
      activeTrials: 2,
      revenueLast28Days: 120,
      newCustomersLast28Days: 8,
      activeUsersLast28Days: 50,
      fetchedAtMs: 1_000,
      stale: false,
    },
    ...overrides,
  };
}

{
  const signals = buildTodaySignals({
    card: card({
      stateTransition: { from: 'submitted', to: 'in_review' },
      currentVersionLabel: 'v1.2 (8)',
    }),
  });
  ok('signals: release transition maps to Today signal section', signals[0]?.sectionId === 'today-signal');
  ok('signals: transition id includes state and version', signals[0]?.id === 'state:submitted:in_review:v1.2 (8)');
}

{
  const signals = buildTodaySignals({
    card: card({
      newReviewsCount: 4,
      unrepliedLowRatingCount: 2,
      newReviewsByRating: { oneStar: 1, twoStar: 1, threeStar: 0, fourStar: 0, fiveStar: 2 },
    }),
  });
  ok('signals: low-rating reviews map to review section', signals[0]?.sectionId === 'review-attention');
  ok('signals: low-rating id is count-specific', signals[0]?.id === 'reviews-low:2:1:1');
}

{
  const signals = buildTodaySignals({
    card: card(),
    subscriptionMomentum: subscriptions({
      revenue: series({
        total: 20,
        trend: { previousTotal: 80, delta: -60, deltaPercent: -0.75 },
      }),
    }),
  });
  ok('signals: revenue drop maps to revenue trend', signals[0]?.sectionId === 'revenue-trend');
  ok('signals: revenue drop id is stable cents', signals[0]?.id === 'revenue-drop:8000:-6000');
}

{
  const signals = buildTodaySignals({
    card: card(),
    customerMomentum: customers(3),
    subscriptionMomentum: subscriptions({ paid: 1, trials: 2 }),
  });
  ok('signals: customer momentum section present', signals.some((s) => s.sectionId === 'customer-momentum'));
  ok('signals: subscription momentum section present', signals.some((s) => s.sectionId === 'subscription-momentum'));
}

{
  const signals = buildTodaySignals({
    card: card(),
    customerMomentum: customers(0),
    subscriptionMomentum: subscriptions({
      paid: 0,
      trials: 0,
      revenue: series({ total: 0, trend: { previousTotal: 0, delta: 0, deltaPercent: null } }),
    }),
  });
  ok('signals: calm app has no signals', signals.length === 0);
}

{
  const signals = buildTodaySignals({
    card: card({
      newReviewsCount: 1,
      newReviewsByRating: { oneStar: 0, twoStar: 0, threeStar: 0, fourStar: 0, fiveStar: 1 },
    }),
  });
  ok('signals: unread when id not seen', hasUnreadTodaySignals(signals, []) === true);
  ok('signals: read when same id seen', hasUnreadTodaySignals(signals, [signals[0]?.id ?? '']) === false);
}

{
  const signals = buildTodaySignals({
    card: card({
      stateTransition: { from: 'drafting', to: 'submitted' },
      newReviewsCount: 1,
      newReviewsByRating: { oneStar: 0, twoStar: 0, threeStar: 1, fourStar: 0, fiveStar: 0 },
    }),
  });
  const unread = getUnreadSignalSectionIds(signals, [signals[0]?.id ?? '']);
  ok('signals: unread section ids exclude seen signals', unread.length === 1 && unread[0] === 'review-attention');
}

{
  const signals = buildTodaySignals({
    card: card({ stateTransition: { from: 'drafting', to: 'submitted' } }),
  });
  const merged = mergeSeenSignalIds(['old'], signals, 2);
  ok('signals: merge keeps old and new ids', merged.length === 2 && merged[0] === 'old');
  const capped = mergeSeenSignalIds(['a', 'b'], signals, 2);
  ok('signals: merge caps old ids', capped.length === 2 && capped[0] === 'b');
}

const passed = tests.filter((t) => t.pass).length;
const failed = tests.filter((t) => !t.pass);
console.log(`\ntoday-signals: ${passed}/${tests.length} passing`);
if (failed.length > 0) {
  console.log('FAILURES:');
  for (const t of failed) console.log(`  x ${t.name}`);
  process.exit(1);
}
