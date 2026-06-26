import type { AppBriefingCard } from '@/lib/domain/briefing';
import type {
  RevenueCatCustomerMomentum,
  RevenueCatDailySeries,
  RevenueCatSubscriptionMomentum,
} from '@/lib/api/revenuecat-types';

export type TodayActionKind =
  | 'reply_reviews'
  | 'open_asc'
  | 'open_release_details'
  | 'open_revenuecat'
  | 'connect_revenuecat'
  | 'none';

export type TodayAction = {
  id: string;
  title: string;
  detail: string;
  kind: TodayActionKind;
  priority: number;
};

export type TodayActionQueueInput = {
  card: AppBriefingCard;
  hasRcConnected: boolean;
  customerMomentum?: RevenueCatCustomerMomentum;
  subscriptionMomentum?: RevenueCatSubscriptionMomentum;
};

export function buildTodayActionQueue({
  card,
  hasRcConnected,
  customerMomentum,
  subscriptionMomentum,
}: TodayActionQueueInput): TodayAction[] {
  const actions: TodayAction[] = [];

  if (card.unrepliedLowRatingCount > 0) {
    actions.push({
      id: 'reply-low-rating-reviews',
      title: `Reply to ${card.unrepliedLowRatingCount} low-rating ${plural('review', card.unrepliedLowRatingCount)}`,
      detail: 'Open filtered Reviews and handle unhappy customers first.',
      kind: 'reply_reviews',
      priority: 100,
    });
  }

  if (card.currentState === 'rejected') {
    actions.push({
      id: 'read-rejection-reason',
      title: 'Read Apple’s rejection reason',
      detail: 'Open App Store Connect and check Resolution Center before changing code.',
      kind: 'open_asc',
      priority: 95,
    });
  } else if (card.stateTransition) {
    actions.push({
      id: 'review-release-change',
      title: 'Review release status change',
      detail: `Release moved from ${prettyState(card.stateTransition.from)} to ${prettyState(card.stateTransition.to)}.`,
      kind: 'open_release_details',
      priority: 80,
    });
  }

  if (!card.revenue.connected || !hasRcConnected) {
    actions.push({
      id: 'connect-revenuecat',
      title: hasRcConnected ? 'Check RevenueCat connection' : 'Connect RevenueCat',
      detail: 'Unlock revenue, customer, and subscription momentum for this app.',
      kind: 'connect_revenuecat',
      priority: 70,
    });
  } else {
    const revenue = subscriptionMomentum?.revenue;
    const revenueDrop = revenueDropAction(revenue, card.revenue.currency);
    if (revenueDrop) actions.push(revenueDrop);

    const conversion = conversionAction(subscriptionMomentum, customerMomentum);
    if (conversion) actions.push(conversion);
  }

  if (actions.length === 0) {
    return [
      {
        id: 'no-urgent-actions',
        title: 'No urgent actions',
        detail: 'Release state, review attention, and momentum signals look calm right now.',
        kind: 'none',
        priority: 0,
      },
    ];
  }

  return actions
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 4);
}

function revenueDropAction(
  revenue: RevenueCatDailySeries | undefined,
  currency: string,
): TodayAction | null {
  if (!revenue?.trend) return null;
  if (revenue.trend.previousTotal <= 0) return null;
  if (revenue.trend.delta >= 0) return null;

  return {
    id: 'investigate-revenue-drop',
    title: 'Investigate revenue drop',
    detail: `Revenue is down ${formatMoney(Math.abs(revenue.trend.delta), currency)} vs the previous 14 days.`,
    kind: 'open_revenuecat',
    priority: 65,
  };
}

function conversionAction(
  subscriptionMomentum: RevenueCatSubscriptionMomentum | undefined,
  customerMomentum: RevenueCatCustomerMomentum | undefined,
): TodayAction | null {
  const paid = subscriptionMomentum?.newPaidSubscriptions.total ?? 0;
  const trials = subscriptionMomentum?.newTrials.total ?? 0;
  const customers = customerMomentum?.customers.total ?? 0;

  if (trials > 0 && paid === 0) {
    return {
      id: 'watch-trial-conversion',
      title: 'Watch trial conversion',
      detail: `${trials} ${plural('trial start', trials)}, but no new paid subs in the last 14 days.`,
      kind: 'open_revenuecat',
      priority: 60,
    };
  }

  if (customers > 0 && trials === 0 && paid === 0) {
    return {
      id: 'check-conversion-funnel',
      title: 'Check conversion funnel',
      detail: `${customers} newly seen ${plural('customer', customers)}, but no trial starts or new paid subs yet.`,
      kind: 'open_revenuecat',
      priority: 55,
    };
  }

  return null;
}

function plural(label: string, value: number): string {
  return value === 1 ? label : `${label}s`;
}

function prettyState(state: string): string {
  return state.replace(/_/g, ' ');
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: amount > 0 && amount < 10 ? 2 : 0,
      maximumFractionDigits: amount > 0 && amount < 10 ? 2 : 0,
    }).format(amount);
  } catch {
    return `${Math.round(amount)} ${currency}`;
  }
}
