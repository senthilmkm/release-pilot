import { buildTodayActionQueue } from './today-action-queue';
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
  return { customers: series({ total }) };
}

function subs(args: {
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
  const actions = buildTodayActionQueue({
    card: card({
      currentState: 'rejected',
      stateTransition: { from: 'in_review', to: 'rejected' },
      unrepliedLowRatingCount: 2,
    }),
    hasRcConnected: true,
    subscriptionMomentum: subs({
      paid: 0,
      trials: 4,
      revenue: series({ total: 20, trend: { previousTotal: 60, delta: -40, deltaPercent: -0.66 } }),
    }),
  });
  ok('queue: low-rating reviews are top priority', actions[0]?.id === 'reply-low-rating-reviews');
  ok('queue: rejection action included', actions.some((a) => a.id === 'read-rejection-reason'));
  ok('queue: revenue drop action included', actions.some((a) => a.id === 'investigate-revenue-drop'));
  ok('queue: capped to four actions', actions.length <= 4);
}

{
  const actions = buildTodayActionQueue({
    card: card({
      currentState: 'submitted',
      stateTransition: { from: 'drafting', to: 'submitted' },
    }),
    hasRcConnected: true,
  });
  ok('queue: non-rejected state transition opens release details', actions[0]?.kind === 'open_release_details');
  ok('queue: transition detail names states', actions[0]?.detail.includes('drafting'));
}

{
  const actions = buildTodayActionQueue({
    card: card({ revenue: { connected: false } }),
    hasRcConnected: false,
  });
  ok('queue: missing RC asks to connect', actions[0]?.id === 'connect-revenuecat');
  ok('queue: connect action kind', actions[0]?.kind === 'connect_revenuecat');
}

{
  const actions = buildTodayActionQueue({
    card: card(),
    hasRcConnected: true,
    subscriptionMomentum: subs({
      paid: 0,
      trials: 3,
      revenue: series({ total: 100, trend: { previousTotal: 80, delta: 20, deltaPercent: 0.25 } }),
    }),
  });
  ok('queue: trials without paid subs prompts conversion watch', actions[0]?.id === 'watch-trial-conversion');
  ok('queue: positive revenue does not create drop action', !actions.some((a) => a.id === 'investigate-revenue-drop'));
}

{
  const actions = buildTodayActionQueue({
    card: card(),
    hasRcConnected: true,
    customerMomentum: customers(7),
    subscriptionMomentum: subs({ paid: 0, trials: 0 }),
  });
  ok('queue: customers without trials/subs prompts funnel check', actions[0]?.id === 'check-conversion-funnel');
  ok('queue: funnel detail includes customer count', actions[0]?.detail.includes('7 newly seen customers'));
}

{
  const actions = buildTodayActionQueue({
    card: card(),
    hasRcConnected: true,
    customerMomentum: customers(0),
    subscriptionMomentum: subs({
      paid: 2,
      trials: 1,
      revenue: series({ total: 100, trend: { previousTotal: 90, delta: 10, deltaPercent: 0.11 } }),
    }),
  });
  ok('queue: calm state shows no urgent actions', actions.length === 1 && actions[0]?.kind === 'none');
}

{
  const actions = buildTodayActionQueue({
    card: card(),
    hasRcConnected: true,
    subscriptionMomentum: subs({
      revenue: series({ total: 0, trend: { previousTotal: 0, delta: 0, deltaPercent: null } }),
    }),
  });
  ok('queue: zero previous/current revenue is not a drop', !actions.some((a) => a.id === 'investigate-revenue-drop'));
}

const passed = tests.filter((t) => t.pass).length;
const failed = tests.filter((t) => !t.pass);
console.log(`\ntoday-action-queue: ${passed}/${tests.length} passing`);
if (failed.length > 0) {
  console.log('FAILURES:');
  for (const t of failed) console.log(`  x ${t.name}`);
  process.exit(1);
}
