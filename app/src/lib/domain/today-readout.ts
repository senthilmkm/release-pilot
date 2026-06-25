import type { AppBriefingCard } from '@/lib/domain/briefing';
import type {
  RevenueCatCustomerMomentum,
  RevenueCatDailySeries,
  RevenueCatSubscriptionMomentum,
} from '@/lib/api/revenuecat-types';

export type TodayReadout = {
  headline: string;
  bullets: string[];
};

export type TodayReadoutInput = {
  card: AppBriefingCard;
  customerMomentum?: RevenueCatCustomerMomentum;
  subscriptionMomentum?: RevenueCatSubscriptionMomentum;
};

export function buildTodayReadout({
  card,
  customerMomentum,
  subscriptionMomentum,
}: TodayReadoutInput): TodayReadout {
  const bullets = [
    revenueLine(card, subscriptionMomentum?.revenue),
    subscriptionLine(subscriptionMomentum),
    customerLine(customerMomentum),
    reviewLine(card),
    releaseLine(card),
  ].filter((line): line is string => Boolean(line));

  return {
    headline: headlineFor(card),
    bullets: bullets.slice(0, 5),
  };
}

function headlineFor(card: AppBriefingCard): string {
  if (card.currentState === 'rejected') {
    return 'Needs attention today';
  }
  if (card.unrepliedLowRatingCount > 0) {
    return 'Customer follow-up is the priority';
  }
  if (card.stateTransition) {
    return 'Release status changed';
  }
  if (card.revenue.connected) {
    return 'Business snapshot';
  }
  return 'Today’s readout';
}

function revenueLine(card: AppBriefingCard, revenue: RevenueCatDailySeries | undefined): string | null {
  if (!card.revenue.connected || !revenue) return null;

  const currency = card.revenue.currency;
  const previousTotal = revenue.trend?.previousTotal ?? 0;
  const delta = revenue.trend?.delta ?? revenue.total - previousTotal;

  if (revenue.total === 0 && previousTotal === 0) {
    return 'No RevenueCat revenue recorded in the last 28 days yet.';
  }
  if (previousTotal === 0 && revenue.total > 0) {
    return `Revenue started this period with ${formatMoney(revenue.total, currency)} in the last 14 days.`;
  }
  if (delta === 0) {
    return 'Revenue is flat vs the previous 14 days.';
  }
  return `Revenue is ${delta > 0 ? 'up' : 'down'} ${formatMoney(Math.abs(delta), currency)} vs the previous 14 days.`;
}

function subscriptionLine(momentum: RevenueCatSubscriptionMomentum | undefined): string | null {
  if (!momentum) return null;

  const paid = momentum.newPaidSubscriptions.total;
  const trials = momentum.newTrials.total;
  if (paid === 0 && trials === 0) {
    return 'No new trials or paid-subscription activations in the last 14 days.';
  }
  if (paid > 0 && trials > 0) {
    return `${paid} ${plural('new paid sub', paid)} and ${trials} ${plural('trial start', trials)} in the last 14 days.`;
  }
  if (paid > 0) {
    return `${paid} ${plural('new paid sub', paid)} in the last 14 days.`;
  }
  return `${trials} ${plural('trial start', trials)} in the last 14 days.`;
}

function customerLine(momentum: RevenueCatCustomerMomentum | undefined): string | null {
  if (!momentum) return null;
  const customers = momentum.customers.total;
  if (customers === 0) return null;
  return `${customers} newly seen RevenueCat ${plural('customer', customers)} in the last 14 days.`;
}

function reviewLine(card: AppBriefingCard): string {
  if (card.unrepliedLowRatingCount > 0) {
    return `${card.unrepliedLowRatingCount} low-rating ${plural('review', card.unrepliedLowRatingCount)} need a reply.`;
  }
  if (card.newReviewsCount > 0) {
    return `${card.newReviewsCount} new ${plural('review', card.newReviewsCount)} since the last briefing.`;
  }
  return 'No new reviews need attention.';
}

function releaseLine(card: AppBriefingCard): string {
  if (card.stateTransition) {
    return `Release moved from ${prettyState(card.stateTransition.from)} to ${prettyState(card.stateTransition.to)}.`;
  }
  return 'No release state change today.';
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
