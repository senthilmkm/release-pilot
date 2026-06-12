import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppWindow, RefreshCw } from 'lucide-react-native';

import { EmptyState } from '@/components/empty-state';
import { ErrorBanner } from '@/components/error-banner';
import { AppRow } from '@/features/releases/app-row';
import { AppRowSkeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing, TypeScale } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';
import { useNativeSurfaceSync } from '@/hooks/use-native-surface-sync';
import { useFreeApp } from '@/hooks/use-free-app';
import { usePaywallGate } from '@/hooks/use-paywall-gate';
import { describeASCError, toASCError } from '@/lib/api/asc-errors';
import {
  type AggregatedAppRow,
  useAllAppsQuery,
  useLatestStatesQuery,
} from '@/lib/api/asc-queries';
import { useAccountsStore } from '@/lib/state/accounts';
import { sortAppsAlphabetically } from '@/lib/subscription/free-app';
import { haptic } from '@/lib/utils/haptics';

export default function ReleasesListScreen() {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  const accounts = useAccountsStore((s) => s.accounts);
  const appsQuery = useAllAppsQuery();
  const rawApps = appsQuery.data?.apps ?? [];
  // Sort once here so list order, lock index, and accessibility-label
  // ordering all agree. Same sort key used by the free-app helper.
  const apps = useMemo(() => sortAppsAlphabetically(rawApps), [rawApps]);
  const failures = appsQuery.data?.failures ?? [];
  const statesQuery = useLatestStatesQuery({ apps });

  const { isLocked } = useFreeApp();
  const gate = usePaywallGate();

  const handleAppPress = useCallback(
    (ascId: string, appIndex: number) => {
      const decision = gate.check('add-app-limit', { appIndex });
      if (!decision.allowed) {
        gate.openPaywall(decision.reason);
        return;
      }
      router.push(`/(tabs)/releases/${ascId}`);
    },
    [gate],
  );

  // Keep widget + Live Activity in lock-step with every fresh fetch.
  useNativeSurfaceSync({ apps, snapshots: statesQuery.byAppId });

  const onRefresh = useCallback(() => {
    void appsQuery.refetch();
  }, [appsQuery]);

  // Fire a light haptic the moment a user-initiated refetch completes
  // successfully — same tactile pattern Apple Mail uses after pull-to-refresh.
  const wasFetching = useRef(false);
  useEffect(() => {
    if (wasFetching.current && !appsQuery.isFetching && !appsQuery.isError) {
      void haptic.light();
    }
    wasFetching.current = appsQuery.isFetching;
  }, [appsQuery.isFetching, appsQuery.isError]);

  if (accounts.length === 0) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]} edges={['top']}>
        <Header palette={palette} />
        <EmptyState
          icon={AppWindow}
          title="No accounts connected"
          body="Add an App Store Connect API key to see your apps and releases."
          cta={{ label: 'Connect an account', onPress: () => router.push('/(onboarding)/why-asc') }}
        />
      </SafeAreaView>
    );
  }

  if (appsQuery.isLoading && apps.length === 0) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]} edges={['top']}>
        <Header palette={palette} />
        <View style={styles.skeletonList} accessibilityLabel="Loading your apps">
          <AppRowSkeleton />
          <AppRowSkeleton />
          <AppRowSkeleton />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]} edges={['top']}>
      <Header palette={palette} />
      {appsQuery.isError && (
        <ErrorBanner
          variant="error"
          message={describeASCError(toASCError(appsQuery.error)).title}
          actionLabel="Retry"
          onAction={onRefresh}
        />
      )}
      {!appsQuery.isError && failures.length > 0 && (
        <ErrorBanner
          variant="warning"
          message={
            failures.length === 1
              ? `"${failures[0]!.teamName}" failed to load (${failures[0]!.errorKind.replaceAll('_', ' ')}). Other apps still shown below.`
              : `${failures.length} of ${accounts.length} accounts failed to load. Other apps still shown below.`
          }
          actionLabel="Retry"
          onAction={onRefresh}
        />
      )}
      <FlatList<AggregatedAppRow>
        data={apps}
        keyExtractor={(item) => `${item.issuerId}:${item.ascId}`}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.two }} />}
        renderItem={({ item, index }) => (
          <AppRow
            appName={item.name}
            bundleId={item.bundleId}
            teamName={item.teamName}
            snapshot={statesQuery.byAppId.get(item.ascId) ?? null}
            isLoadingState={statesQuery.isLoading && !statesQuery.byAppId.has(item.ascId)}
            isLocked={isLocked(item.ascId)}
            onPress={() => handleAppPress(item.ascId, index)}
          />
        )}
        ListEmptyComponent={
          !appsQuery.isError ? (
            <EmptyState
              icon={RefreshCw}
              title="No apps yet"
              body="This Apple Developer team doesn't have any apps in App Store Connect."
              cta={{ label: 'Refresh', onPress: onRefresh }}
            />
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={appsQuery.isFetching && !appsQuery.isLoading}
            onRefresh={onRefresh}
            tintColor={palette.accent}
          />
        }
      />
    </SafeAreaView>
  );
}

function Header({ palette }: { palette: typeof Colors.light | typeof Colors.dark }) {
  return (
    <View style={styles.header}>
      <ThemedText style={[TypeScale.title1, { color: palette.text }]}>
        Releases
      </ThemedText>
      <ThemedText style={[TypeScale.subhead, { color: palette.textSecondary }]}>
        Live status across every connected app. Pull to refresh.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    gap: 2,
  },
  list: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
  },
  skeletonList: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    gap: Spacing.two,
  },
});
