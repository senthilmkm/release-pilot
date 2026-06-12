import React, { useCallback } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { AlertCircle, ChevronLeft, ExternalLink } from 'lucide-react-native';

import { EmptyState } from '@/components/empty-state';
import { ThemedText } from '@/components/themed-text';
import { Colors, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';
import { describeASCError, toASCError } from '@/lib/api/asc-errors';
import {
  useAllAppsQuery,
  useAllReviewsQuery,
  useSubmitReplyMutation,
} from '@/lib/api/asc-queries';
import { formatRelativeShort } from '@/lib/utils/date-format';
import { useAccountsStore } from '@/lib/state/accounts';
import { usePaywallGate } from '@/hooks/use-paywall-gate';
import { haptic } from '@/lib/utils/haptics';

import { RatingStars } from '@/features/reviews/rating-stars';
import { ReplyComposer } from '@/features/reviews/reply-composer';

export default function ReviewDetailScreen() {
  const { id, appId } = useLocalSearchParams<{ id: string; appId: string }>();
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  const accounts = useAccountsStore((s) => s.accounts);
  const appsQuery = useAllAppsQuery();
  const apps = appsQuery.data?.apps ?? [];
  const reviewsResult = useAllReviewsQuery({ apps });

  const review = reviewsResult.reviews.find((r) => r.ascId === id);
  const app = apps.find((a) => a.ascId === (appId ?? review?.appId));
  const account = app ? accounts.find((a) => a.issuerId === app.issuerId) : null;

  const submitMutation = useSubmitReplyMutation();
  const paywall = usePaywallGate();

  const handleSubmit = useCallback(
    async (body: string) => {
      if (!review || !app || !account) return;
      // Gate BEFORE the network call so we don't waste an ASC POST on
      // a user who's about to see the paywall anyway.
      const gate = paywall.check('reply-to-review-limit');
      if (!gate.allowed) {
        paywall.openPaywall(gate.reason);
        return;
      }
      try {
        const result = await submitMutation.mutateAsync({
          reviewId: review.ascId,
          appId: app.ascId,
          issuerId: account.issuerId,
          keyId: account.keyId,
          body,
        });
        if (result.kind === 'queued') {
          void haptic.light();
          Alert.alert(
            'Saved for retry',
            "We couldn't reach Apple right now, so we'll send your reply automatically as soon as you're back online.",
          );
        } else {
          void haptic.success();
        }
        // Successful reply counts against the free-tier monthly quota.
        // Queued replies also count (they WILL be delivered once online).
        paywall.recordReviewReply();
        router.back();
      } catch (e) {
        void haptic.error();
        const err = toASCError(e);
        const d = describeASCError(err);
        Alert.alert(d.title, d.body);
      }
    },
    [account, app, review, submitMutation, paywall],
  );

  if (!review || !app || !account) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]} edges={['top']}>
        <Header palette={palette} title="Review" />
        <EmptyState
          icon={AlertCircle}
          title="Review unavailable"
          body="This review isn't in your local cache. Pull to refresh the inbox and try again."
          cta={{ label: 'Back to inbox', onPress: () => router.back() }}
        />
      </SafeAreaView>
    );
  }

  const openInAsc = () =>
    WebBrowser.openBrowserAsync(`https://appstoreconnect.apple.com/apps/${app.ascId}/ratings-and-reviews`);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]} edges={['top']}>
      <Header palette={palette} title={app.name} onAscPress={openInAsc} />

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: palette.backgroundElevated }]}>
          <View style={styles.cardHeader}>
            <RatingStars rating={review.rating} size={16} />
            <ThemedText style={[TypeScale.caption, { color: palette.textTertiary }]}>
              {formatRelativeShort(review.createdAt)}
              {review.territory ? ` · ${review.territory}` : ''}
            </ThemedText>
          </View>

          {review.title.length > 0 && (
            <ThemedText style={[TypeScale.title3, { color: palette.text }]}>
              {review.title}
            </ThemedText>
          )}

          <ThemedText style={[TypeScale.body, { color: palette.text }]}>
            {review.body}
          </ThemedText>

          <ThemedText style={[TypeScale.footnote, { color: palette.textSecondary }]}>
            —{review.reviewerNickname}
          </ThemedText>
        </View>

        {review.reply.kind !== 'none' && (
          <View
            style={[
              styles.existingReply,
              {
                backgroundColor: palette.infoBg,
                borderColor: palette.infoFg + '33',
              },
            ]}
          >
            <ThemedText style={[TypeScale.captionEmph, styles.replyLabel, { color: palette.infoFg }]}>
              {review.reply.kind === 'published'
                ? 'YOUR REPLY · PUBLISHED'
                : review.reply.kind === 'pending_publish'
                ? 'YOUR REPLY · IN MODERATION'
                : 'YOUR REPLY · SENDING…'}
            </ThemedText>
            <ThemedText style={[TypeScale.body, { color: palette.text }]}>
              {review.reply.body}
            </ThemedText>
            {review.reply.kind === 'published' && review.reply.lastModified && (
              <ThemedText style={[TypeScale.caption, { color: palette.textTertiary }]}>
                {formatRelativeShort(review.reply.lastModified)}
              </ThemedText>
            )}
          </View>
        )}
      </ScrollView>

      {review.reply.kind === 'none' && (
        <ReplyComposer
          isSending={submitMutation.isPending}
          onSubmit={handleSubmit}
          placeholder={`Reply to ${review.reviewerNickname}…`}
        />
      )}
    </SafeAreaView>
  );
}

function Header({
  palette,
  title,
  onAscPress,
}: {
  palette: typeof Colors.light | typeof Colors.dark;
  title: string;
  onAscPress?: () => void;
}) {
  return (
    <View style={styles.headerRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => router.back()}
        hitSlop={12}
        style={styles.navButton}
      >
        <ChevronLeft size={28} color={palette.text} strokeWidth={2.2} />
      </Pressable>
      <ThemedText style={[TypeScale.bodyEmph, styles.headerTitle, { color: palette.text }]} numberOfLines={1}>
        {title}
      </ThemedText>
      {onAscPress ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Open in App Store Connect"
          onPress={onAscPress}
          hitSlop={12}
          style={[styles.ascButton, { backgroundColor: palette.backgroundElevated }]}
        >
          <ExternalLink size={14} color={palette.textSecondary} strokeWidth={2.2} />
          <ThemedText style={[TypeScale.captionEmph, { color: palette.textSecondary }]}>
            ASC
          </ThemedText>
        </Pressable>
      ) : (
        <View style={styles.navButton} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
  },
  navButton: {
    width: 44,
    height: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  ascButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radii.pill,
  },
  scroll: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  card: {
    padding: Spacing.four,
    borderRadius: Radii.lg,
    gap: Spacing.two,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  existingReply: {
    padding: Spacing.three,
    borderRadius: Radii.md,
    borderWidth: 1,
    gap: Spacing.one + 2,
  },
  replyLabel: {
    letterSpacing: 0.5,
  },
});
