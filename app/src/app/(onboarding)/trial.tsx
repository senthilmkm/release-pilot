import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Check, Sparkles } from 'lucide-react-native';

import { OnboardingShell } from '@/features/onboarding/onboarding-shell';
import { ThemedText } from '@/components/themed-text';
import { Colors, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';
import { useEntitlement } from '@/hooks/use-entitlement';

/**
 * Final onboarding step — Pro upsell.
 *
 * Reads the live offering from RevenueCat (loaded at app start in
 * `_layout.tsx` via `initRevenueCat()`). NO HARDCODED PRICES — if RC
 * hasn't responded yet we show a "Loading…" placeholder and let the
 * user either continue free or open the full paywall.
 *
 * Primary CTA → routes to the full paywall (`/paywall`) where the
 * actual purchase happens. We don't try to recreate the purchase UI
 * inline because users may want to compare annual vs monthly.
 */
export default function TrialScreen() {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];
  const { offering } = useEntitlement();

  const features = [
    'Track every app in your portfolio',
    'Push notifications when status changes',
    'Lock Screen widget — replaces 4 dashboards',
    'Lock Screen Live Activity during review',
    'RevenueCat integration on the Today tab',
    'Unlimited review replies from your phone',
    'Unlimited pre-submit checks',
    'Connect every ASC account you ship for',
  ];

  // Highlight the annual plan (best perceived value) in the marketing card.
  const headlinePlan = useMemo(() => offering?.plans[0] ?? null, [offering]);
  const headlinePrice = headlinePlan?.priceString ?? '…';
  const headlineSubtitle = useMemo(() => {
    if (!headlinePlan) return 'Loading prices from App Store Connect…';
    // Always pin the cadence to the price ("$39.99/year") so the value
    // is unambiguous. Then OPTIONALLY append the per-month equivalent
    // for annual plans as a secondary "feels cheaper" framing
    // ("$39.99/year · $3.33/mo"). Without the /year suffix, "$39.99"
    // reads as a one-time fee — Apple's own paywalls always pin cadence.
    const pricedCadence =
      headlinePlan.kind === 'annual'   ? `${headlinePrice}/year`
    : headlinePlan.kind === 'monthly'  ? `${headlinePrice}/month`
    : /* lifetime / unknown */           headlinePrice;
    const perMonthSuffix =
      headlinePlan.kind === 'annual' && headlinePlan.perMonthString
        ? ` · ${headlinePlan.perMonthString}`
        : '';
    if (headlinePlan.trialDays > 0) {
      return `${headlinePlan.trialDays}-day free trial, then ${pricedCadence}${perMonthSuffix}`;
    }
    return `${pricedCadence}${perMonthSuffix}`;
  }, [headlinePlan, headlinePrice]);

  const ctaLabel = headlinePlan?.trialDays
    ? `Start ${headlinePlan.trialDays}-day free trial`
    : 'See Pro plans';

  return (
    <OnboardingShell
      title="One last thing"
      ctaLabel={ctaLabel}
      onCta={() => router.push('/paywall')}
      secondaryLabel="Continue with free plan"
      onSecondary={() => router.replace('/(tabs)/releases')}
      step={8}
      totalSteps={8}
    >
      <View style={styles.container}>
        <View style={[styles.planCard, { borderColor: palette.accent, backgroundColor: palette.accentMuted }]}>
          <View style={styles.planHeader}>
            <Sparkles size={20} color={palette.accent} strokeWidth={2.2} />
            <ThemedText style={[TypeScale.title3, { color: palette.text }]}>
              Release Pilot Pro
            </ThemedText>
          </View>
          <ThemedText style={[TypeScale.footnote, { color: palette.textSecondary }]}>
            {headlineSubtitle}
          </ThemedText>
          <View style={styles.featureList}>
            {features.map((f) => (
              <View key={f} style={styles.featureRow}>
                <Check size={16} color={palette.accent} strokeWidth={2.6} />
                <ThemedText style={[TypeScale.body, { color: palette.text }]}>{f}</ThemedText>
              </View>
            ))}
          </View>
        </View>

        <ThemedText style={[TypeScale.footnote, styles.legal, { color: palette.textTertiary }]}>
          Trial converts to a paid subscription unless cancelled. Cancel anytime in iOS Settings →
          Subscriptions. Free plan includes 1 app tracked, 3 checklist runs per week, and 2
          review replies per month. Push notifications, widgets, RevenueCat, and Live Activities
          are Pro-only.
        </ThemedText>
      </View>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.four,
    paddingTop: Spacing.two,
  },
  planCard: {
    borderWidth: 2,
    borderRadius: Radii.lg,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  featureList: {
    marginTop: Spacing.three,
    gap: Spacing.two,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  legal: { textAlign: 'center' },
});
