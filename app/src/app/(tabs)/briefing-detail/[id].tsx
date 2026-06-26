import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  DollarSign,
  ExternalLink,
  HelpCircle,
  Lock,
  MessageSquare,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react-native';

import { EmptyState } from '@/components/empty-state';
import { StateBadge } from '@/components/state-badge';
import { ThemedText } from '@/components/themed-text';
import { Colors, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';
import { useFreeApp } from '@/hooks/use-free-app';
import { usePaywallGate } from '@/hooks/use-paywall-gate';
import { useAllAppsQuery, useAllReviewsQuery, useLatestStatesQuery } from '@/lib/api/asc-queries';
import {
  useRevenueCustomerMomentumQuery,
  useRevenueOverviewsQuery,
  useRevenueSubscriptionMomentumQuery,
} from '@/lib/api/revenuecat-queries';
import { buildBriefing, type AppBriefingCard } from '@/lib/domain/briefing';
import { loadLastBriefingSnapshot } from '@/lib/domain/briefing-snapshot-store';
import {
  buildTodayActionQueue,
  type TodayAction,
  type TodayActionKind,
} from '@/lib/domain/today-action-queue';
import { buildTodayReadout, type TodayReadout } from '@/lib/domain/today-readout';
import {
  buildTodaySignals,
  countAppsWithUnreadUrgentSignals,
  getSignalsForSection,
  getUnreadSignalSectionIds,
  mergeSeenSignalIds,
  type TodaySignalSectionId,
} from '@/lib/domain/today-signals';
import type { ReviewSummary } from '@/lib/domain/review-feed';
import type {
  RevenueCatCustomerMomentum,
  RevenueCatDailySeries,
  RevenueCatSubscriptionMomentum,
} from '@/lib/api/revenuecat-types';
import { syncUrgentSignalBadgeCount } from '@/lib/push/app-icon-badge';
import { useAppRevenueCatStore } from '@/lib/state/app-revenuecat';
import { getSeenTodaySignalIds, loadTodaySignalViews, markTodaySignalsSeen } from '@/lib/state/today-signal-views';

type MomentumHelpTopic = 'customers' | 'subscriptions' | 'revenue';
const REVENUECAT_DASHBOARD_URL = 'https://app.revenuecat.com';
const NEW_SIGNAL_SECTION_PRIORITY: TodaySignalSectionId[] = [
  'today-signal',
  'review-attention',
  'revenue-trend',
  'customer-momentum',
  'subscription-momentum',
];

export default function BriefingAppDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  const appsQuery = useAllAppsQuery();
  const apps = useMemo(() => appsQuery.data?.apps ?? [], [appsQuery.data?.apps]);
  const app = apps.find((a) => a.ascId === id);
  const statesQuery = useLatestStatesQuery({ apps });
  const reviewsQuery = useAllReviewsQuery({ apps });
  const rcQuery = useRevenueOverviewsQuery();
  const momentumQuery = useRevenueCustomerMomentumQuery(id);
  const subscriptionMomentumQuery = useRevenueSubscriptionMomentumQuery(id);
  const rcMeta = useAppRevenueCatStore((s) => s.byAscAppId);
  const { isLocked } = useFreeApp();
  const gate = usePaywallGate();

  const [nowMs] = useState(() => Date.now());
  const [previousSnapshot] = useState(() => loadLastBriefingSnapshot());
  const [refreshing, setRefreshing] = useState(false);
  const [helpTopic, setHelpTopic] = useState<MomentumHelpTopic | null>(null);
  const [seenSignalIds, setSeenSignalIds] = useState(() => (id ? getSeenTodaySignalIds(id) : []));
  const hasRcConnected = Boolean(id && rcMeta[id]?.verified);

  const reviewsByAppId = useMemo(() => {
    const m = new Map<string, ReviewSummary[]>();
    for (const r of reviewsQuery.reviews) {
      const arr = m.get(r.appId) ?? [];
      arr.push(r);
      m.set(r.appId, arr);
    }
    return m;
  }, [reviewsQuery.reviews]);

  const appsForBriefing = useMemo(
    () => apps.map((a) => ({ ascAppId: a.ascId, appName: a.name, bundleId: a.bundleId })),
    [apps],
  );

  const briefingCards = useMemo(() => {
    const { briefing } = buildBriefing({
      apps: appsForBriefing,
      statesByAppId: statesQuery.byAppId,
      reviewsByAppId,
      revenueByAppId: rcQuery.byAppId,
      previousSnapshot,
      nowMs,
    });
    return briefing.cards;
  }, [
    appsForBriefing,
    statesQuery.byAppId,
    reviewsByAppId,
    rcQuery.byAppId,
    previousSnapshot,
    nowMs,
  ]);
  const card = useMemo(
    () => briefingCards.find((c) => c.ascAppId === id) ?? null,
    [briefingCards, id],
  );
  const readout = useMemo(
    () =>
      card
        ? buildTodayReadout({
            card,
            customerMomentum: momentumQuery.data,
            subscriptionMomentum: subscriptionMomentumQuery.data,
          })
        : null,
    [card, momentumQuery.data, subscriptionMomentumQuery.data],
  );
  const actionQueue = useMemo(
    () =>
      card
        ? buildTodayActionQueue({
            card,
            hasRcConnected,
            customerMomentum: momentumQuery.data,
            subscriptionMomentum: subscriptionMomentumQuery.data,
          })
        : [],
    [card, hasRcConnected, momentumQuery.data, subscriptionMomentumQuery.data],
  );
  const todaySignals = useMemo(
    () =>
      card
        ? buildTodaySignals({
            card,
            customerMomentum: momentumQuery.data,
            subscriptionMomentum: subscriptionMomentumQuery.data,
          })
        : [],
    [card, momentumQuery.data, subscriptionMomentumQuery.data],
  );
  const newSignalSections = useMemo(
    () => new Set(getUnreadSignalSectionIds(todaySignals, seenSignalIds)),
    [todaySignals, seenSignalIds],
  );
  const firstNewSignalSection = useMemo(
    () => NEW_SIGNAL_SECTION_PRIORITY.find((sectionId) => newSignalSections.has(sectionId)) ?? null,
    [newSignalSections],
  );
  const sectionHasNewSignal = useCallback(
    (sectionId: TodaySignalSectionId) => newSignalSections.has(sectionId),
    [newSignalSections],
  );

  const markSectionSeen = useCallback(
    (sectionId: TodaySignalSectionId) => {
      if (!id) return;
      const sectionSignals = getSignalsForSection(todaySignals, sectionId);
      if (sectionSignals.length === 0) return;
      setSeenSignalIds((prev) => mergeSeenSignalIds(prev, sectionSignals));
      markTodaySignalsSeen(id, sectionSignals);
      void syncUrgentSignalBadgeCount(
        countAppsWithUnreadUrgentSignals(briefingCards, loadTodaySignalViews()),
      );
    },
    [briefingCards, id, todaySignals],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        appsQuery.refetch(),
        Promise.resolve(reviewsQuery.refetch()),
        Promise.resolve(rcQuery.refetch()),
        Promise.resolve(momentumQuery.refetch()),
        Promise.resolve(subscriptionMomentumQuery.refetch()),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [appsQuery, reviewsQuery, rcQuery, momentumQuery, subscriptionMomentumQuery]);

  if (!id || (!appsQuery.isLoading && !app)) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]} edges={['top']}>
        <EmptyState
          icon={AlertTriangle}
          title="App not found"
          body="The app you tried to open isn't connected anymore."
        />
      </SafeAreaView>
    );
  }

  if (id && isLocked(id)) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]} edges={['top']}>
        <View style={styles.lockedFill}>
          <View style={[styles.lockBubble, { backgroundColor: palette.accentMuted }]}>
            <Lock size={32} color={palette.accent} strokeWidth={2} />
          </View>
          <ThemedText style={[TypeScale.title2, { color: palette.text, textAlign: 'center' }]}>
            This app is Pro-only
          </ThemedText>
          <ThemedText style={[TypeScale.body, { color: palette.textSecondary, textAlign: 'center', maxWidth: 320 }]}>
            Upgrade to Pro to open briefing details for every app in your account.
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="See Pro plans"
            onPress={() => gate.openPaywall('add-app-limit')}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: palette.accent, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Sparkles size={16} color={palette.textInverse} strokeWidth={2.4} />
            <ThemedText style={[TypeScale.bodyEmph, { color: palette.textInverse }]}>
              See plans
            </ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.accent} />
        }
      >
        <Header
          appName={app?.name ?? card?.appName ?? 'App briefing'}
          bundleId={app?.bundleId ?? card?.bundleId ?? ''}
          card={card}
        />

        {!card && (appsQuery.isLoading || statesQuery.isLoading) ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={palette.accent} />
            <ThemedText style={[TypeScale.subhead, { color: palette.textSecondary }]}>
              Loading app briefing…
            </ThemedText>
          </View>
        ) : card ? (
          <>
            {readout && <TodayReadoutCard readout={readout} />}
            <ActionQueueCard
              actions={actionQueue}
              card={card}
            />
            <TodaysSignal
              card={card}
              hasNewSignal={sectionHasNewSignal('today-signal')}
              initiallyExpanded={firstNewSignalSection === 'today-signal'}
              onNewSignalViewed={() => markSectionSeen('today-signal')}
            />
            <RevenueHealth card={card} hasRcConnected={hasRcConnected} />
            <RevenueTrend
              currency={card.revenue.connected ? card.revenue.currency : 'USD'}
              hasRcConnected={hasRcConnected}
              revenue={subscriptionMomentumQuery.data?.revenue}
              isLoading={subscriptionMomentumQuery.isLoading || subscriptionMomentumQuery.isFetching}
              errorKind={subscriptionMomentumQuery.errorKind}
              onRetry={subscriptionMomentumQuery.refetch}
              onOpenHelp={() => setHelpTopic('revenue')}
              hasNewSignal={sectionHasNewSignal('revenue-trend')}
              initiallyExpanded={firstNewSignalSection === 'revenue-trend'}
              onNewSignalViewed={() => markSectionSeen('revenue-trend')}
            />
            <CustomerMomentum
              appName={card.appName}
              hasRcConnected={hasRcConnected}
              momentum={momentumQuery.data}
              isLoading={momentumQuery.isLoading || momentumQuery.isFetching}
              errorKind={momentumQuery.errorKind}
              onRetry={momentumQuery.refetch}
              onOpenHelp={() => setHelpTopic('customers')}
              hasNewSignal={sectionHasNewSignal('customer-momentum')}
              initiallyExpanded={firstNewSignalSection === 'customer-momentum'}
              onNewSignalViewed={() => markSectionSeen('customer-momentum')}
            />
            <SubscriptionMomentum
              appName={card.appName}
              hasRcConnected={hasRcConnected}
              momentum={subscriptionMomentumQuery.data}
              isLoading={subscriptionMomentumQuery.isLoading || subscriptionMomentumQuery.isFetching}
              errorKind={subscriptionMomentumQuery.errorKind}
              onRetry={subscriptionMomentumQuery.refetch}
              onOpenHelp={() => setHelpTopic('subscriptions')}
              hasNewSignal={sectionHasNewSignal('subscription-momentum')}
              initiallyExpanded={firstNewSignalSection === 'subscription-momentum'}
              onNewSignalViewed={() => markSectionSeen('subscription-momentum')}
            />
            <ReviewAttention
              card={card}
              hasNewSignal={sectionHasNewSignal('review-attention')}
              initiallyExpanded={firstNewSignalSection === 'review-attention'}
              onNewSignalViewed={() => markSectionSeen('review-attention')}
            />
            <NextActions card={card} hasRcConnected={hasRcConnected} />
          </>
        ) : (
          <EmptyState
            icon={AlertTriangle}
            title="Briefing unavailable"
            body="Pull to refresh and try again."
          />
        )}
      </ScrollView>

      <MomentumHelpModal
        topic={helpTopic}
        visible={helpTopic !== null}
        onDismiss={() => setHelpTopic(null)}
      />
    </SafeAreaView>
  );
}

function Header({
  appName,
  bundleId,
  card,
}: {
  appName: string;
  bundleId: string;
  card: AppBriefingCard | null;
}) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to Today"
        onPress={() => router.replace('/(tabs)/briefing')}
        hitSlop={12}
        style={styles.backButton}
      >
        <ArrowLeft size={22} color={palette.text} strokeWidth={2.2} />
      </Pressable>
      <View style={styles.headerText}>
        <View style={styles.headerTitleRow}>
          <ThemedText style={[TypeScale.title2, { color: palette.text, flex: 1 }]} numberOfLines={1}>
            {appName}
          </ThemedText>
          {card?.currentState && <StateBadge state={card.currentState} variant="compact" />}
        </View>
        {card?.currentVersionLabel && (
          <ThemedText style={[TypeScale.footnote, { color: palette.textSecondary }]}>
            {card.currentVersionLabel}
          </ThemedText>
        )}
        {bundleId.length > 0 && (
          <ThemedText style={[TypeScale.caption, { color: palette.textTertiary }]} numberOfLines={1}>
            {bundleId}
          </ThemedText>
        )}
      </View>
    </View>
  );
}

function TodaysSignal({
  card,
  hasNewSignal,
  initiallyExpanded,
  onNewSignalViewed,
}: {
  card: AppBriefingCard;
  hasNewSignal: boolean;
  initiallyExpanded: boolean;
  onNewSignalViewed: () => void;
}) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];
  const isRejected = card.currentState === 'rejected';
  return (
    <SectionCard
      title="Today’s Signal"
      icon={<ArrowRight size={17} color={palette.accent} strokeWidth={2.3} />}
      hasNewSignal={hasNewSignal}
      initiallyExpanded={initiallyExpanded}
      onNewSignalViewed={onNewSignalViewed}
    >
      {card.stateTransition ? (
        <View style={[styles.signalCallout, { backgroundColor: isRejected ? palette.destructiveMuted : palette.accentMuted }]}>
          {isRejected ? (
            <AlertTriangle size={18} color={palette.destructive} strokeWidth={2.4} />
          ) : (
            <CheckCircle2 size={18} color={palette.accent} strokeWidth={2.4} />
          )}
          <ThemedText style={[TypeScale.subhead, { color: palette.text, flex: 1 }]}>
            Moved from <ThemedText style={styles.strong}>{prettyState(card.stateTransition.from)}</ThemedText> to{' '}
            <ThemedText style={styles.strong}>{prettyState(card.stateTransition.to)}</ThemedText> since today’s baseline.
          </ThemedText>
        </View>
      ) : (
        <ThemedText style={[TypeScale.body, { color: palette.text }]}>
          No release state change today.
        </ThemedText>
      )}
      {card.newReviewsCount > 0 ? (
        <ThemedText style={[TypeScale.footnote, { color: palette.textSecondary }]}>
          {card.newReviewsCount} new review{card.newReviewsCount === 1 ? '' : 's'} since the last briefing
          {card.unrepliedLowRatingCount > 0
            ? `, including ${card.unrepliedLowRatingCount} unreplied low-rating review${card.unrepliedLowRatingCount === 1 ? '' : 's'}`
            : ''}.
        </ThemedText>
      ) : (
        <ThemedText style={[TypeScale.footnote, { color: palette.textSecondary }]}>
          No new reviews need attention from the daily window.
        </ThemedText>
      )}
    </SectionCard>
  );
}

function TodayReadoutCard({ readout }: { readout: TodayReadout }) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];
  return (
    <View
      style={[
        styles.readoutCard,
        { backgroundColor: palette.accentMuted, borderColor: palette.accent },
      ]}
    >
      <View style={styles.readoutHeader}>
        <Sparkles size={17} color={palette.accent} strokeWidth={2.4} />
        <ThemedText style={[TypeScale.bodyEmph, { color: palette.text }]}>
          {readout.headline}
        </ThemedText>
      </View>
      <View style={styles.readoutList}>
        {readout.bullets.map((line) => (
          <View key={line} style={styles.readoutLine}>
            <View style={[styles.readoutDot, { backgroundColor: palette.accent }]} />
            <ThemedText style={[TypeScale.footnote, { color: palette.text, flex: 1 }]}>
              {line}
            </ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

function ActionQueueCard({
  actions,
  card,
}: {
  actions: TodayAction[];
  card: AppBriefingCard;
}) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  return (
    <View
      style={[
        styles.actionQueueCard,
        { backgroundColor: palette.backgroundElevated, borderColor: palette.border },
      ]}
    >
      <View style={styles.actionQueueHeader}>
        <View style={[styles.sectionIcon, { backgroundColor: palette.accentMuted }]}>
          <CheckCircle2 size={17} color={palette.accent} strokeWidth={2.3} />
        </View>
        <View style={{ flex: 1 }}>
          <ThemedText style={[TypeScale.bodyEmph, { color: palette.text }]}>
            Action Queue
          </ThemedText>
          <ThemedText style={[TypeScale.caption, { color: palette.textTertiary }]}>
            Ranked next steps for this app
          </ThemedText>
        </View>
      </View>

      <View style={styles.actionQueueList}>
        {actions.map((action, index) => (
          <ActionQueueRow
            key={action.id}
            action={action}
            index={index}
            card={card}
          />
        ))}
      </View>
    </View>
  );
}

function ActionQueueRow({
  action,
  index,
  card,
}: {
  action: TodayAction;
  index: number;
  card: AppBriefingCard;
}) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];
  const interactive = action.kind !== 'none';
  const onPress = () => handleActionPress(action.kind, card);

  return (
    <Pressable
      accessibilityRole={interactive ? 'button' : 'text'}
      accessibilityLabel={`${index + 1}. ${action.title}. ${action.detail}`}
      accessibilityHint={interactive ? 'Opens the next step' : undefined}
      disabled={!interactive}
      onPress={interactive ? onPress : undefined}
      style={({ pressed }) => [
        styles.actionQueueRow,
        { backgroundColor: palette.backgroundSelected, opacity: pressed ? 0.75 : 1 },
      ]}
    >
      <View style={[styles.actionQueueNumber, { backgroundColor: palette.accentMuted }]}>
        <ThemedText style={[TypeScale.captionEmph, { color: palette.accent }]}>
          {index + 1}
        </ThemedText>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <ThemedText style={[TypeScale.subhead, { color: palette.text }]}>
          {action.title}
        </ThemedText>
        <ThemedText style={[TypeScale.caption, { color: palette.textSecondary }]}>
          {action.detail}
        </ThemedText>
      </View>
      {interactive && <ArrowRight size={16} color={palette.textTertiary} strokeWidth={2.2} />}
    </Pressable>
  );
}

function handleActionPress(kind: TodayActionKind, card: AppBriefingCard) {
  if (kind === 'reply_reviews') {
    router.push({
      pathname: '/(tabs)/reviews',
      params: {
        appId: card.ascAppId,
        rating: 'negative',
        status: 'needs_reply',
      },
    });
    return;
  }
  if (kind === 'open_asc') {
    void WebBrowser.openBrowserAsync(
      `https://appstoreconnect.apple.com/apps/${card.ascAppId}/appstore/ios`,
    );
    return;
  }
  if (kind === 'open_release_details') {
    router.push({ pathname: '/(tabs)/releases/[id]', params: { id: card.ascAppId } });
    return;
  }
  if (kind === 'open_revenuecat') {
    void WebBrowser.openBrowserAsync(REVENUECAT_DASHBOARD_URL);
    return;
  }
  if (kind === 'connect_revenuecat') {
    router.push({
      pathname: '/(onboarding)/revenuecat-paste',
      params: { ascAppId: card.ascAppId, appName: card.appName, bundleId: card.bundleId },
    });
  }
}

function RevenueHealth({
  card,
  hasRcConnected,
}: {
  card: AppBriefingCard;
  hasRcConnected: boolean;
}) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  if (!card.revenue.connected) {
    return (
      <SectionCard title="Revenue Health" icon={<DollarSign size={17} color={palette.accent} strokeWidth={2.3} />}>
        <ThemedText style={[TypeScale.body, { color: palette.text }]}>
          {hasRcConnected ? 'RevenueCat data is temporarily unavailable.' : 'RevenueCat is not connected for this app yet.'}
        </ThemedText>
        <ThemedText style={[TypeScale.footnote, { color: palette.textSecondary }]}>
          Connect or update the RevenueCat key to unlock MRR, customers, and subscriber context.
        </ThemedText>
      </SectionCard>
    );
  }

  const mrrPerSub =
    card.revenue.activeSubscriptions > 0
      ? card.revenue.mrr / card.revenue.activeSubscriptions
      : null;
  const trialShare =
    card.revenue.activeSubscriptions > 0
      ? card.revenue.activeTrials / card.revenue.activeSubscriptions
      : null;
  const revenuePerNewCustomer =
    card.revenue.newCustomersLast28Days > 0
      ? card.revenue.revenueLast28Days / card.revenue.newCustomersLast28Days
      : null;

  return (
    <SectionCard title="Revenue Health" icon={<DollarSign size={17} color={palette.accent} strokeWidth={2.3} />}>
      <ThemedText style={[TypeScale.body, { color: palette.text }]}>
        {formatMoney(card.revenue.mrr, card.revenue.currency)} MRR across{' '}
        {card.revenue.activeSubscriptions} active subscriber
        {card.revenue.activeSubscriptions === 1 ? '' : 's'}.
      </ThemedText>
      <MetricLine
        label="MRR / active sub"
        value={mrrPerSub == null ? '—' : formatMoney(mrrPerSub, card.revenue.currency)}
      />
      <MetricLine
        label="Trial load"
        value={
          trialShare == null
            ? `${card.revenue.activeTrials} trials`
            : `${card.revenue.activeTrials} trials · ${formatPercent(trialShare)} of active subs`
        }
      />
      <MetricLine
        label="Revenue / new customer"
        value={revenuePerNewCustomer == null ? '—' : formatMoney(revenuePerNewCustomer, card.revenue.currency)}
      />
      <ThemedText style={[TypeScale.caption, { color: palette.textTertiary }]}>
        {card.revenue.stale ? 'Cached RevenueCat data' : 'Live RevenueCat snapshot'} · updated {formatRelative(card.revenue.fetchedAtMs)}
      </ThemedText>
    </SectionCard>
  );
}

function RevenueTrend({
  currency,
  hasRcConnected,
  revenue,
  isLoading,
  errorKind,
  onRetry,
  onOpenHelp,
  hasNewSignal,
  initiallyExpanded,
  onNewSignalViewed,
}: {
  currency: string;
  hasRcConnected: boolean;
  revenue: RevenueCatDailySeries | undefined;
  isLoading: boolean;
  errorKind: string | null;
  onRetry: () => void;
  onOpenHelp: () => void;
  hasNewSignal: boolean;
  initiallyExpanded: boolean;
  onNewSignalViewed: () => void;
}) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  if (!hasRcConnected) {
    return (
      <SectionCard
        title="Revenue Trend"
        icon={<DollarSign size={17} color={palette.accent} strokeWidth={2.3} />}
        onHelpPress={onOpenHelp}
        hasNewSignal={hasNewSignal}
        initiallyExpanded={initiallyExpanded}
        onNewSignalViewed={onNewSignalViewed}
      >
        <ThemedText style={[TypeScale.body, { color: palette.text }]}>
          Connect RevenueCat to compare this app’s recent revenue against the previous 14 days.
        </ThemedText>
      </SectionCard>
    );
  }

  if (errorKind === 'forbidden_missing_scope') {
    return (
      <SectionCard
        title="Revenue Trend"
        icon={<DollarSign size={17} color={palette.accent} strokeWidth={2.3} />}
        onHelpPress={onOpenHelp}
        hasNewSignal={hasNewSignal}
        initiallyExpanded={initiallyExpanded}
        onNewSignalViewed={onNewSignalViewed}
      >
        <View style={[styles.signalCallout, { backgroundColor: palette.accentMuted }]}>
          <DollarSign size={18} color={palette.accent} strokeWidth={2.4} />
          <ThemedText style={[TypeScale.subhead, { color: palette.text, flex: 1 }]}>
            Enable Charts permission to see revenue trend.
          </ThemedText>
        </View>
        <ThemedText style={[TypeScale.footnote, { color: palette.textSecondary }]}>
          In RevenueCat, go to API keys → Secret API keys → Edit, select API version V2, then set Charts metrics permissions to Read only.
        </ThemedText>
      </SectionCard>
    );
  }

  if (errorKind) {
    return (
      <SectionCard
        title="Revenue Trend"
        icon={<DollarSign size={17} color={palette.accent} strokeWidth={2.3} />}
        onHelpPress={onOpenHelp}
        hasNewSignal={hasNewSignal}
        initiallyExpanded={initiallyExpanded}
        onNewSignalViewed={onNewSignalViewed}
      >
        <ThemedText style={[TypeScale.body, { color: palette.text }]}>
          Couldn’t load the revenue trend chart.
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry revenue trend chart"
          onPress={onRetry}
          style={({ pressed }) => [styles.secondaryButton, { borderColor: palette.border, opacity: pressed ? 0.7 : 1 }]}
        >
          <ThemedText style={[TypeScale.subhead, { color: palette.accent }]}>Retry</ThemedText>
        </Pressable>
      </SectionCard>
    );
  }

  if (isLoading || !revenue) {
    return (
      <SectionCard
        title="Revenue Trend"
        icon={<DollarSign size={17} color={palette.accent} strokeWidth={2.3} />}
        onHelpPress={onOpenHelp}
        hasNewSignal={hasNewSignal}
        initiallyExpanded={initiallyExpanded}
        onNewSignalViewed={onNewSignalViewed}
      >
        <View style={styles.inlineLoading}>
          <ActivityIndicator color={palette.accent} />
          <ThemedText style={[TypeScale.subhead, { color: palette.textSecondary }]}>
            Loading revenue trend…
          </ThemedText>
        </View>
      </SectionCard>
    );
  }

  const previousTotal = revenue.trend?.previousTotal ?? 0;
  const delta = revenue.trend?.delta ?? revenue.total - previousTotal;
  const bothPeriodsZero = revenue.total === 0 && previousTotal === 0;

  return (
    <SectionCard
      title="Revenue Trend"
      icon={<DollarSign size={17} color={palette.accent} strokeWidth={2.3} />}
      onHelpPress={onOpenHelp}
      hasNewSignal={hasNewSignal}
      initiallyExpanded={initiallyExpanded}
      onNewSignalViewed={onNewSignalViewed}
    >
      <View style={styles.momentumSummary}>
        <MetricPill label="Last 14d" value={formatMoney(revenue.total, currency)} />
        <MetricPill label="Previous 14d" value={formatMoney(previousTotal, currency)} />
        <MetricPill
          label="Best revenue day"
          value={revenue.bestDay ? `${formatMoney(revenue.bestDay.value, currency)} · ${formatShortDate(revenue.bestDay.date)}` : '—'}
        />
      </View>
      {bothPeriodsZero ? (
        <ThemedText style={[TypeScale.footnote, { color: palette.textSecondary }]}>
          No RevenueCat revenue recorded in the last 28 days yet.
        </ThemedText>
      ) : (
        <>
          <ThemedText style={[TypeScale.body, { color: palette.text }]}>
            Revenue is {delta >= 0 ? 'up' : 'down'} {formatMoney(Math.abs(delta), currency)} vs the previous 14 days.
          </ThemedText>
          <TrendCaption label="Revenue" series={revenue} />
        </>
      )}
      <ThemedText style={[TypeScale.caption, { color: palette.textTertiary }]}>
        Last 14 days · updated {formatRelative(revenue.fetchedAtMs)}
      </ThemedText>
    </SectionCard>
  );
}

function CustomerMomentum({
  appName,
  hasRcConnected,
  momentum,
  isLoading,
  errorKind,
  onRetry,
  onOpenHelp,
  hasNewSignal,
  initiallyExpanded,
  onNewSignalViewed,
}: {
  appName: string;
  hasRcConnected: boolean;
  momentum: RevenueCatCustomerMomentum | undefined;
  isLoading: boolean;
  errorKind: string | null;
  onRetry: () => void;
  onOpenHelp: () => void;
  hasNewSignal: boolean;
  initiallyExpanded: boolean;
  onNewSignalViewed: () => void;
}) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  if (!hasRcConnected) {
    return (
      <SectionCard
        title="Customer Momentum"
        icon={<BarChart3 size={17} color={palette.accent} strokeWidth={2.3} />}
        onHelpPress={onOpenHelp}
        hasNewSignal={hasNewSignal}
        initiallyExpanded={initiallyExpanded}
        onNewSignalViewed={onNewSignalViewed}
      >
        <ThemedText style={[TypeScale.body, { color: palette.text }]}>
          Connect RevenueCat to see daily new customers for {appName}.
        </ThemedText>
      </SectionCard>
    );
  }

  if (errorKind === 'forbidden_missing_scope') {
    return (
      <SectionCard
        title="Customer Momentum"
        icon={<BarChart3 size={17} color={palette.accent} strokeWidth={2.3} />}
        onHelpPress={onOpenHelp}
        hasNewSignal={hasNewSignal}
        initiallyExpanded={initiallyExpanded}
        onNewSignalViewed={onNewSignalViewed}
      >
        <View style={[styles.signalCallout, { backgroundColor: palette.accentMuted }]}>
          <BarChart3 size={18} color={palette.accent} strokeWidth={2.4} />
          <ThemedText style={[TypeScale.subhead, { color: palette.text, flex: 1 }]}>
            Enable Charts permission to see daily customer momentum.
          </ThemedText>
        </View>
        <ThemedText style={[TypeScale.footnote, { color: palette.textSecondary }]}>
          In RevenueCat, go to API keys → Secret API keys → Edit, select API version V2, then set Charts metrics permissions to Read only.
        </ThemedText>
      </SectionCard>
    );
  }

  if (errorKind) {
    return (
      <SectionCard
        title="Customer Momentum"
        icon={<BarChart3 size={17} color={palette.accent} strokeWidth={2.3} />}
        onHelpPress={onOpenHelp}
        hasNewSignal={hasNewSignal}
        initiallyExpanded={initiallyExpanded}
        onNewSignalViewed={onNewSignalViewed}
      >
        <ThemedText style={[TypeScale.body, { color: palette.text }]}>
          Couldn’t load the 14-day customer chart.
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry customer momentum chart"
          onPress={onRetry}
          style={({ pressed }) => [styles.secondaryButton, { borderColor: palette.border, opacity: pressed ? 0.7 : 1 }]}
        >
          <ThemedText style={[TypeScale.subhead, { color: palette.accent }]}>Retry</ThemedText>
        </Pressable>
      </SectionCard>
    );
  }

  if (isLoading || !momentum) {
    return (
      <SectionCard
        title="Customer Momentum"
        icon={<BarChart3 size={17} color={palette.accent} strokeWidth={2.3} />}
        onHelpPress={onOpenHelp}
        hasNewSignal={hasNewSignal}
        initiallyExpanded={initiallyExpanded}
        onNewSignalViewed={onNewSignalViewed}
      >
        <View style={styles.inlineLoading}>
          <ActivityIndicator color={palette.accent} />
          <ThemedText style={[TypeScale.subhead, { color: palette.textSecondary }]}>
            Loading 14-day chart…
          </ThemedText>
        </View>
      </SectionCard>
    );
  }

  const series = momentum.customers;
  const max = Math.max(...series.days.map((d) => d.value), 1);

  return (
    <SectionCard
      title="Customer Momentum"
      icon={<BarChart3 size={17} color={palette.accent} strokeWidth={2.3} />}
      onHelpPress={onOpenHelp}
      hasNewSignal={hasNewSignal}
      initiallyExpanded={initiallyExpanded}
      onNewSignalViewed={onNewSignalViewed}
    >
      <View style={styles.momentumSummary}>
        <MetricPill label="14-day total" value={String(series.total)} />
        <MetricPill label="Avg / day" value={series.averagePerDay.toFixed(1)} />
        <MetricPill
          label="Best day"
          value={series.bestDay ? `${series.bestDay.value} · ${formatShortDate(series.bestDay.date)}` : '—'}
        />
      </View>
      <TrendCaption label="New customers" series={series} />
      {series.total === 0 && (
        <ThemedText style={[TypeScale.footnote, { color: palette.textSecondary }]}>
          No newly seen RevenueCat customers in this 14-day window. That can simply mean no new users opened the app with RevenueCat active during the period.
        </ThemedText>
      )}
      <ThemedText style={[TypeScale.caption, { color: palette.textTertiary }]}>
        Last 14 days · updated {formatRelative(series.fetchedAtMs)}
      </ThemedText>
      <View style={styles.barList}>
        {series.days.map((day) => (
          <View key={day.date} style={styles.barRow}>
            <ThemedText style={[TypeScale.caption, styles.barDate, { color: palette.textTertiary }]}>
              {formatShortDate(day.date)}
            </ThemedText>
            <View style={[styles.barTrack, { backgroundColor: palette.backgroundSelected }]}>
              <View
                style={[
                  styles.barFill,
                  {
                    backgroundColor: day.value === 0 ? palette.textTertiary : palette.accent,
                    width: `${Math.max(3, (day.value / max) * 100)}%`,
                    opacity: day.value === 0 ? 0.25 : 1,
                  },
                ]}
              />
            </View>
            <ThemedText style={[TypeScale.captionEmph, styles.barValue, { color: palette.text }]}>
              {day.value}
            </ThemedText>
          </View>
        ))}
      </View>
    </SectionCard>
  );
}

function SubscriptionMomentum({
  appName,
  hasRcConnected,
  momentum,
  isLoading,
  errorKind,
  onRetry,
  onOpenHelp,
  hasNewSignal,
  initiallyExpanded,
  onNewSignalViewed,
}: {
  appName: string;
  hasRcConnected: boolean;
  momentum: RevenueCatSubscriptionMomentum | undefined;
  isLoading: boolean;
  errorKind: string | null;
  onRetry: () => void;
  onOpenHelp: () => void;
  hasNewSignal: boolean;
  initiallyExpanded: boolean;
  onNewSignalViewed: () => void;
}) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  if (!hasRcConnected) {
    return (
      <SectionCard
        title="Subscription Momentum"
        icon={<TrendingUp size={17} color={palette.accent} strokeWidth={2.3} />}
        onHelpPress={onOpenHelp}
        hasNewSignal={hasNewSignal}
        initiallyExpanded={initiallyExpanded}
        onNewSignalViewed={onNewSignalViewed}
      >
        <ThemedText style={[TypeScale.body, { color: palette.text }]}>
          Connect RevenueCat to see paid subscription and trial momentum for {appName}.
        </ThemedText>
      </SectionCard>
    );
  }

  if (errorKind === 'forbidden_missing_scope') {
    return (
      <SectionCard
        title="Subscription Momentum"
        icon={<TrendingUp size={17} color={palette.accent} strokeWidth={2.3} />}
        onHelpPress={onOpenHelp}
        hasNewSignal={hasNewSignal}
        initiallyExpanded={initiallyExpanded}
        onNewSignalViewed={onNewSignalViewed}
      >
        <View style={[styles.signalCallout, { backgroundColor: palette.accentMuted }]}>
          <TrendingUp size={18} color={palette.accent} strokeWidth={2.4} />
          <ThemedText style={[TypeScale.subhead, { color: palette.text, flex: 1 }]}>
            Enable Charts permission to see subscription momentum.
          </ThemedText>
        </View>
        <ThemedText style={[TypeScale.footnote, { color: palette.textSecondary }]}>
          In RevenueCat, go to API keys → Secret API keys → Edit, select API version V2, then set Charts metrics permissions to Read only.
        </ThemedText>
      </SectionCard>
    );
  }

  if (errorKind) {
    return (
      <SectionCard
        title="Subscription Momentum"
        icon={<TrendingUp size={17} color={palette.accent} strokeWidth={2.3} />}
        onHelpPress={onOpenHelp}
        hasNewSignal={hasNewSignal}
        initiallyExpanded={initiallyExpanded}
        onNewSignalViewed={onNewSignalViewed}
      >
        <ThemedText style={[TypeScale.body, { color: palette.text }]}>
          Couldn’t load the 14-day subscription chart.
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry subscription momentum chart"
          onPress={onRetry}
          style={({ pressed }) => [styles.secondaryButton, { borderColor: palette.border, opacity: pressed ? 0.7 : 1 }]}
        >
          <ThemedText style={[TypeScale.subhead, { color: palette.accent }]}>Retry</ThemedText>
        </Pressable>
      </SectionCard>
    );
  }

  if (isLoading || !momentum) {
    return (
      <SectionCard
        title="Subscription Momentum"
        icon={<TrendingUp size={17} color={palette.accent} strokeWidth={2.3} />}
        onHelpPress={onOpenHelp}
        hasNewSignal={hasNewSignal}
        initiallyExpanded={initiallyExpanded}
        onNewSignalViewed={onNewSignalViewed}
      >
        <View style={styles.inlineLoading}>
          <ActivityIndicator color={palette.accent} />
          <ThemedText style={[TypeScale.subhead, { color: palette.textSecondary }]}>
            Loading subscription momentum…
          </ThemedText>
        </View>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Subscription Momentum"
      icon={<TrendingUp size={17} color={palette.accent} strokeWidth={2.3} />}
      onHelpPress={onOpenHelp}
      hasNewSignal={hasNewSignal}
      initiallyExpanded={initiallyExpanded}
      onNewSignalViewed={onNewSignalViewed}
    >
      <View style={styles.momentumSummary}>
        <MetricPill label="New paid subs" value={String(momentum.newPaidSubscriptions.total)} />
        <MetricPill label="Trial starts" value={String(momentum.newTrials.total)} />
        <MetricPill
          label="Best paid-sub day"
          value={
            momentum.newPaidSubscriptions.bestDay
              ? `${momentum.newPaidSubscriptions.bestDay.value} · ${formatShortDate(momentum.newPaidSubscriptions.bestDay.date)}`
              : '—'
          }
        />
      </View>
      <TrendCaption label="Paid subscriptions" series={momentum.newPaidSubscriptions} />
      <TrendCaption label="Trial starts" series={momentum.newTrials} />
      <TrendCaption label="Revenue" series={momentum.revenue} />
      {momentum.newPaidSubscriptions.total === 0 && momentum.newTrials.total === 0 && (
        <ThemedText style={[TypeScale.footnote, { color: palette.textSecondary }]}>
          No new trials or paid-subscription activations in this 14-day window. Existing subscribers are still reflected in Active subs on the Today card.
        </ThemedText>
      )}
      <ThemedText style={[TypeScale.caption, { color: palette.textTertiary }]}>
        Last 14 days · updated {formatRelative(momentum.newPaidSubscriptions.fetchedAtMs)}
      </ThemedText>
      <ThemedText style={[TypeScale.caption, { color: palette.textTertiary }]}>
        Paid subs use RevenueCat’s actives_new chart: new paying subscriptions, including trial conversions, resubscriptions, and product changes.
      </ThemedText>
    </SectionCard>
  );
}

function ReviewAttention({
  card,
  hasNewSignal,
  initiallyExpanded,
  onNewSignalViewed,
}: {
  card: AppBriefingCard;
  hasNewSignal: boolean;
  initiallyExpanded: boolean;
  onNewSignalViewed: () => void;
}) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];
  const buckets = [
    { label: '5★', value: card.newReviewsByRating.fiveStar },
    { label: '4★', value: card.newReviewsByRating.fourStar },
    { label: '3★', value: card.newReviewsByRating.threeStar },
    { label: '2★', value: card.newReviewsByRating.twoStar },
    { label: '1★', value: card.newReviewsByRating.oneStar },
  ];
  const max = Math.max(...buckets.map((b) => b.value), 1);

  return (
    <SectionCard
      title="Review Attention"
      icon={<MessageSquare size={17} color={palette.accent} strokeWidth={2.3} />}
      hasNewSignal={hasNewSignal}
      initiallyExpanded={initiallyExpanded}
      onNewSignalViewed={onNewSignalViewed}
    >
      <ThemedText style={[TypeScale.body, { color: palette.text }]}>
        {card.newReviewsCount === 0
          ? 'No new reviews in the current briefing window.'
          : `${card.newReviewsCount} new review${card.newReviewsCount === 1 ? '' : 's'} since the last briefing.`}
      </ThemedText>
      {card.unrepliedLowRatingCount > 0 && (
        <View style={[styles.signalCallout, { backgroundColor: palette.destructiveMuted }]}>
          <AlertTriangle size={18} color={palette.destructive} strokeWidth={2.4} />
          <ThemedText style={[TypeScale.subhead, { color: palette.text, flex: 1 }]}>
            {card.unrepliedLowRatingCount} unreplied 1–2 star review
            {card.unrepliedLowRatingCount === 1 ? '' : 's'} should be handled first.
          </ThemedText>
        </View>
      )}
      <View style={styles.barList}>
        {buckets.map((bucket) => (
          <View key={bucket.label} style={styles.barRow}>
            <ThemedText style={[TypeScale.caption, styles.barDate, { color: palette.textTertiary }]}>
              {bucket.label}
            </ThemedText>
            <View style={[styles.barTrack, { backgroundColor: palette.backgroundSelected }]}>
              <View
                style={[
                  styles.barFill,
                  {
                    backgroundColor: bucket.value === 0 ? palette.textTertiary : palette.accent,
                    width: `${Math.max(3, (bucket.value / max) * 100)}%`,
                    opacity: bucket.value === 0 ? 0.25 : 1,
                  },
                ]}
              />
            </View>
            <ThemedText style={[TypeScale.captionEmph, styles.barValue, { color: palette.text }]}>
              {bucket.value}
            </ThemedText>
          </View>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open low-rating reviews for ${card.appName}`}
        onPress={() =>
          router.push({
            pathname: '/(tabs)/reviews',
            params: {
              appId: card.ascAppId,
              rating: 'negative',
              status: 'needs_reply',
            },
          })
        }
        style={({ pressed }) => [styles.linkButton, { opacity: pressed ? 0.7 : 1 }]}
      >
        <ThemedText style={[TypeScale.subhead, { color: palette.accent }]}>Open low-rating reviews</ThemedText>
        <ArrowRight size={15} color={palette.accent} strokeWidth={2.4} />
      </Pressable>
    </SectionCard>
  );
}

function NextActions({
  card,
  hasRcConnected,
}: {
  card: AppBriefingCard;
  hasRcConnected: boolean;
}) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];
  const actions = deriveActions(card, hasRcConnected, palette.accent);

  return (
    <SectionCard title="Next Actions" icon={<TrendingUp size={17} color={palette.accent} strokeWidth={2.3} />}>
      {actions.map((action) => (
        <Pressable
          key={action.label}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onPress}
          style={({ pressed }) => [
            styles.actionRow,
            { backgroundColor: palette.backgroundSelected, opacity: pressed ? 0.75 : 1 },
          ]}
        >
          <View style={[styles.actionIcon, { backgroundColor: palette.accentMuted }]}>
            {action.icon}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <ThemedText style={[TypeScale.bodyEmph, { color: palette.text }]}>
              {action.label}
            </ThemedText>
            <ThemedText style={[TypeScale.caption, { color: palette.textSecondary }]}>
              {action.detail}
            </ThemedText>
          </View>
          <ArrowRight size={16} color={palette.textTertiary} strokeWidth={2.2} />
        </Pressable>
      ))}
    </SectionCard>
  );
}

function deriveActions(card: AppBriefingCard, hasRcConnected: boolean, accentColor: string) {
  const openReleaseDetails = () =>
    router.push({ pathname: '/(tabs)/releases/[id]', params: { id: card.ascAppId } });
  const openAsc = () =>
    void WebBrowser.openBrowserAsync(
      `https://appstoreconnect.apple.com/apps/${card.ascAppId}/appstore/ios`,
    );
  const openReviews = () =>
    router.push({
      pathname: '/(tabs)/reviews',
      params: {
        appId: card.ascAppId,
        rating: 'negative',
        status: 'needs_reply',
      },
    });

  const actions = [
    {
      label: card.currentState === 'rejected' ? 'Read Apple’s rejection reason' : 'Open release details',
      detail: card.currentState === 'rejected'
        ? 'Jump to the app in App Store Connect and open Resolution Center.'
        : 'Review the current version and build timeline.',
      icon: card.currentState === 'rejected'
        ? <ExternalLink size={15} color={accentColor} strokeWidth={2.4} />
        : <ArrowRight size={15} color={accentColor} strokeWidth={2.4} />,
      onPress: card.currentState === 'rejected' ? openAsc : openReleaseDetails,
    },
  ];

  if (card.unrepliedLowRatingCount > 0) {
    actions.push({
      label: `Reply to ${card.unrepliedLowRatingCount} low-rating review${card.unrepliedLowRatingCount === 1 ? '' : 's'}`,
      detail: 'Handle unhappy customers while the issue is fresh.',
      icon: <MessageSquare size={15} color={accentColor} strokeWidth={2.4} />,
      onPress: openReviews,
    });
  }

  if (!hasRcConnected || !card.revenue.connected) {
    actions.push({
      label: hasRcConnected ? 'Update RevenueCat key' : 'Connect RevenueCat',
      detail: 'Unlock MRR, customer momentum, and subscriber context.',
      icon: <DollarSign size={15} color={accentColor} strokeWidth={2.4} />,
      onPress: () =>
        router.push({
          pathname: '/(onboarding)/revenuecat-paste',
          params: { ascAppId: card.ascAppId, appName: card.appName, bundleId: card.bundleId },
        }),
    });
  }

  if (actions.length === 1 && card.currentState !== 'rejected' && card.unrepliedLowRatingCount === 0) {
    actions.push({
      label: 'Nothing urgent',
      detail: 'Your release state and review queue look calm today.',
      icon: <CheckCircle2 size={15} color={accentColor} strokeWidth={2.4} />,
      onPress: () => router.push('/(tabs)/briefing'),
    });
  }

  return actions;
}

function SectionCard({
  title,
  icon,
  onHelpPress,
  hasNewSignal = false,
  initiallyExpanded = false,
  onNewSignalViewed,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  onHelpPress?: () => void;
  hasNewSignal?: boolean;
  initiallyExpanded?: boolean;
  onNewSignalViewed?: () => void;
  children: React.ReactNode;
}) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];
  const [expanded, setExpanded] = useState(() => hasNewSignal && initiallyExpanded);
  const didAutoExpand = useRef(false);
  const Chevron = expanded ? ChevronDown : ChevronRight;

  useEffect(() => {
    if (!hasNewSignal || !initiallyExpanded || didAutoExpand.current) return;
    didAutoExpand.current = true;
    setExpanded(true);
    onNewSignalViewed?.();
  }, [hasNewSignal, initiallyExpanded, onNewSignalViewed]);

  const toggleExpanded = () => {
    const next = !expanded;
    if (next && hasNewSignal) onNewSignalViewed?.();
    setExpanded(next);
  };

  return (
    <View style={[styles.sectionCard, { backgroundColor: palette.backgroundElevated, borderColor: palette.border }]}>
      <View style={styles.sectionHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} ${title}`}
          accessibilityHint="Shows or hides this card"
          onPress={toggleExpanded}
          style={({ pressed }) => [
            styles.sectionToggle,
            { opacity: pressed ? 0.75 : 1 },
          ]}
        >
          <View style={[styles.sectionIcon, { backgroundColor: palette.accentMuted }]}>{icon}</View>
          <View style={{ flex: 1 }}>
            <ThemedText style={[TypeScale.bodyEmph, { color: palette.text }]}>{title}</ThemedText>
            {!expanded && (
              <ThemedText style={[TypeScale.caption, { color: palette.textTertiary }]}>
                Tap to expand
              </ThemedText>
            )}
          </View>
          {hasNewSignal && <SectionNewBadge />}
          <Chevron size={18} color={palette.textTertiary} strokeWidth={2.2} />
        </Pressable>
        {onHelpPress && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`About ${title}`}
            accessibilityHint="Explains what these metrics mean"
            onPress={onHelpPress}
            hitSlop={10}
            style={styles.helpButton}
          >
            <HelpCircle size={17} color={palette.textTertiary} strokeWidth={2.2} />
          </Pressable>
        )}
      </View>
      {expanded && children}
    </View>
  );
}

function SectionNewBadge() {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];
  return (
    <View style={[styles.sectionNewBadge, { backgroundColor: palette.accentMuted }]}>
      <ThemedText style={[styles.sectionNewBadgeText, { color: palette.accent }]}>NEW</ThemedText>
    </View>
  );
}

function MetricLine({ label, value }: { label: string; value: string }) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];
  return (
    <View style={styles.metricLine}>
      <ThemedText style={[TypeScale.footnote, { color: palette.textSecondary }]}>{label}</ThemedText>
      <ThemedText style={[TypeScale.captionEmph, { color: palette.text }]}>{value}</ThemedText>
    </View>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];
  return (
    <View style={[styles.metricPill, { backgroundColor: palette.backgroundSelected }]}>
      <ThemedText style={[TypeScale.caption, { color: palette.textTertiary }]} numberOfLines={1}>
        {label}
      </ThemedText>
      <ThemedText style={[TypeScale.bodyEmph, { color: palette.text }]} numberOfLines={1}>
        {value}
      </ThemedText>
    </View>
  );
}

function TrendCaption({ label, series }: { label: string; series: RevenueCatDailySeries }) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];
  const trend = series.trend;
  if (!trend) return null;

  const text =
    trend.previousTotal === 0
      ? series.total > 0
        ? `${label}: new this period`
        : `${label}: flat vs previous 14d`
      : trend.delta === 0
        ? `${label}: flat vs previous 14d`
      : `${label}: ${trend.delta >= 0 ? 'up' : 'down'} ${formatPercent(Math.abs(trend.deltaPercent ?? 0))} vs previous 14d`;

  return (
    <ThemedText style={[TypeScale.caption, { color: palette.textTertiary }]}>
      {text}
    </ThemedText>
  );
}

function MomentumHelpModal({
  topic,
  visible,
  onDismiss,
}: {
  topic: MomentumHelpTopic | null;
  visible: boolean;
  onDismiss: () => void;
}) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];
  const isCustomers = topic === 'customers';
  const isRevenue = topic === 'revenue';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      accessibilityViewIsModal
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        onPress={onDismiss}
        style={styles.modalScrim}
      >
        <Pressable
          accessibilityRole="none"
          onPress={() => undefined}
          style={[
            styles.modalCard,
            { backgroundColor: palette.background, borderColor: palette.border },
          ]}
        >
          <SafeAreaView edges={['bottom']}>
            <View style={styles.modalHeader}>
              <ThemedText style={[TypeScale.title3, { color: palette.text }]}>
                {isRevenue
                  ? 'About Revenue Trend'
                  : isCustomers
                    ? 'About Customer Momentum'
                    : 'About Subscription Momentum'}
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={onDismiss}
                hitSlop={12}
                style={styles.closeButton}
              >
                <X size={20} color={palette.textSecondary} strokeWidth={2.2} />
              </Pressable>
            </View>

            {isRevenue ? (
              <>
                <HelpSection
                  title="Gross revenue chart"
                  body="Revenue Trend uses RevenueCat’s revenue chart for gross revenue over daily periods. It is not App Store proceeds after Apple commission, tax, or refunds unless your RevenueCat chart settings define it that way."
                />
                <HelpSection
                  title="Current vs previous 14 days"
                  body="Last 14d sums the visible 14-day window. Previous 14d sums the equal-length window immediately before it. The change amount and percent compare those two totals."
                />
                <HelpSection
                  title="Best revenue day"
                  body="Best revenue day is the highest daily revenue value in the visible 14-day window. If every day is zero, Release Pilot shows a dash."
                />
              </>
            ) : isCustomers ? (
              <>
                <HelpSection
                  title="New customers are not downloads"
                  body="This uses RevenueCat’s customers_new chart: app user IDs first seen by RevenueCat. It usually means new users who opened the app with RevenueCat initialized, not App Store downloads and not purchases."
                />
                <HelpSection
                  title="Best day"
                  body="Best day is the highest daily new-customer count in the visible 14-day window. If every day is zero, Release Pilot shows a dash instead of inventing a best day."
                />
                <HelpSection
                  title="Trend labels"
                  body="Trend labels compare the current 14 days against the previous 14 days. When the previous period was zero, the label says new this period or flat instead of showing a misleading infinite percentage."
                />
              </>
            ) : (
              <>
                <HelpSection
                  title="New paid subs"
                  body="This uses RevenueCat’s actives_new chart: new paying subscription activations, including trial conversions, resubscriptions, and product changes."
                />
                <HelpSection
                  title="Trial starts"
                  body="This uses RevenueCat’s trials_new chart: new subscription trials started during the 14-day window."
                />
                <HelpSection
                  title="Best paid-sub day"
                  body="Best paid-sub day is the day with the highest actives_new count in the visible 14-day window. Existing active subscribers are not counted here; they stay in Active subs on the Today card."
                />
              </>
            )}
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function HelpSection({ title, body }: { title: string; body: string }) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];
  return (
    <View style={styles.helpSection}>
      <ThemedText style={[TypeScale.bodyEmph, { color: palette.text }]}>{title}</ThemedText>
      <ThemedText style={[TypeScale.body, styles.helpBody, { color: palette.textSecondary }]}>
        {body}
      </ThemedText>
    </View>
  );
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: amount < 10 && amount > 0 ? 2 : 0,
      maximumFractionDigits: amount < 10 && amount > 0 ? 2 : 0,
    }).format(amount);
  } catch {
    return `${Math.round(amount)} ${currency}`;
  }
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatRelative(epochMs: number): string {
  const diffMs = Math.max(0, Date.now() - epochMs);
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function formatShortDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return isoDate;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function prettyState(state: string): string {
  return state.replace(/_/g, ' ');
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    paddingTop: Spacing.two,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: 2,
    paddingTop: Spacing.one,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  loadingCard: {
    borderRadius: Radii.lg,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.two,
  },
  readoutCard: {
    borderRadius: Radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  readoutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  readoutList: {
    gap: Spacing.one + 2,
  },
  readoutLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  readoutDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 7,
  },
  actionQueueCard: {
    borderRadius: Radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  actionQueueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  actionQueueList: {
    gap: Spacing.two,
  },
  actionQueueRow: {
    minHeight: 56,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  actionQueueNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionCard: {
    borderRadius: Radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  sectionToggle: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  sectionNewBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radii.sm,
  },
  sectionNewBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  sectionIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: -Spacing.two,
  },
  signalCallout: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    borderRadius: Radii.md,
    padding: Spacing.three,
  },
  strong: {
    fontWeight: '700',
  },
  metricLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  momentumSummary: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  metricPill: {
    flex: 1,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    gap: 2,
  },
  barList: {
    gap: Spacing.two,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  barDate: {
    width: 46,
  },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: 8,
    borderRadius: 4,
  },
  barValue: {
    width: 28,
    textAlign: 'right',
  },
  inlineLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  linkButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.one,
  },
  actionRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radii.md,
    padding: Spacing.three,
  },
  actionIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.three,
  },
  secondaryButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    alignSelf: 'flex-start',
  },
  lockedFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  modalScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.three,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.three,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpSection: {
    gap: Spacing.one,
    marginTop: Spacing.three,
  },
  helpBody: {
    lineHeight: 22,
  },
  lockBubble: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
