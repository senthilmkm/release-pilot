import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { AppWindow, Inbox, Star } from 'lucide-react-native';

import { EmptyState } from '@/components/empty-state';
import { ErrorBanner } from '@/components/error-banner';
import { ReviewRowSkeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing, TypeScale } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';
import { useFreeApp } from '@/hooks/use-free-app';
import { usePaywallGate } from '@/hooks/use-paywall-gate';
import { describeASCError, toASCError } from '@/lib/api/asc-errors';
import { useAllAppsQuery, useAllReviewsQuery } from '@/lib/api/asc-queries';
import { haptic } from '@/lib/utils/haptics';
import {
  countReviews,
  filterReviews,
  type ReviewFilter,
  type ReviewSummary,
} from '@/lib/domain/review-feed';
import { useAccountsStore } from '@/lib/state/accounts';

import { FilterBar } from '@/features/reviews/filter-bar';
import { ReviewRow } from '@/features/reviews/review-row';

const DEFAULT_FILTER: ReviewFilter = { status: 'all', ratingBuckets: [], appIds: [] };
const ASC_KEYS_URL = 'https://appstoreconnect.apple.com/access/integrations/api';

export default function ReviewsInboxScreen() {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  const accounts = useAccountsStore((s) => s.accounts);
  const appsQuery = useAllAppsQuery();
  const apps = appsQuery.data?.apps ?? [];
  const reviewsResult = useAllReviewsQuery({ apps });

  const [filter, setFilter] = useState<ReviewFilter>(DEFAULT_FILTER);

  const counts = useMemo(() => countReviews(reviewsResult.reviews), [reviewsResult.reviews]);
  const filtered = useMemo(
    () => filterReviews(reviewsResult.reviews, filter),
    [reviewsResult.reviews, filter],
  );

  const { isLocked } = useFreeApp();
  const gate = usePaywallGate();

  const handleReviewPress = useCallback(
    (reviewAscId: string, reviewAppId: string) => {
      if (isLocked(reviewAppId)) {
        // Locked app → straight to paywall with the primary-gate reason
        // (matches the lock badge UX on the Releases tab).
        gate.openPaywall('add-app-limit');
        return;
      }
      router.push({
        pathname: '/(tabs)/reviews/[id]',
        params: { id: reviewAscId, appId: reviewAppId },
      });
    },
    [gate, isLocked],
  );

  const onRefresh = useCallback(() => {
    void appsQuery.refetch();
    reviewsResult.refetch();
  }, [appsQuery, reviewsResult]);

  const wasFetching = useRef(false);
  useEffect(() => {
    if (wasFetching.current && !reviewsResult.isFetching && !reviewsResult.isError) {
      void haptic.light();
    }
    wasFetching.current = reviewsResult.isFetching;
  }, [reviewsResult.isFetching, reviewsResult.isError]);

  // No accounts → onboarding hand-off
  if (accounts.length === 0) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]} edges={['top']}>
        <Header palette={palette} />
        <EmptyState
          icon={AppWindow}
          title="No accounts connected"
          body="Connect an App Store Connect API key to see your customer reviews."
          cta={{ label: 'Connect an account', onPress: () => router.push('/(onboarding)/why-asc') }}
        />
      </SafeAreaView>
    );
  }

  if (reviewsResult.isLoading && reviewsResult.reviews.length === 0) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]} edges={['top']}>
        <Header palette={palette} />
        <View style={styles.skeletonList} accessibilityLabel="Loading reviews">
          <ReviewRowSkeleton />
          <ReviewRowSkeleton />
          <ReviewRowSkeleton />
          <ReviewRowSkeleton />
        </View>
      </SafeAreaView>
    );
  }

  // Permission error (most likely 403 — key lacks Customer Support role)
  const firstError = reviewsResult.errors[0];
  const firstASCError = firstError ? toASCError(firstError) : null;
  const isPermissionError =
    firstASCError?.kind === 'forbidden' || firstASCError?.kind === 'unauthorized';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]} edges={['top']}>
      <Header palette={palette} />

      <FilterBar apps={apps} filter={filter} counts={counts} onChange={setFilter} />

      {reviewsResult.isError && !isPermissionError && (
        <ErrorBanner
          variant="error"
          message={describeASCError(toASCError(firstError)).title}
          actionLabel="Retry"
          onAction={onRefresh}
        />
      )}

      {isPermissionError && reviewsResult.reviews.length === 0 ? (
        <EmptyState
          icon={Star}
          title="Reviews are locked"
          body={
            'Your API key needs the "Customer Support" or "Admin" role to read reviews. ' +
            'Open App Store Connect to upgrade the key, or create a new one and reconnect.'
          }
          cta={{
            label: 'Open App Store Connect',
            onPress: () => void WebBrowser.openBrowserAsync(ASC_KEYS_URL),
          }}
        />
      ) : (
        <FlatList<ReviewSummary>
          data={filtered}
          keyExtractor={(item) => item.ascId}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.two }} />}
          renderItem={({ item }) => (
            <ReviewRow
              review={item}
              onPress={() => handleReviewPress(item.ascId, item.appId)}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon={Inbox}
              title="No reviews match"
              body={
                counts.total === 0
                  ? "Your apps don't have any reviews yet. When they do, they'll show up here."
                  : 'Try widening your filters to see more reviews.'
              }
            />
          }
          refreshControl={
            <RefreshControl
              refreshing={reviewsResult.isFetching && !reviewsResult.isLoading}
              onRefresh={onRefresh}
              tintColor={palette.accent}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

function Header({ palette }: { palette: typeof Colors.light | typeof Colors.dark }) {
  return (
    <View style={styles.header}>
      <ThemedText style={[TypeScale.title1, { color: palette.text }]}>
        Reviews
      </ThemedText>
      <ThemedText style={[TypeScale.subhead, { color: palette.textSecondary }]}>
        One inbox across every connected app.
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
    paddingTop: Spacing.two,
    paddingBottom: Spacing.six,
  },
  skeletonList: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    gap: Spacing.two,
  },
});
