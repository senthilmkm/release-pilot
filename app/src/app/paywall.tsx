import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, CreditCard, Sparkles, X } from 'lucide-react-native';
import Purchases from 'react-native-purchases';

import { ThemedText } from '@/components/themed-text';
import { ErrorBanner } from '@/components/error-banner';
import { Colors, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';
import { useEntitlement } from '@/hooks/use-entitlement';
import {
  checkTrialEligibility,
  purchasePlan,
  restorePurchases,
} from '@/lib/subscription/purchase';
import { paywallCopyFor } from '@/lib/subscription/gates';
import { useCurrentProductId } from '@/hooks/use-current-product-id';
import { haptic } from '@/lib/utils/haptics';
import type { GateBlockReason, PaywallPlan } from '@/lib/subscription/types';

/**
 * Phase 7 paywall.
 *
 * Reads prices live from RevenueCat's `getOfferings()` — NO HARDCODED
 * PRICES anywhere in the code. To change pricing:
 *   1. Edit the product in App Store Connect
 *   2. RC syncs within ~5 minutes
 *   3. App reflects the new price on next launch
 *
 * Layout:
 *   - X dismiss button (top-right)
 *   - Context headline (varies by `reason` / current-tier)
 *   - Feature bullets (what Pro unlocks)
 *   - Plan picker (annual / monthly / lifetime, sorted best-value first)
 *   - Trial copy (suppressed for users ineligible for the intro offer)
 *   - Big purchase CTA — adapts copy for switch flows
 *   - "Manage subscription" entry for current Pro users (cancel)
 *   - Restore + Terms + Privacy footer
 *
 * SWITCHING PLANS (Monthly ↔ Yearly):
 *   When a Pro user opens the paywall, we preselect their CURRENT plan
 *   and badge it. Picking a different plan + tapping the CTA triggers
 *   RevenueCat's cross-grade flow — Apple shows its own native
 *   confirmation sheet ("Modify Subscription"). Upgrades take effect
 *   immediately with prorated credit; downgrades defer to the end of
 *   the current period. This REQUIRES both products to live in the
 *   SAME App Store Connect subscription group (see purchase.ts header).
 */

const FEATURE_BULLETS = [
  'Track every app in your portfolio',
  'Push notifications when status changes',
  'Every app in your Lock Screen widget (free shows 1)',
  'Live Activity during App Review wait',
  'RevenueCat on the Today tab — live MRR & revenue',
  'Unlimited review replies with templates',
  'Unlimited pre-submit checklist runs',
  'Connect every App Store Connect team',
] as const;

const TERMS_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
const PRIVACY_URL = 'https://senthilmkm.github.io/release-pilot/privacy.html';

function goBackOrHome(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/releases');
}

export default function PaywallScreen() {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];
  const params = useLocalSearchParams<{ reason?: GateBlockReason }>();
  const { offering, status, isPro } = useEntitlement();
  const currentProductId = useCurrentProductId();
  const [overrideId, setOverrideId] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [eligibility, setEligibility] = useState<Record<string, boolean>>({});

  // Preselect the user's CURRENT plan if they're already Pro (so the
  // "switch" intent is the default). Otherwise fall back to the first
  // plan (the highest-value annual when present).
  const defaultPackageId = useMemo(() => {
    if (!offering) return null;
    if (currentProductId) {
      const own = offering.plans.find((p) => p.productId === currentProductId);
      if (own) return own.packageId;
    }
    return offering.plans[0]?.packageId ?? null;
  }, [offering, currentProductId]);

  const selectedPackageId = overrideId ?? defaultPackageId;

  const selectedPlan = useMemo<PaywallPlan | null>(() => {
    if (!offering) return null;
    return offering.plans.find((p) => p.packageId === selectedPackageId) ?? null;
  }, [offering, selectedPackageId]);

  // Ask Apple/RC whether the user is still eligible for the trial offer.
  // We do this once per offering snapshot. If the user has ever
  // subscribed (or downgraded) in this group, they're no longer eligible
  // and we must suppress the "Start free trial" CTA copy.
  useEffect(() => {
    if (!offering || offering.plans.length === 0) return;
    let cancelled = false;
    const productIds = offering.plans
      .filter((p) => p.trialDays > 0)
      .map((p) => p.productId);
    if (productIds.length === 0) return;
    void checkTrialEligibility(productIds).then((map) => {
      if (!cancelled) setEligibility(map);
    });
    return () => {
      cancelled = true;
    };
  }, [offering]);

  const headline = useMemo(() => {
    if (isPro && currentProductId) {
      return {
        title: 'Change your plan',
        body: 'Switch between Monthly and Yearly anytime. Apple will prorate the difference automatically.',
      };
    }
    if (params.reason) {
      return paywallCopyFor(params.reason);
    }
    return {
      title: 'Unlock Release Pilot Pro',
      body: 'Everything you need to ship calmly: push notifications, widgets, replies, and unlimited checklist runs.',
    };
  }, [params.reason, isPro, currentProductId]);

  const isSelectedCurrentPlan =
    !!selectedPlan && selectedPlan.productId === currentProductId;
  const isSwitchFlow = isPro && currentProductId != null;
  // Trial is shown only when the plan offers one AND the user is eligible.
  // For switch flows, never show "free trial" copy — they're already Pro.
  const trialActiveForSelected =
    !isSwitchFlow &&
    !!selectedPlan &&
    selectedPlan.trialDays > 0 &&
    eligibility[selectedPlan.productId] !== false;

  const handlePurchase = useCallback(async () => {
    if (!selectedPlan) return;
    setErrorMsg(null);
    setPurchasing(true);
    const result = await purchasePlan(selectedPlan, {
      currentProductId: currentProductId ?? undefined,
    });
    setPurchasing(false);
    if (result.kind === 'success' && result.isPro) {
      void haptic.success();
      const title = isSwitchFlow ? 'Plan updated' : 'Welcome to Pro';
      const body = isSwitchFlow
        ? 'Your subscription has been updated. Apple will handle the prorated credit on your next bill.'
        : 'Thanks for supporting Release Pilot.';
      Alert.alert(title, body);
      goBackOrHome();
    } else if (result.kind === 'already-on-plan') {
      void haptic.warning();
      setErrorMsg("You're already subscribed to this plan. Pick a different one to switch.");
    } else if (result.kind === 'error') {
      void haptic.error();
      setErrorMsg(result.message);
    }
  }, [selectedPlan, currentProductId, isSwitchFlow]);

  const handleManage = useCallback(async () => {
    if (Platform.OS !== 'ios') return;
    try {
      await Purchases.showManageSubscriptions();
    } catch {
      void Linking.openURL('https://apps.apple.com/account/subscriptions');
    }
  }, []);

  const handleRestore = useCallback(async () => {
    setErrorMsg(null);
    setRestoring(true);
    const result = await restorePurchases();
    setRestoring(false);
    if (result.kind === 'success') {
      if (result.isPro) {
        void haptic.success();
        Alert.alert('Pro restored', 'Your Pro subscription is active again.');
        goBackOrHome();
      } else {
        void haptic.warning();
        Alert.alert(
          'Nothing to restore',
          "We didn't find a Pro purchase on this Apple ID.",
        );
      }
    } else if (result.kind === 'error') {
      void haptic.error();
      setErrorMsg(result.message);
    }
  }, []);

  const handleClose = useCallback(() => goBackOrHome(), []);

  const ctaLabel = useMemo(() => {
    if (!selectedPlan) return 'Continue';
    if (isSelectedCurrentPlan) return 'Your current plan';
    if (isSwitchFlow) {
      return `Switch to ${prettyTitle(selectedPlan)}`;
    }
    if (trialActiveForSelected) {
      return `Start ${selectedPlan.trialDays}-day free trial`;
    }
    if (selectedPlan.kind === 'lifetime') return 'Buy lifetime access';
    // Pin cadence so the CTA never reads as a one-time fee. "$39.99"
    // is ambiguous; "$39.99/year" matches Apple's own paywall pattern.
    return `Subscribe — ${pricedWithCadence(selectedPlan)}`;
  }, [selectedPlan, isSelectedCurrentPlan, isSwitchFlow, trialActiveForSelected]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
      <View style={styles.dismissRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close paywall"
          onPress={handleClose}
          hitSlop={12}
          style={styles.closeButton}
        >
          <X size={24} color={palette.textSecondary} strokeWidth={2.2} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={[styles.iconBubble, { backgroundColor: palette.accentMuted }]}>
          <Sparkles size={36} color={palette.accent} strokeWidth={1.8} />
        </View>

        <ThemedText style={[TypeScale.title1, styles.title, { color: palette.text }]}>
          {headline.title}
        </ThemedText>

        <ThemedText style={[TypeScale.body, styles.subtitle, { color: palette.textSecondary }]}>
          {headline.body}
        </ThemedText>

        <View style={styles.featureList}>
          {FEATURE_BULLETS.map((b) => (
            <View key={b} style={styles.featureRow}>
              <View style={[styles.featureDot, { backgroundColor: palette.accentMuted }]}>
                <Check size={14} color={palette.accent} strokeWidth={2.6} />
              </View>
              <ThemedText style={[TypeScale.body, { color: palette.text, flex: 1 }]}>{b}</ThemedText>
            </View>
          ))}
        </View>

        {errorMsg ? <ErrorBanner variant="error" message={errorMsg} /> : null}

        <PlanPicker
          status={status}
          offering={offering}
          selectedId={selectedPackageId}
          currentProductId={currentProductId}
          onSelect={setOverrideId}
          palette={palette}
        />

        {trialActiveForSelected && selectedPlan ? (
          <ThemedText style={[TypeScale.footnote, styles.trialNote, { color: palette.textSecondary }]}>
            {selectedPlan.trialDays}-day free trial, then {pricedWithCadence(selectedPlan)}
            {selectedPlan.kind === 'annual' && selectedPlan.perMonthString
              ? ` (${selectedPlan.perMonthString})`
              : ''}
            . Cancel anytime in iOS Settings.
          </ThemedText>
        ) : isSwitchFlow && !isSelectedCurrentPlan && selectedPlan ? (
          <ThemedText style={[TypeScale.footnote, styles.trialNote, { color: palette.textSecondary }]}>
            Apple will show a confirmation sheet. Upgrades start immediately with prorated credit;
            downgrades take effect at the end of your current billing period.
          </ThemedText>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: palette.background, borderTopColor: palette.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={ctaLabel}
          onPress={handlePurchase}
          disabled={
            !selectedPlan ||
            purchasing ||
            status !== 'ready' ||
            isSelectedCurrentPlan
          }
          style={({ pressed }) => [
            styles.ctaButton,
            {
              backgroundColor: isSelectedCurrentPlan ? palette.backgroundSelected : palette.accent,
              opacity:
                pressed || purchasing || !selectedPlan || isSelectedCurrentPlan ? 0.7 : 1,
            },
          ]}
        >
          {purchasing ? (
            <ActivityIndicator color={palette.textInverse} />
          ) : (
            <ThemedText
              style={[
                TypeScale.headline,
                { color: isSelectedCurrentPlan ? palette.textSecondary : palette.textInverse },
              ]}
            >
              {ctaLabel}
            </ThemedText>
          )}
        </Pressable>

        {isPro && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Manage subscription in Apple ID Settings"
            onPress={handleManage}
            hitSlop={8}
            style={({ pressed }) => [styles.manageRow, { opacity: pressed ? 0.6 : 1 }]}
          >
            <CreditCard size={14} color={palette.textSecondary} strokeWidth={2.2} />
            <ThemedText style={[TypeScale.footnote, { color: palette.textSecondary }]}>
              Manage or cancel in Apple ID Settings
            </ThemedText>
          </Pressable>
        )}

        <View style={styles.footerLinks}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Restore previous purchases"
            onPress={handleRestore}
            disabled={restoring}
            hitSlop={8}
          >
            <ThemedText style={[TypeScale.footnote, { color: palette.accent }]}>
              {restoring ? 'Restoring…' : 'Restore Purchases'}
            </ThemedText>
          </Pressable>
          <ThemedText style={[TypeScale.footnote, { color: palette.textTertiary }]}>·</ThemedText>
          <Pressable accessibilityRole="link" onPress={() => Linking.openURL(TERMS_URL)} hitSlop={8}>
            <ThemedText style={[TypeScale.footnote, { color: palette.textSecondary }]}>Terms</ThemedText>
          </Pressable>
          <ThemedText style={[TypeScale.footnote, { color: palette.textTertiary }]}>·</ThemedText>
          <Pressable accessibilityRole="link" onPress={() => Linking.openURL(PRIVACY_URL)} hitSlop={8}>
            <ThemedText style={[TypeScale.footnote, { color: palette.textSecondary }]}>Privacy</ThemedText>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Plan picker — handles loading / unconfigured / error states inline
// ---------------------------------------------------------------------------

function PlanPicker(props: {
  status: ReturnType<typeof useEntitlement>['status'];
  offering: ReturnType<typeof useEntitlement>['offering'];
  selectedId: string | null;
  currentProductId: string | null;
  onSelect: (id: string) => void;
  palette: typeof Colors.light | typeof Colors.dark;
}) {
  const { status, offering, selectedId, currentProductId, onSelect, palette } = props;

  if (status === 'loading') {
    return (
      <View style={[styles.planPlaceholder, { borderColor: palette.border }]}>
        <ActivityIndicator color={palette.textSecondary} />
        <ThemedText style={[TypeScale.footnote, { color: palette.textSecondary }]}>
          Loading prices from App Store Connect…
        </ThemedText>
      </View>
    );
  }

  if (status === 'unconfigured') {
    return (
      <View style={[styles.planPlaceholder, { borderColor: palette.border }]}>
        <ThemedText style={[TypeScale.footnote, styles.errorText, { color: palette.textSecondary }]}>
          Pro plans will appear here once the App Store products are configured. Free-tier features
          are fully available right now.
        </ThemedText>
      </View>
    );
  }

  if (!offering || offering.plans.length === 0) {
    return (
      <View style={[styles.planPlaceholder, { borderColor: palette.border }]}>
        <ThemedText style={[TypeScale.footnote, styles.errorText, { color: palette.textSecondary }]}>
          No plans available right now. Check your connection and try again.
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.planList}>
      {offering.plans.map((plan, idx) => {
        const selected = plan.packageId === selectedId;
        const isCurrent = currentProductId === plan.productId;
        const isBestValue = idx === 0 && offering.plans.length > 1 && !isCurrent;
        return (
          <Pressable
            key={plan.packageId}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={
              isCurrent
                ? `${plan.title}, ${plan.priceString}, your current plan`
                : `${plan.title}, ${plan.priceString}`
            }
            onPress={() => onSelect(plan.packageId)}
            style={[
              styles.planRow,
              {
                borderColor: selected ? palette.accent : palette.border,
                backgroundColor: selected ? palette.accentMuted : palette.backgroundElement,
                borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
              },
            ]}
          >
            <View style={styles.planRowHead}>
              <View style={styles.planRowTitle}>
                <ThemedText style={[TypeScale.bodyEmph, { color: palette.text }]}>
                  {prettyTitle(plan)}
                </ThemedText>
                {isCurrent ? (
                  <View style={[styles.badge, { backgroundColor: palette.successFg }]}>
                    <ThemedText style={[TypeScale.caption, { color: palette.textInverse }]}>
                      CURRENT PLAN
                    </ThemedText>
                  </View>
                ) : isBestValue ? (
                  <View style={[styles.badge, { backgroundColor: palette.accent }]}>
                    <ThemedText style={[TypeScale.caption, { color: palette.textInverse }]}>
                      BEST VALUE
                    </ThemedText>
                  </View>
                ) : null}
              </View>
              <ThemedText style={[TypeScale.bodyEmph, { color: palette.text }]}>
                {plan.priceString}
              </ThemedText>
            </View>
            <View style={styles.planRowSub}>
              <ThemedText style={[TypeScale.footnote, { color: palette.textSecondary }]}>
                {planSubtitle(plan)}
              </ThemedText>
              {selected ? <Check size={18} color={palette.accent} strokeWidth={2.4} /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function prettyTitle(plan: PaywallPlan): string {
  switch (plan.kind) {
    case 'annual':   return 'Pro Yearly';
    case 'monthly':  return 'Pro Monthly';
    case 'lifetime': return 'Pro Lifetime';
    default:         return plan.title || 'Pro';
  }
}

/**
 * Renders a plan's price with its billing cadence pinned: "$39.99/year",
 * "$4.99/month", or just "$99.99" for lifetime. We never show a bare
 * price ("$39.99") in a context where the user could mistake it for a
 * one-time fee — Apple's HIG and every reputable SaaS paywall always
 * pair price with cadence at the point of decision.
 */
function pricedWithCadence(plan: PaywallPlan): string {
  switch (plan.kind) {
    case 'annual':   return `${plan.priceString}/year`;
    case 'monthly':  return `${plan.priceString}/month`;
    case 'lifetime': return plan.priceString;
    default:         return plan.priceString;
  }
}

function planSubtitle(plan: PaywallPlan): string {
  switch (plan.kind) {
    case 'annual':
      return plan.perMonthString
        ? `${plan.perMonthString} • billed yearly`
        : 'billed yearly';
    case 'monthly':  return 'billed monthly';
    case 'lifetime': return 'one-time payment';
    default:         return plan.description || '';
  }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: { flex: 1 },
  dismissRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  closeButton: { width: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center' },
  body: {
    paddingHorizontal: Spacing.five,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
    alignItems: 'stretch',
  },
  iconBubble: {
    width: 72,
    height: 72,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: Spacing.two,
  },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center', marginBottom: Spacing.two },
  featureList: {
    gap: Spacing.two,
    marginVertical: Spacing.two,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  featureDot: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  planList: { gap: Spacing.two, marginTop: Spacing.two },
  planRow: {
    borderRadius: Radii.lg,
    padding: Spacing.four,
    gap: Spacing.one,
  },
  planRowHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planRowTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  planRowSub: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Radii.xs,
  },
  planPlaceholder: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radii.lg,
    padding: Spacing.five,
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  errorText: { textAlign: 'center' },
  trialNote: {
    textAlign: 'center',
    marginTop: Spacing.two,
  },
  footer: {
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
    gap: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  ctaButton: {
    height: 52,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one + 2,
    paddingVertical: Spacing.one,
    minHeight: 32,
  },
  footerLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.two,
  },
});

