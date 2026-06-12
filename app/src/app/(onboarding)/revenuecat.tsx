import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { CheckCircle2, ChevronRight, DollarSign, ExternalLink } from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';

import { ThemedText } from '@/components/themed-text';
import { OnboardingShell } from '@/features/onboarding/onboarding-shell';
import { Colors, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';
import { usePaywallGate } from '@/hooks/use-paywall-gate';
import { useAllAppsQuery, type AggregatedAppRow } from '@/lib/api/asc-queries';
import { useAppRevenueCatStore } from '@/lib/state/app-revenuecat';

const REVENUECAT_DASHBOARD_URL = 'https://app.revenuecat.com';

/**
 * Onboarding step 6 of 8 — optional RevenueCat connection.
 *
 * Shows one row per ASC app the user just connected. Each row is either
 * "Not connected → Connect" or "Connected → Reconnect". Tapping pushes
 * to the per-app paste screen, which writes credentials to Keychain and
 * pops back here.
 *
 * Critical UX choice: this screen is SKIPPABLE. Releases + Reviews + the
 * Briefing's reviews half all work without RC. The user can come back
 * via More → Apps → tap an app row later.
 *
 * Also: even a partially-connected state (1 of 3 apps) is valid — the
 * Briefing will show MRR only for connected apps and a "Connect RC"
 * inline prompt on the others.
 */
export default function RevenueCatOnboardingScreen() {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  const appsQuery = useAllAppsQuery();
  const rcByAppId = useAppRevenueCatStore((s) => s.byAscAppId);

  const apps = appsQuery.data?.apps ?? [];
  const connectedCount = apps.filter((a) => rcByAppId[a.ascId]?.verified).length;

  const next = () => router.push('/(onboarding)/notifications');

  return (
    <OnboardingShell
      title="See your revenue at a glance"
      ctaLabel={connectedCount > 0 ? 'Continue' : 'Skip for now'}
      onCta={next}
      secondaryLabel={connectedCount > 0 ? 'Skip the rest' : undefined}
      onSecondary={connectedCount > 0 ? next : undefined}
      step={6}
      totalSteps={8}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.heroBubble, { backgroundColor: palette.accentMuted }]}>
          <DollarSign size={36} color={palette.accent} strokeWidth={1.8} />
        </View>

        <ThemedText style={[TypeScale.body, styles.copy, { color: palette.textSecondary }]}>
          Connect RevenueCat to power the Today tab — your morning briefing
          with MRR, 28-day revenue, active subscribers, and trial conversions
          for each app. Optional, but Today is mostly empty without it. Your
          release status and reviews work without RevenueCat.
        </ThemedText>

        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Open RevenueCat to find your project ID and create a secret API key"
          onPress={() => void WebBrowser.openBrowserAsync(REVENUECAT_DASHBOARD_URL)}
          hitSlop={8}
          style={({ pressed }) => [styles.helpLink, { opacity: pressed ? 0.6 : 1 }]}
        >
          <ExternalLink size={14} color={palette.accent} strokeWidth={2.2} />
          <ThemedText style={[TypeScale.footnote, { color: palette.accent }]}>
            Open RevenueCat to get your keys
          </ThemedText>
        </Pressable>

        <View style={styles.list}>
          {appsQuery.isLoading && !appsQuery.data && (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={palette.accent} />
              <ThemedText style={[TypeScale.subhead, { color: palette.textSecondary }]}>
                Loading your apps…
              </ThemedText>
            </View>
          )}

          {!appsQuery.isLoading && apps.length === 0 && (
            <View
              style={[
                styles.emptyCard,
                { backgroundColor: palette.backgroundElement, borderColor: palette.border },
              ]}
            >
              <ThemedText style={[TypeScale.subhead, { color: palette.text }]}>
                No apps yet
              </ThemedText>
              <ThemedText
                style={[TypeScale.footnote, { color: palette.textSecondary, marginTop: 4 }]}
              >
                Add an app in App Store Connect and re-launch Release Pilot.
              </ThemedText>
            </View>
          )}

          {apps.map((app) => (
            <AppRow
              key={app.ascId}
              app={app}
              connected={Boolean(rcByAppId[app.ascId]?.verified)}
            />
          ))}

          <ThemedText
            style={[
              TypeScale.caption,
              { color: palette.textTertiary, textAlign: 'center', marginTop: Spacing.two },
            ]}
          >
            RevenueCat integration is a Pro feature. Tap an app to see the upgrade options.
          </ThemedText>
        </View>

        {apps.length > 0 && (
          <ThemedText
            style={[TypeScale.footnote, styles.connectedCount, { color: palette.textTertiary }]}
          >
            {connectedCount} of {apps.length} connected · you can also add this
            later from the More tab.
          </ThemedText>
        )}
      </ScrollView>
    </OnboardingShell>
  );
}

function AppRow({ app, connected }: { app: AggregatedAppRow; connected: boolean }) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];
  const gate = usePaywallGate();

  const onPress = () => {
    // RC is Pro-only globally. If the user is still on free during
    // onboarding (i.e. hasn't reached / activated the trial step yet),
    // route them to the paywall instead of the paste screen. Saves them
    // typing in keys only to be rejected by `verifyAndPersistRevenueCat`'s
    // defense-in-depth check.
    const decision = gate.check('connect-revenuecat-pro');
    if (!decision.allowed) {
      gate.openPaywall(decision.reason);
      return;
    }
    router.push({
      pathname: '/(onboarding)/revenuecat-paste',
      params: {
        ascAppId: app.ascId,
        appName: app.name,
        bundleId: app.bundleId,
      },
    });
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        connected
          ? `${app.name} — RevenueCat connected. Tap to update credentials.`
          : `Connect RevenueCat for ${app.name}`
      }
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: palette.backgroundElement,
          borderColor: palette.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={styles.rowLeft}>
        <ThemedText style={[TypeScale.bodyEmph, { color: palette.text }]}>
          {app.name}
        </ThemedText>
        <ThemedText style={[TypeScale.footnote, { color: palette.textSecondary }]}>
          {app.bundleId}
        </ThemedText>
      </View>

      <View style={styles.rowRight}>
        {connected ? (
          <>
            <CheckCircle2 size={18} color="#1F7A1F" strokeWidth={2.2} />
            <ThemedText style={[TypeScale.footnote, { color: '#1F7A1F' }]}>
              Connected
            </ThemedText>
          </>
        ) : (
          <ThemedText style={[TypeScale.footnote, { color: palette.accent }]}>
            Connect
          </ThemedText>
        )}
        <ChevronRight size={16} color={palette.textTertiary} strokeWidth={2} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingBottom: Spacing.four,
    alignItems: 'stretch',
    gap: Spacing.three,
  },
  heroBubble: {
    width: 80,
    height: 80,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  copy: {
    textAlign: 'center',
  },
  helpLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    alignSelf: 'center',
    paddingVertical: Spacing.one,
    minHeight: 44,
  },
  list: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    justifyContent: 'center',
    paddingVertical: Spacing.four,
  },
  emptyCard: {
    padding: Spacing.three,
    borderRadius: Radii.md,
    borderWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Radii.md,
    borderWidth: 1,
    minHeight: 64,
    gap: Spacing.two,
  },
  rowLeft: {
    flex: 1,
    gap: 2,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  connectedCount: {
    textAlign: 'center',
    marginTop: Spacing.two,
  },
});
