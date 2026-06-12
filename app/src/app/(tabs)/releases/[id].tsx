import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { haptic } from '@/lib/utils/haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { AlertCircle, Inbox, Lock, Sparkles } from 'lucide-react-native';

import { EmptyState } from '@/components/empty-state';
import { ErrorBanner } from '@/components/error-banner';
import { ThemedText } from '@/components/themed-text';
import { Colors, Radii, Spacing, TypeScale, type SemanticState } from '@/constants/theme';
import { useFreeApp } from '@/hooks/use-free-app';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';
import { usePaywallGate } from '@/hooks/use-paywall-gate';
import { describeASCError, toASCError } from '@/lib/api/asc-errors';
import { useAllAppsQuery, useVersionsQuery } from '@/lib/api/asc-queries';
import {
  deriveLatestSnapshot,
  type VersionSummary,
} from '@/lib/domain/version-events';
import { useAccountsStore } from '@/lib/state/accounts';
import { AppDetailHeader } from '@/features/app-detail/detail-header';
import { StateHelpModal } from '@/features/app-detail/state-help-modal';
import { VersionRow } from '@/features/app-detail/version-row';

const EMPTY_TIMELINE: VersionSummary[] = [];

export default function AppDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  const accounts = useAccountsStore((s) => s.accounts);

  // Look up the app from the cached apps query so we know which team
  // owns it. If the user deep-links to /releases/<id> from a notification
  // (Phase 6) and the apps haven't loaded yet, fall back to first account.
  const appsQuery = useAllAppsQuery();
  const app = appsQuery.data?.apps.find((a) => a.ascId === id);
  const account = app
    ? accounts.find((a) => a.issuerId === app.issuerId)
    : accounts[0];

  const versionsQuery = useVersionsQuery({
    appId: id ?? '',
    issuerId: account?.issuerId ?? '',
    keyId: account?.keyId ?? '',
  });

  // Stable fallback so the useMemo dep below doesn't churn on every render
  const timeline = useMemo(() => versionsQuery.data ?? EMPTY_TIMELINE, [versionsQuery.data]);
  const snapshot = useMemo(() => deriveLatestSnapshot(timeline), [timeline]);
  const [helpState, setHelpState] = useState<SemanticState | null>(null);

  const onRefresh = useCallback(() => {
    void versionsQuery.refetch();
  }, [versionsQuery]);

  const wasFetching = useRef(false);
  useEffect(() => {
    if (wasFetching.current && !versionsQuery.isFetching && !versionsQuery.isError) {
      void haptic.light();
    }
    wasFetching.current = versionsQuery.isFetching;
  }, [versionsQuery.isFetching, versionsQuery.isError]);

  const { isLocked } = useFreeApp();
  const gate = usePaywallGate();

  // ----- Guards --------------------------------------------------------
  if (!id || !account) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]} edges={['top']}>
        <EmptyState
          icon={AlertCircle}
          title="App not found"
          body="The app you tried to open isn't connected to any of your accounts."
        />
      </SafeAreaView>
    );
  }

  // Free-tier guard: stops widget deep links, push-notification taps, and
  // stale in-app links from showing release detail for an app the user
  // can no longer access (e.g. lapsed Pro → Free downgrade). The Releases
  // tab tap is also gated upstream — this is defense-in-depth.
  if (isLocked(id)) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]} edges={['top']}>
        <View style={styles.lockedFill}>
          <View style={[styles.lockBubble, { backgroundColor: palette.accentMuted }]}>
            <Lock size={32} color={palette.accent} strokeWidth={2} />
          </View>
          <ThemedText style={[TypeScale.title2, { color: palette.text, textAlign: 'center' }]}>
            This app is Pro-only
          </ThemedText>
          <ThemedText
            style={[
              TypeScale.body,
              { color: palette.textSecondary, textAlign: 'center', maxWidth: 320 },
            ]}
          >
            The free plan tracks one app with full features. Upgrade to Pro to track every app
            in your account.
          </ThemedText>
          <View style={styles.lockedActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="See Pro plans"
              onPress={() => gate.openPaywall('add-app-limit')}
              style={({ pressed }) => [
                styles.lockedPrimary,
                { backgroundColor: palette.accent, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Sparkles size={16} color={palette.textInverse} strokeWidth={2.4} />
              <ThemedText style={[TypeScale.bodyEmph, { color: palette.textInverse }]}>
                See plans
              </ThemedText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to Releases"
              onPress={() => router.replace('/(tabs)/releases')}
              style={({ pressed }) => [styles.lockedSecondary, { opacity: pressed ? 0.7 : 1 }]}
            >
              <ThemedText style={[TypeScale.subhead, { color: palette.textSecondary }]}>
                Back to Releases
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]} edges={['top']}>
      <AppDetailHeader
        appName={app?.name ?? '—'}
        bundleId={app?.bundleId ?? ''}
        teamName={account.teamName}
        currentState={snapshot.state}
        currentVersion={snapshot.versionString}
        currentBuild={snapshot.buildNumber}
        scheduledReleaseAt={snapshot.scheduledReleaseAt}
        isEmpty={snapshot.isEmpty}
        onStateHelpTap={() => setHelpState(snapshot.state)}
        ascAppId={id}
      />

      {versionsQuery.isError && (
        <ErrorBanner
          variant="error"
          message={describeASCError(toASCError(versionsQuery.error)).title}
          actionLabel="Retry"
          onAction={onRefresh}
        />
      )}

      {versionsQuery.isLoading && timeline.length === 0 ? (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={palette.accent} />
          <ThemedText style={[TypeScale.subhead, { color: palette.textSecondary }]}>
            Loading version history…
          </ThemedText>
        </View>
      ) : (
        <FlatList<VersionSummary>
          data={timeline}
          keyExtractor={(item) => item.ascId}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => (
            <VersionRow
              summary={item}
              isFirst={index === 0}
              isLast={index === timeline.length - 1}
            />
          )}
          ListHeaderComponent={
            timeline.length > 0 ? (
              <ThemedText
                style={[TypeScale.captionEmph, styles.sectionLabel, { color: palette.textTertiary }]}
              >
                VERSION HISTORY
              </ThemedText>
            ) : null
          }
          ListEmptyComponent={
            !versionsQuery.isError ? (
              <EmptyState
                icon={Inbox}
                title="No version history yet"
                body={
                  app
                    ? `When you create a draft for "${app.name}" in App Store Connect, it will appear here within a minute.`
                    : "When you create a draft in App Store Connect, it'll appear here within a minute."
                }
                cta={
                  app
                    ? {
                        label: 'Open in App Store Connect',
                        onPress: () =>
                          void WebBrowser.openBrowserAsync(
                            `https://appstoreconnect.apple.com/apps/${app.ascId}/distribution/ios`,
                          ),
                      }
                    : undefined
                }
              />
            ) : null
          }
          refreshControl={
            <RefreshControl
              refreshing={versionsQuery.isFetching && !versionsQuery.isLoading}
              onRefresh={onRefresh}
              tintColor={palette.accent}
            />
          }
        />
      )}

      <StateHelpModal state={helpState} onDismiss={() => setHelpState(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  sectionLabel: {
    letterSpacing: 0.5,
    marginTop: Spacing.three,
    marginBottom: Spacing.two,
  },
  lockedFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  lockBubble: {
    width: 72,
    height: 72,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedActions: {
    width: '100%',
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  lockedPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one + 2,
    paddingVertical: Spacing.three,
    borderRadius: Radii.md,
    minHeight: 50,
  },
  lockedSecondary: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    minHeight: 44,
  },
});
