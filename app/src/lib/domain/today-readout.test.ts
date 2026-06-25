import { buildTodayReadout } from './today-readout';
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
    customers: series({ total }),
  };
}

function subscriptions(args: {
  paid: number;
  trials: number;
  revenue?: RevenueCatDailySeries;
}): RevenueCatSubscriptionMomentum {
  return {
    newPaidSubscriptions: series({ total: args.paid }),
    newTrials: series({ total: args.trials }),
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
  const readout = buildTodayReadout({
    card: card(),
    customerMomentum: customers(4),
    subscriptionMomentum: subscriptions({
      paid: 3,
      trials: 5,
      revenue: series({
        total: 42,
        trend: { previousTotal: 20, delta: 22, deltaPercent: 1.1 },
      }),
    }),
  });
  ok('readout: business headline for connected revenue', readout.headline === 'Business snapshot');
  ok('readout: revenue up line', readout.bullets[0] === 'Revenue is up $22 vs the previous 14 days.');
  ok('readout: paid subs + trials line', readout.bullets[1] === '3 new paid subs and 5 trial starts in the last 14 days.');
  ok('readout: customer line', readout.bullets[2] === '4 newly seen RevenueCat customers in the last 14 days.');
}

{
  const readout = buildTodayReadout({
    card: card(),
    subscriptionMomentum: subscriptions({
      paid: 1,
      trials: 1,
      revenue: series({
        total: 5,
        trend: { previousTotal: 20, delta: -15, deltaPercent: -0.75 },
      }),
    }),
  });
  ok('readout: revenue down line', readout.bullets[0] === 'Revenue is down $15 vs the previous 14 days.');
  ok('readout: singular paid/trial labels', readout.bullets[1] === '1 new paid sub and 1 trial start in the last 14 days.');
}

{
  const readout = buildTodayReadout({
    card: card(),
    subscriptionMomentum: subscriptions({
      paid: 0,
      trials: 0,
      revenue: series({
        total: 0,
        trend: { previousTotal: 0, delta: 0, deltaPercent: null },
      }),
    }),
  });
  ok('readout: zero revenue line', readout.bullets[0] === 'No RevenueCat revenue recorded in the last 28 days yet.');
  ok('readout: zero subscription line', readout.bullets[1] === 'No new trials or paid-subscription activations in the last 14 days.');
}

{
  const readout = buildTodayReadout({
    card: card(),
    subscriptionMomentum: subscriptions({
      paid: 0,
      trials: 2,
      revenue: series({
        total: 12,
        trend: { previousTotal: 0, delta: 12, deltaPercent: null },
      }),
    }),
  });
  ok('readout: previous zero revenue line', readout.bullets[0] === 'Revenue started this period with $12 in the last 14 days.');
  ok('readout: trials-only line', readout.bullets[1] === '2 trial starts in the last 14 days.');
}

{
  const readout = buildTodayReadout({
    card: card({
      unrepliedLowRatingCount: 2,
      newReviewsCount: 4,
    }),
  });
  ok('readout: low review headline', readout.headline === 'Customer follow-up is the priority');
  ok('readout: low review line', readout.bullets.includes('2 low-rating reviews need a reply.'));
}

{
  const readout = buildTodayReadout({
    card: card({
      currentState: 'rejected',
      stateTransition: { from: 'in_review', to: 'rejected' },
    }),
  });
  ok('readout: rejected headline', readout.headline === 'Needs attention today');
  ok('readout: state transition line', readout.bullets.includes('Release moved from in review to rejected.'));
}

{
  const readout = buildTodayReadout({
    card: card({
      revenue: { connected: false },
    }),
  });
  ok('readout: disconnected omits revenue line', !readout.bullets.some((line) => line.startsWith('Revenue')));
  ok('readout: calm release line', readout.bullets.includes('No release state change today.'));
}

const passed = tests.filter((t) => t.pass).length;
const failed = tests.filter((t) => !t.pass);
console.log(`\ntoday-readout: ${passed}/${tests.length} passing`);
if (failed.length > 0) {
  console.log('FAILURES:');
  for (const t of failed) console.log(`  x ${t.name}`);
  process.exit(1);
}
