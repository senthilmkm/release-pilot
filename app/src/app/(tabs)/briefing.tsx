import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  DollarSign,
  MessageSquare,
  Sunrise,
  TrendingUp,
  X,
} from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';
import { useAllAppsQuery, useAllReviewsQuery, useLatestStatesQuery } from '@/lib/api/asc-queries';
import { useRevenueOverviewsQuery } from '@/lib/api/revenuecat-queries';
import { useAppRevenueCatStore } from '@/lib/state/app-revenuecat';
import { dismissRcBanner, isRcBannerDismissed } from '@/lib/state/today-banner';
import { useFreeApp } from '@/hooks/use-free-app';
import { usePaywallGate } from '@/hooks/use-paywall-gate';
import {
  buildBriefing,
  type AppBriefingCard,
  type Briefing,
} from '@/lib/domain/briefing';
import {
  isSnapshotStaleForToday,
  loadLastBriefingSnapshot,
  saveBriefingSnapshot,
} from '@/lib/domain/briefing-snapshot-store';
import type { ReviewSummary } from '@/lib/domain/review-feed';
import { StateBadge } from '@/components/state-badge';

/**
 * Daily Briefing tab — the "one screen that replaces 4 dashboards".
 *
 * Data flow:
 *  1. Reuse the same hooks the other tabs use (apps + states + reviews)
 *     so opening Briefing after Releases is instant (cache hit).
 *  2. Add `useRevenueOverviewsQuery` for RC-connected apps.
 *  3. Read the persisted baseline snapshot from MMKV synchronously.
 *  4. Decide if the baseline is still valid for "today's window" (i.e.
 *     was saved at or after the most recent 7am local). If stale, treat
 *     it as a one-shot baseline for THIS render and rotate it afterwards.
 *  5. Run the pure `buildBriefing` aggregator.
 *  6. Persist a fresh baseline ONLY when we just rotated. Mid-day
 *     re-opens leave the baseline alone, so multi-app state changes
 *     accumulate naturally throughout the day (counter never silently
 *     resets just because the user opened the tab).
 *
 * Render: a hero summary card, then per-app cards sorted by priority.
 * No revenue connected? The card shows a "Connect RevenueCat" CTA so
 * the value's discoverable inline (not just buried in More).
 */
export default function BriefingTab() {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  const appsQuery = useAllAppsQuery();
  const apps = useMemo(() => appsQuery.data?.apps ?? [], [appsQuery.data?.apps]);
  const statesQuery = useLatestStatesQuery({ apps });
  const reviewsQuery = useAllReviewsQuery({ apps });
  const rcQuery = useRevenueOverviewsQuery();
  const rcMeta = useAppRevenueCatStore((s) => s.byAscAppId);

  // Capture the "now" timestamp once at mount. `useState` with a lazy
  // initializer is the canonical way to do this — `Date.now()` runs
  // exactly once, never on re-render. Using `useRef.current` is also
  // workable but the React Compiler (correctly) flags ref reads in
  // render, and useState is purpose-built for this.
  const [nowMs] = useState(() => Date.now());

  // Synchronously hydrate the previous baseline once (MMKV is sync).
  const [persistedSnapshot] = useState(() => loadLastBriefingSnapshot());

  // Daily-window check: is the persisted baseline still inside today's
  // briefing window (post-7am-local), or did the day roll over since
  // it was saved? When stale, we still USE it as the comparison source
  // for THIS render (so the user sees what changed since yesterday)
  // and then rotate to a fresh baseline in the effect below.
  const baselineStale = useMemo(
    () => isSnapshotStaleForToday(persistedSnapshot, nowMs),
    [persistedSnapshot, nowMs],
  );
  const previousSnapshot = persistedSnapshot;

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

  // Pure computation. `buildBriefing` is side-effect-free; the snapshot
  // persistence happens in the effect below.
  const { briefing, nextSnapshot } = useMemo(
    () =>
      buildBriefing({
        apps: appsForBriefing,
        statesByAppId: statesQuery.byAppId,
        reviewsByAppId,
        revenueByAppId: rcQuery.byAppId,
        previousSnapshot,
        nowMs,
      }),
    [
      appsForBriefing,
      statesQuery.byAppId,
      reviewsByAppId,
      rcQuery.byAppId,
      previousSnapshot,
      nowMs,
    ],
  );

  // Side-effect: rotate the persisted baseline ONLY when the day has
  // rolled over (or there was no baseline at all). Mid-day re-opens
  // intentionally leave the existing baseline untouched so multi-app
  // state changes accumulate over the course of a day instead of
  // resetting to 0 every time the tab is opened.
  //
  // We do this in an effect (not render) so MMKV writes aren't doubled
  // by Strict Mode in dev.
  useEffect(() => {
    if (baselineStale) {
      saveBriefingSnapshot(nextSnapshot);
    }
  }, [baselineStale, nextSnapshot]);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        appsQuery.refetch(),
        Promise.resolve(reviewsQuery.refetch()),
        Promise.resolve(rcQuery.refetch()),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  // -- "Connect RevenueCat" banner state ------------------------------------
  // Single source of truth: show the banner iff the user has at least one
  // ASC app (otherwise there's no value to demonstrate) AND zero apps have
  // a verified RC key AND they haven't explicitly dismissed it. Read once
  // on mount via useState; the dismiss handler updates local state so the
  // banner hides immediately without waiting for a re-render from MMKV.
  const noRcConnected = useMemo(
    () => Object.values(rcMeta).every((m) => !m?.verified),
    [rcMeta],
  );
  // Top-level paywall gate — used by the banner tap handler. (The per-card
  // AppCard component instantiates its own copy inside its closure.)
  const gate = usePaywallGate();
  const [rcBannerDismissed, setRcBannerDismissed] = useState(() => isRcBannerDismissed());
  const showRcBanner = apps.length > 0 && noRcConnected && !rcBannerDismissed;
  const onDismissRcBanner = useCallback(() => {
    dismissRcBanner();
    setRcBannerDismissed(true);
  }, []);
  const onTapRcBanner = useCallback(() => {
    // RC is Pro-only — same gate as the per-card Connect button.
    // We don't auto-dismiss here either; if the user backs out without
    // converting, the banner should still be visible so they can try
    // again. They tap X to hide it permanently.
    const decision = gate.check('connect-revenuecat-pro');
    if (!decision.allowed) {
      gate.openPaywall(decision.reason);
      return;
    }
    const first = apps[0];
    if (!first) return;
    router.push({
      pathname: '/(onboarding)/revenuecat-paste',
      params: { ascAppId: first.ascId, appName: first.name, bundleId: first.bundleId },
    });
  }, [apps, gate]);

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.background }]}
      edges={['top']}
    >
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Sunrise size={22} color={palette.accent} strokeWidth={2.2} />
          <ThemedText style={[TypeScale.title1, { color: palette.text }]}>
            Today
          </ThemedText>
        </View>
        <ThemedText style={[TypeScale.subhead, { color: palette.textSecondary }]}>
          {formatTodayHeader(briefing)}
        </ThemedText>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.accent} />
        }
      >
        {showRcBanner && (
          <ConnectRcBanner onTap={onTapRcBanner} onDismiss={onDismissRcBanner} />
        )}

        <HeroSummary briefing={briefing} />

        {briefing.cards.length === 0 ? (
          <EmptyState />
        ) : (
          briefing.cards.map((card) => (
            <AppCard
              key={card.ascAppId}
              card={card}
              hasRcConnected={Boolean(rcMeta[card.ascAppId]?.verified)}
            />
          ))
        )}

        {rcQuery.errors.length > 0 && (
          <View style={[styles.errorBanner, { backgroundColor: palette.destructiveMuted, borderColor: palette.destructive }]}>
            <AlertTriangle size={16} color={palette.destructive} strokeWidth={2.2} />
            <ThemedText style={[TypeScale.footnote, { color: palette.text, flex: 1 }]}>
              Couldn&apos;t reach RevenueCat for {rcQuery.errors.length}{' '}
              app{rcQuery.errors.length === 1 ? '' : 's'}. Check the More tab to update the key{rcQuery.errors.length === 1 ? '' : 's'}.
            </ThemedText>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTodayHeader(briefing: Briefing): string {
  const date = new Date(briefing.generatedAtMs);
  const dateStr = date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
  if (briefing.previousGeneratedAtMs == null) {
    return `${dateStr} · your first briefing`;
  }
  const sinceHours = Math.round(
    (briefing.generatedAtMs - briefing.previousGeneratedAtMs) / (60 * 60 * 1000),
  );
  if (sinceHours <= 1) return `${dateStr} · changes since the last hour`;
  if (sinceHours < 36) return `${dateStr} · changes since yesterday`;
  if (sinceHours < 24 * 7) return `${dateStr} · changes since ${Math.round(sinceHours / 24)} days ago`;
  return dateStr;
}

// ---------------------------------------------------------------------------
// Connect-RevenueCat banner (top of Today tab when nothing's connected)
// ---------------------------------------------------------------------------

function ConnectRcBanner({
  onTap,
  onDismiss,
}: {
  onTap: () => void;
  onDismiss: () => void;
}) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  return (
    <View
      style={[
        styles.connectRcBanner,
        { backgroundColor: palette.accentMuted, borderColor: palette.accent },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Connect RevenueCat to see revenue, MRR, and subscribers for each of your apps"
        onPress={onTap}
        style={styles.connectRcBannerMain}
      >
        <View style={[styles.connectRcBannerIcon, { backgroundColor: palette.accent }]}>
          <DollarSign size={18} color="#FFFFFF" strokeWidth={2.4} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <ThemedText style={[TypeScale.bodyEmph, { color: palette.text }]}>
            Unlock revenue tracking
          </ThemedText>
          <ThemedText
            style={[TypeScale.footnote, { color: palette.textSecondary }]}
            numberOfLines={2}
          >
            Connect RevenueCat to see live MRR, 28-day revenue, active
            subscribers, and trial conversions for each app — right here on
            the Today tab.
          </ThemedText>
        </View>
        <ChevronRight size={18} color={palette.accent} strokeWidth={2.4} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss this prompt"
        hitSlop={12}
        onPress={onDismiss}
        style={styles.connectRcBannerDismiss}
      >
        <X size={16} color={palette.textTertiary} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Hero summary
// ---------------------------------------------------------------------------

function HeroSummary({ briefing }: { briefing: Briefing }) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  const { totals } = briefing;

  return (
    <View
      style={[
        styles.hero,
        { backgroundColor: palette.backgroundElevated, borderColor: palette.border },
      ]}
    >
      <View style={styles.heroRow}>
        <HeroStat
          icon={<ArrowRight size={18} color={palette.accent} strokeWidth={2.2} />}
          value={String(totals.appsWithStateChange)}
          label="State changes"
        />
        <HeroStat
          icon={<MessageSquare size={18} color={palette.accent} strokeWidth={2.2} />}
          value={String(totals.totalNewReviews)}
          label="New reviews"
        />
      </View>

      {totals.rcConnectedAppsCount > 0 && (
        <>
          <View
            style={[
              styles.heroSectionDivider,
              { borderTopColor: palette.border },
            ]}
          />
          <ThemedText
            style={[
              TypeScale.caption,
              { color: palette.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6 },
            ]}
          >
            Revenue · {totals.rcConnectedAppsCount} app
            {totals.rcConnectedAppsCount === 1 ? '' : 's'} connected
          </ThemedText>

          <View style={styles.heroRow}>
            {totals.totalMrr != null && totals.totalMrrCurrency ? (
              <HeroStat
                icon={<DollarSign size={18} color={palette.accent} strokeWidth={2.2} />}
                value={formatMoney(totals.totalMrr, totals.totalMrrCurrency)}
                label="MRR (all apps)"
              />
            ) : (
              <HeroStat
                icon={<DollarSign size={18} color={palette.textTertiary} strokeWidth={2.2} />}
                value="—"
                label="MRR (mixed currencies)"
              />
            )}
            {totals.totalRevenueLast28Days != null && totals.totalMrrCurrency ? (
              <HeroStat
                icon={<TrendingUp size={18} color={palette.accent} strokeWidth={2.2} />}
                value={formatMoney(totals.totalRevenueLast28Days, totals.totalMrrCurrency)}
                label="Revenue (28d)"
              />
            ) : (
              <HeroStat
                icon={<TrendingUp size={18} color={palette.textTertiary} strokeWidth={2.2} />}
                value="—"
                label="Revenue (mixed currencies)"
              />
            )}
          </View>
        </>
      )}

      {totals.totalUnrepliedLowReviews > 0 && (
        <View
          style={[
            styles.urgentRow,
            { backgroundColor: palette.destructiveMuted, borderColor: palette.destructive },
          ]}
        >
          <AlertTriangle size={16} color={palette.destructive} strokeWidth={2.4} />
          <ThemedText style={[TypeScale.subhead, { color: palette.text, flex: 1 }]}>
            {totals.totalUnrepliedLowReviews} low-rating review
            {totals.totalUnrepliedLowReviews === 1 ? '' : 's'} needs a reply
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open Reviews tab"
            onPress={() => router.push('/(tabs)/reviews')}
            hitSlop={8}
          >
            <ChevronRight size={18} color={palette.destructive} strokeWidth={2.4} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

function HeroStat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];
  return (
    <View style={styles.heroStat}>
      <View style={[styles.heroIcon, { backgroundColor: palette.accentMuted }]}>{icon}</View>
      <View>
        <ThemedText style={[TypeScale.title2, { color: palette.text }]}>{value}</ThemedText>
        <ThemedText style={[TypeScale.footnote, { color: palette.textSecondary }]}>
          {label}
        </ThemedText>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Per-app card
// ---------------------------------------------------------------------------

function AppCard({
  card,
  hasRcConnected,
}: {
  card: AppBriefingCard;
  hasRcConnected: boolean;
}) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];
  const { isLocked } = useFreeApp();
  const gate = usePaywallGate();
  const locked = isLocked(card.ascAppId);

  const handlePress = () => {
    if (locked) {
      // Locked card on free tier → straight to paywall with the
      // primary-gate reason so the right copy renders.
      gate.openPaywall('add-app-limit');
      return;
    }
    router.push({ pathname: '/(tabs)/releases/[id]', params: { id: card.ascAppId } });
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        locked
          ? `${card.appName} — Pro only, opens paywall`
          : `${card.appName} — open details`
      }
      onPress={handlePress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: palette.backgroundElevated,
          borderColor: palette.border,
          opacity: pressed ? 0.85 : locked ? 0.7 : 1,
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderText}>
          <View style={styles.cardTitleRow}>
            <ThemedText
              style={[TypeScale.bodyEmph, { color: palette.text, flexShrink: 1 }]}
              numberOfLines={1}
            >
              {card.appName}
            </ThemedText>
            {locked && <ProInlineBadge palette={palette} />}
          </View>
          {card.currentVersionLabel && (
            <ThemedText style={[TypeScale.footnote, { color: palette.textSecondary }]}>
              {card.currentVersionLabel}
            </ThemedText>
          )}
        </View>
        {card.currentState && (
          <StateBadge state={card.currentState} variant="compact" />
        )}
      </View>

      {card.stateTransition && (
        <View style={[styles.deltaRow, { backgroundColor: palette.accentMuted }]}>
          <ArrowRight size={14} color={palette.accent} strokeWidth={2.4} />
          <ThemedText style={[TypeScale.footnote, { color: palette.text, flex: 1 }]}>
            Moved from <ThemedText style={{ fontWeight: '600' }}>{prettyState(card.stateTransition.from)}</ThemedText>{' '}
            to <ThemedText style={{ fontWeight: '600' }}>{prettyState(card.stateTransition.to)}</ThemedText>
          </ThemedText>
        </View>
      )}

      {card.newReviewsCount > 0 && (
        <View style={styles.cardSubRow}>
          <MessageSquare size={14} color={palette.textSecondary} strokeWidth={2.2} />
          <ThemedText style={[TypeScale.footnote, { color: palette.textSecondary, flex: 1 }]}>
            {card.newReviewsCount} new review{card.newReviewsCount === 1 ? '' : 's'}
            {card.unrepliedLowRatingCount > 0 && (
              <ThemedText style={{ color: palette.destructive, fontWeight: '600' }}>
                {' '}· {card.unrepliedLowRatingCount} low-rating
              </ThemedText>
            )}
          </ThemedText>
        </View>
      )}

      {card.revenue.connected ? (
        <>
          <View style={styles.revenueRow}>
            <RevenueStat
              label="MRR"
              value={formatMoney(card.revenue.mrr, card.revenue.currency)}
              stale={card.revenue.stale}
            />
            <RevenueStat
              label="Active subs"
              value={String(card.revenue.activeSubscriptions)}
              stale={card.revenue.stale}
            />
            <RevenueStat
              label="Trials"
              value={String(card.revenue.activeTrials)}
              stale={card.revenue.stale}
            />
          </View>
          <View style={styles.revenueRow}>
            <RevenueStat
              label="Active users (28d)"
              value={formatCompactNumber(card.revenue.activeUsersLast28Days)}
              stale={card.revenue.stale}
            />
            <RevenueStat
              label="New customers (28d)"
              value={String(card.revenue.newCustomersLast28Days)}
              stale={card.revenue.stale}
            />
            <RevenueStat
              label="Revenue (28d)"
              value={formatMoney(card.revenue.revenueLast28Days, card.revenue.currency)}
              stale={card.revenue.stale}
            />
          </View>
        </>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Connect RevenueCat for ${card.appName}`}
          onPress={(e) => {
            e.stopPropagation?.();
            // Two layers of gating, evaluated in the right order:
            //   1. If the card's app is locked (free user, 2nd+ app),
            //      route to the "add-app-limit" paywall — explains the
            //      bigger picture rather than narrowing to "RC is Pro".
            //   2. Otherwise the user CAN see this app, so we hit the
            //      RC-specific gate. RC is always Pro-only, so free
            //      users see the "Connect RevenueCat" paywall copy.
            if (locked) {
              gate.openPaywall('add-app-limit');
              return;
            }
            const decision = gate.check('connect-revenuecat-pro');
            if (!decision.allowed) {
              gate.openPaywall(decision.reason);
              return;
            }
            router.push({
              pathname: '/(onboarding)/revenuecat-paste',
              params: { ascAppId: card.ascAppId, appName: card.appName, bundleId: card.bundleId },
            });
          }}
          style={({ pressed }) => [
            styles.connectRcRow,
            { backgroundColor: palette.backgroundSelected, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <DollarSign size={14} color={palette.accent} strokeWidth={2.4} />
          <ThemedText style={[TypeScale.footnote, { color: palette.accent, flex: 1 }]}>
            Connect RevenueCat to see MRR + subscribers
          </ThemedText>
          <ChevronRight size={14} color={palette.accent} strokeWidth={2.4} />
        </Pressable>
      )}

      {hasRcConnected &&
        card.revenue.connected === false /* should not happen if data load failed cleanly */ && (
          <ThemedText
            style={[TypeScale.caption, { color: palette.destructive, marginTop: Spacing.one }]}
          >
            Revenue temporarily unavailable.
          </ThemedText>
        )}
    </Pressable>
  );
}

function ProInlineBadge({ palette }: { palette: typeof Colors.light | typeof Colors.dark }) {
  return (
    <View style={[styles.proInlineBadge, { backgroundColor: palette.accentMuted }]}>
      <ThemedText style={[styles.proInlineBadgeText, { color: palette.accent }]}>PRO</ThemedText>
    </View>
  );
}

function RevenueStat({ label, value, stale }: { label: string; value: string; stale: boolean }) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];
  return (
    <View style={styles.revenueStat}>
      <ThemedText
        style={[TypeScale.bodyEmph, { color: stale ? palette.textTertiary : palette.text }]}
        numberOfLines={1}
      >
        {value}
      </ThemedText>
      <ThemedText
        style={[TypeScale.caption, { color: palette.textTertiary }]}
        numberOfLines={1}
      >
        {label}
        {stale ? ' (cached)' : ''}
      </ThemedText>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];
  return (
    <View
      style={[
        styles.empty,
        { backgroundColor: palette.backgroundElevated, borderColor: palette.border },
      ]}
    >
      <CheckCircle2 size={36} color={palette.successFg} strokeWidth={1.8} />
      <ThemedText style={[TypeScale.title2, styles.center, { color: palette.text }]}>
        All quiet
      </ThemedText>
      <ThemedText style={[TypeScale.body, styles.center, { color: palette.textSecondary }]}>
        No state changes or new reviews since your last visit. Check back
        tomorrow morning.
      </ThemedText>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Format an amount as a whole-dollar (no-cents) currency string to
 * match how RevenueCat's dashboard "Last 28 days" tile renders revenue
 * — keeping the Today tab visually consistent with the source of truth
 * users compare against.
 *
 * `Intl.NumberFormat` uses banker's rounding by default; for monetary
 * display ranges this is fine ($1.99 → $2, $142.37 → $142).
 */
function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${Math.round(amount)} ${currency}`;
  }
}

/**
 * 1234 → "1.2k", 1_234_567 → "1.2M". Active-user counts can get big
 * and the per-app card columns are narrow (~80pt).
 */
function formatCompactNumber(n: number): string {
  if (n < 1_000) return String(n);
  try {
    return new Intl.NumberFormat('en-US', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(n);
  } catch {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    return `${(n / 1_000).toFixed(1)}k`;
  }
}

function prettyState(state: string): string {
  return state.replace(/_/g, ' ');
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    gap: 4,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  scroll: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  hero: {
    borderRadius: Radii.lg,
    padding: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.three,
  },
  heroRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  heroSectionDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: Spacing.one,
  },
  heroStat: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  heroIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  urgentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radii.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  card: {
    borderRadius: Radii.lg,
    padding: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  cardHeaderText: {
    flex: 1,
    gap: 2,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  proInlineBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radii.sm,
  },
  proInlineBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radii.md,
  },
  cardSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  revenueRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  revenueStat: {
    flex: 1,
    gap: 2,
  },
  connectRcRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radii.md,
    minHeight: 44,
  },
  empty: {
    borderRadius: Radii.lg,
    padding: Spacing.four,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    gap: Spacing.two,
  },
  center: { textAlign: 'center' },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: Spacing.two,
  },
  connectRcBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  connectRcBannerMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  connectRcBannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectRcBannerDismiss: {
    padding: Spacing.three,
    alignSelf: 'flex-start',
  },
});
