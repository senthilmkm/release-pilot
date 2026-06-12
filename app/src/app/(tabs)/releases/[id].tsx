import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { haptic } from '@/lib/utils/haptics';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { AlertCircle, Inbox } from 'lucide-react-native';

import { EmptyState } from '@/components/empty-state';
import { ErrorBanner } from '@/components/error-banner';
import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing, TypeScale, type SemanticState } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';
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
});
