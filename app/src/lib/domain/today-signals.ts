import type { AppBriefingCard } from '@/lib/domain/briefing';
import type {
  RevenueCatCustomerMomentum,
  RevenueCatSubscriptionMomentum,
} from '@/lib/api/revenuecat-types';

export type TodaySignalSectionId =
  | 'today-signal'
  | 'revenue-trend'
  | 'customer-momentum'
  | 'subscription-momentum'
  | 'review-attention';

export type TodaySignal = {
  id: string;
  sectionId: TodaySignalSectionId;
  urgency: 'urgent' | 'normal';
};

export type TodaySignalsInput = {
  card: AppBriefingCard;
  customerMomentum?: RevenueCatCustomerMomentum;
  subscriptionMomentum?: RevenueCatSubscriptionMomentum;
};

export function buildTodaySignals({
  card,
  customerMomentum,
  subscriptionMomentum,
}: TodaySignalsInput): TodaySignal[] {
  const signals: TodaySignal[] = [];

  if (card.stateTransition) {
    signals.push({
      id: [
        'state',
        card.stateTransition.from,
        card.stateTransition.to,
        card.currentVersionLabel ?? 'unknown-version',
      ].join(':'),
      sectionId: 'today-signal',
      urgency: card.currentState === 'rejected' ? 'urgent' : 'normal',
    });
  }

  if (card.unrepliedLowRatingCount > 0) {
    signals.push({
      id: [
        'reviews-low',
        card.unrepliedLowRatingCount,
        card.newReviewsByRating.oneStar,
        card.newReviewsByRating.twoStar,
      ].join(':'),
      sectionId: 'review-attention',
      urgency: 'urgent',
    });
  } else if (card.newReviewsCount > 0) {
    signals.push({
      id: [
        'reviews-new',
        card.newReviewsCount,
        card.newReviewsByRating.oneStar,
        card.newReviewsByRating.twoStar,
        card.newReviewsByRating.threeStar,
        card.newReviewsByRating.fourStar,
        card.newReviewsByRating.fiveStar,
      ].join(':'),
      sectionId: 'review-attention',
      urgency: 'normal',
    });
  }

  const revenue = subscriptionMomentum?.revenue;
  if (revenue?.trend) {
    if (revenue.trend.previousTotal > 0 && revenue.trend.delta < 0) {
      signals.push({
        id: `revenue-drop:${stableAmount(revenue.trend.previousTotal)}:${stableAmount(revenue.trend.delta)}`,
        sectionId: 'revenue-trend',
        urgency: 'urgent',
      });
    } else if (revenue.trend.previousTotal === 0 && revenue.total > 0) {
      signals.push({
        id: `revenue-started:${stableAmount(revenue.total)}`,
        sectionId: 'revenue-trend',
        urgency: 'normal',
      });
    }
  }

  const newCustomers = customerMomentum?.customers.total ?? 0;
  if (newCustomers > 0) {
    signals.push({
      id: `customers-new:${newCustomers}:${customerMomentum?.customers.bestDay?.date ?? 'no-best-day'}`,
      sectionId: 'customer-momentum',
      urgency: 'normal',
    });
  }

  const paid = subscriptionMomentum?.newPaidSubscriptions.total ?? 0;
  const trials = subscriptionMomentum?.newTrials.total ?? 0;
  if (paid > 0 || trials > 0) {
    signals.push({
      id: `subscriptions-new:${paid}:${trials}`,
      sectionId: 'subscription-momentum',
      urgency: 'normal',
    });
  }

  return signals;
}

export function hasUnreadTodaySignals(signals: TodaySignal[], seenSignalIds: readonly string[]): boolean {
  const seen = new Set(seenSignalIds);
  return signals.some((signal) => !seen.has(signal.id));
}

export function hasUnreadUrgentTodaySignals(signals: TodaySignal[], seenSignalIds: readonly string[]): boolean {
  const seen = new Set(seenSignalIds);
  return signals.some((signal) => signal.urgency === 'urgent' && !seen.has(signal.id));
}

export function countAppsWithUnreadUrgentSignals(
  cards: AppBriefingCard[],
  seenSignalsByAppId: Record<string, readonly string[]>,
): number {
  return cards.reduce((count, card) => {
    const signals = buildTodaySignals({ card });
    return hasUnreadUrgentTodaySignals(signals, seenSignalsByAppId[card.ascAppId] ?? [])
      ? count + 1
      : count;
  }, 0);
}

export function getUnreadSignalSectionIds(
  signals: TodaySignal[],
  seenSignalIds: readonly string[],
): TodaySignalSectionId[] {
  const seen = new Set(seenSignalIds);
  const sections = new Set<TodaySignalSectionId>();
  for (const signal of signals) {
    if (!seen.has(signal.id)) sections.add(signal.sectionId);
  }
  return [...sections];
}

export function getSignalsForSection(
  signals: TodaySignal[],
  sectionId: TodaySignalSectionId,
): TodaySignal[] {
  return signals.filter((signal) => signal.sectionId === sectionId);
}

export function mergeSeenSignalIds(
  previous: readonly string[],
  signals: TodaySignal[],
  maxIds: number = 40,
): string[] {
  const ids = new Set(previous);
  for (const signal of signals) ids.add(signal.id);
  return [...ids].slice(-maxIds);
}

function stableAmount(value: number): number {
  return Math.round(value * 100);
}
