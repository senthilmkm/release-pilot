import React, { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  LayoutDashboard,
  LayoutGrid,
  Lock,
  MoveRight,
  Sparkles,
} from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radii, Spacing, TypeScale } from '@/constants/theme';
import { StateColors, StateLabels, type SemanticState } from '@/constants/state-tokens';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';
import { useEntitlement } from '@/hooks/use-entitlement';
import { usePaywallGate } from '@/hooks/use-paywall-gate';

/**
 * Mirrors `HERO_PRIORITY` in `lib/native/widget-app-state.ts`. Listed
 * in priority order (top = first to occupy the lock-screen / small
 * widget hero slot). Update both in lockstep — these explanations are
 * the user-facing rationale for the ranking.
 */
const HERO_PRIORITY_DESCRIPTIONS: { state: SemanticState; why: string }[] = [
  { state: 'rejected',           why: 'Blocked — Apple rejected your build, you must fix it.' },
  { state: 'approved_waiting',   why: 'You can tap "Release" right now to ship it.' },
  { state: 'in_review',          why: 'Apple is actively reviewing your build.' },
  { state: 'approved_scheduled', why: 'Apple will auto-release on the scheduled date.' },
  { state: 'submitted',          why: 'In Apple\u2019s queue, waiting to enter review.' },
  { state: 'drafting',           why: 'You\u2019re actively preparing the next release.' },
  { state: 'live',               why: 'Shipped \u2014 nothing to do, lowest signal value.' },
];

/**
 * "How to add the Lock-Screen / Home-Screen widget" marketing + how-to
 * screen.
 *
 * Why a dedicated screen rather than burying this in the More tab:
 *  - iOS hides the widget-add flow behind a long-press gesture nobody
 *    discovers. Step-by-step instructions noticeably increase widget
 *    adoption (the whole "replaces 4 dashboards" promise depends on it).
 *  - Doubles as a paywall pitch for free users — explains the value
 *    BEFORE asking them to upgrade.
 *
 * Pro users see a "Tip: long-press your Lock Screen…" guide.
 * Free users see the same guide PLUS an "Upgrade to unlock" CTA at the
 * bottom. We intentionally show the steps either way because (a) users
 * appreciate transparency, and (b) the "you almost have it" feeling is
 * a stronger conversion driver than hiding the steps.
 */
export default function WidgetInstructionsScreen() {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];
  const { isPro } = useEntitlement();
  const paywall = usePaywallGate();

  const handleUpgrade = useCallback(() => {
    paywall.openPaywall('lock-screen-widget-pro');
  }, [paywall]);

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.background }]}
      edges={['top']}
    >
      {/* --- Header bar --- */}
      <View style={styles.headerBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={12}
          onPress={() => router.back()}
        >
          <ChevronLeft size={26} color={palette.text} strokeWidth={2.2} />
        </Pressable>
        <ThemedText style={[TypeScale.title3, { color: palette.text }]}>
          Lock Screen widget
        </ThemedText>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* --- Hero --- */}
        <View
          style={[
            styles.hero,
            {
              backgroundColor: palette.accentMuted,
              borderColor: palette.accent,
            },
          ]}
        >
          <View style={styles.heroIconRow}>
            <Lock size={20} color={palette.accent} strokeWidth={2.2} />
            <LayoutGrid size={20} color={palette.accent} strokeWidth={2.2} />
            <LayoutDashboard size={20} color={palette.accent} strokeWidth={2.2} />
          </View>
          <ThemedText style={[TypeScale.title2, { color: palette.text }]}>
            One widget. Four dashboards.
          </ThemedText>
          <ThemedText style={[TypeScale.body, { color: palette.textSecondary }]}>
            See release status, reviews, and revenue at a glance — without
            opening ASC, RevenueCat, or even Release Pilot.
          </ThemedText>
        </View>

        {/* --- Sizes available --- */}
        <SectionLabel palette={palette}>AVAILABLE SIZES</SectionLabel>
        <View style={[styles.card, { backgroundColor: palette.backgroundElevated }]}>
          {(
            [
              { kind: 'Lock Screen · Rectangle', body: 'One app + state + version, on your Lock Screen.' },
              { kind: 'Lock Screen · Circular',  body: 'A count of apps in review or pending action.' },
              { kind: 'Lock Screen · Inline',    body: 'A single line above the clock.' },
              { kind: 'Home · Small',            body: 'One hero app with state badge.' },
              { kind: 'Home · Medium',           body: 'Up to 3 apps as rows.' },
              { kind: 'Home · Large',            body: 'Up to 6 apps as rows.' },
            ] as const
          ).map((row, i, arr) => (
            <View
              key={row.kind}
              style={[
                styles.row,
                i < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border },
              ]}
            >
              <ThemedText style={[TypeScale.bodyEmph, { color: palette.text }]}>{row.kind}</ThemedText>
              <ThemedText style={[TypeScale.footnote, { color: palette.textSecondary }]}>{row.body}</ThemedText>
            </View>
          ))}
        </View>

        {/* --- Steps --- */}
        <SectionLabel palette={palette}>HOW TO ADD IT</SectionLabel>
        <View style={[styles.card, { backgroundColor: palette.backgroundElevated, gap: Spacing.three }]}>
          <Step n={1} palette={palette}>
            Long-press your Lock Screen (or Home Screen) and tap{' '}
            <ThemedText style={[TypeScale.bodyEmph, { color: palette.text }]}>Customise</ThemedText>.
          </Step>
          <Step n={2} palette={palette}>
            Tap the area where you want the widget, then{' '}
            <ThemedText style={[TypeScale.bodyEmph, { color: palette.text }]}>Add Widgets</ThemedText>.
          </Step>
          <Step n={3} palette={palette}>
            Search for{' '}
            <ThemedText style={[TypeScale.bodyEmph, { color: palette.text }]}>Release Pilot</ThemedText>{' '}
            and pick a size.
          </Step>
          <Step n={4} palette={palette}>Tap{' '}
            <ThemedText style={[TypeScale.bodyEmph, { color: palette.text }]}>Done</ThemedText>{' '}
            and you&apos;re set — the widget updates as your data refreshes.
          </Step>
        </View>

        {/* --- Which app gets the spotlight --- */}
        <SectionLabel palette={palette}>WHICH APP GETS THE SPOTLIGHT?</SectionLabel>
        <ThemedText style={[TypeScale.footnote, styles.sectionIntro, { color: palette.textSecondary }]}>
          Lock Screen and small widgets show one app at a time — the one most
          needing your attention. Apps are ranked top-to-bottom:
        </ThemedText>
        <View style={[styles.card, { backgroundColor: palette.backgroundElevated }]}>
          {HERO_PRIORITY_DESCRIPTIONS.map((row, i, arr) => {
            const colors = StateColors[scheme][row.state];
            return (
              <View
                key={row.state}
                style={[
                  styles.priorityRow,
                  i < arr.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: palette.border,
                  },
                ]}
              >
                <ThemedText
                  style={[
                    TypeScale.footnote,
                    styles.priorityRank,
                    { color: palette.textTertiary },
                  ]}
                >
                  {i + 1}
                </ThemedText>
                <View style={styles.priorityBody}>
                  <View
                    style={[
                      styles.priorityBadge,
                      { backgroundColor: colors.bg },
                    ]}
                  >
                    <ThemedText
                      style={[TypeScale.caption, { color: colors.fg, fontWeight: '600' }]}
                    >
                      {StateLabels[row.state]}
                    </ThemedText>
                  </View>
                  <ThemedText style={[TypeScale.footnote, { color: palette.textSecondary }]}>
                    {row.why}
                  </ThemedText>
                </View>
              </View>
            );
          })}
        </View>
        <ThemedText style={[TypeScale.footnote, styles.sectionFootnote, { color: palette.textTertiary }]}>
          Ties are broken alphabetically by app name. Pro widgets (medium &amp;
          large) show your top 3–6 apps in this same order.
        </ThemedText>

        {/* --- Pro CTA --- */}
        {!isPro && (
          <>
            <SectionLabel palette={palette}>UPGRADE</SectionLabel>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Upgrade to Release Pilot Pro to unlock the widget"
              onPress={handleUpgrade}
              style={[
                styles.card,
                styles.upgradeCard,
                { backgroundColor: palette.accent, borderColor: palette.accent },
              ]}
            >
              <View style={styles.upgradeIconBubble}>
                <Sparkles size={20} color="white" strokeWidth={2.4} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={[TypeScale.title3, { color: 'white' }]}>
                  Unlock with Pro
                </ThemedText>
                <ThemedText style={[TypeScale.footnote, { color: 'rgba(255,255,255,0.85)' }]}>
                  Free shows 1 app. Pro unlocks every app you ship — across every
                  widget size and on the Lock Screen.
                </ThemedText>
              </View>
              <MoveRight size={20} color="white" strokeWidth={2.4} />
            </Pressable>
          </>
        )}

        {isPro && (
          <ThemedText style={[TypeScale.footnote, styles.proHint, { color: palette.textTertiary }]}>
            You&apos;re on Pro — widget data refreshes automatically as Release Pilot
            polls App Store Connect.
          </ThemedText>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------

function SectionLabel({
  palette,
  children,
}: {
  palette: typeof Colors.light | typeof Colors.dark;
  children: string;
}) {
  return (
    <ThemedText
      style={[
        TypeScale.caption,
        styles.sectionLabel,
        { color: palette.textTertiary, letterSpacing: 0.5 },
      ]}
    >
      {children}
    </ThemedText>
  );
}

function Step({
  n,
  palette,
  children,
}: {
  n: number;
  palette: typeof Colors.light | typeof Colors.dark;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.stepRow}>
      <View style={[styles.stepNumber, { backgroundColor: palette.accentMuted }]}>
        <ThemedText style={[TypeScale.footnote, { color: palette.accent, fontWeight: '700' }]}>
          {n}
        </ThemedText>
      </View>
      <ThemedText style={[TypeScale.body, { color: palette.text, flex: 1 }]}>
        {children}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  scroll: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
  },
  hero: {
    padding: Spacing.four,
    borderRadius: Radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.three,
  },
  heroIconRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  sectionLabel: {
    marginTop: Spacing.three,
    marginBottom: Spacing.one,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  card: {
    padding: Spacing.three,
    borderRadius: Radii.lg,
  },
  row: {
    paddingVertical: Spacing.two,
    gap: Spacing.one,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  upgradeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    borderWidth: StyleSheet.hairlineWidth,
  },
  upgradeIconBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  proHint: {
    textAlign: 'center',
    paddingHorizontal: Spacing.four,
    marginTop: Spacing.two,
  },
  sectionIntro: {
    paddingHorizontal: Spacing.one,
    marginTop: -Spacing.one,
    marginBottom: Spacing.one,
  },
  sectionFootnote: {
    paddingHorizontal: Spacing.one,
    marginTop: Spacing.one,
  },
  priorityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Spacing.three,
    gap: Spacing.three,
  },
  priorityRank: {
    width: 20,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    paddingTop: 3,
  },
  priorityBody: {
    flex: 1,
    gap: Spacing.one,
  },
  priorityBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Radii.sm,
  },
});
