import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CheckCheck, ChevronRight, Clock, MessageSquareReply } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';
import { formatRelativeShort } from '@/lib/utils/date-format';
import type { ReviewSummary } from '@/lib/domain/review-feed';

import { RatingStars } from './rating-stars';

type Props = {
  review: ReviewSummary;
  onPress?: () => void;
};

/**
 * One review in the unified inbox.
 *
 * Layout:
 *   Top: stars + relative time + reply state indicator (right-aligned)
 *   Mid: title (bold, 1 line)
 *   Bot: snippet (regular, 2 lines max) + "—nickname · app · territory"
 */
export function ReviewRow({ review, onPress }: Props) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  const time = formatRelativeShort(review.createdAt);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${review.rating}-star review of ${review.appName} by ${review.reviewerNickname}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: palette.backgroundElevated,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <RatingStars rating={review.rating} size={14} />
        <View style={styles.headerRight}>
          <ReplyStateBadge state={review.reply.kind} palette={palette} />
          <ThemedText style={[TypeScale.caption, { color: palette.textTertiary }]}>
            {time}
          </ThemedText>
        </View>
      </View>

      {review.title.length > 0 && (
        <ThemedText
          style={[TypeScale.bodyEmph, { color: palette.text }]}
          numberOfLines={1}
        >
          {review.title}
        </ThemedText>
      )}

      <ThemedText
        style={[TypeScale.subhead, { color: palette.textSecondary }]}
        numberOfLines={2}
      >
        {review.body}
      </ThemedText>

      <View style={styles.metaRow}>
        <ThemedText
          style={[TypeScale.caption, { color: palette.textTertiary }]}
          numberOfLines={1}
        >
          —{review.reviewerNickname} · {review.appName}
          {review.territory ? ` · ${review.territory}` : ''}
        </ThemedText>
        <ChevronRight size={16} color={palette.textTertiary} strokeWidth={2} />
      </View>
    </Pressable>
  );
}

function ReplyStateBadge({
  state,
  palette,
}: {
  state: ReviewSummary['reply']['kind'];
  palette: typeof Colors.light | typeof Colors.dark;
}) {
  if (state === 'none') {
    return (
      <View style={[styles.badge, { backgroundColor: palette.warningBg }]}>
        <MessageSquareReply size={11} color={palette.warningFg} strokeWidth={2.4} />
        <ThemedText style={[styles.badgeText, { color: palette.warningFg }]}>
          Needs reply
        </ThemedText>
      </View>
    );
  }
  if (state === 'pending_local') {
    return (
      <View style={[styles.badge, { backgroundColor: palette.infoBg }]}>
        <Clock size={11} color={palette.infoFg} strokeWidth={2.4} />
        <ThemedText style={[styles.badgeText, { color: palette.infoFg }]}>
          Sending…
        </ThemedText>
      </View>
    );
  }
  if (state === 'pending_publish') {
    return (
      <View style={[styles.badge, { backgroundColor: palette.infoBg }]}>
        <Clock size={11} color={palette.infoFg} strokeWidth={2.4} />
        <ThemedText style={[styles.badgeText, { color: palette.infoFg }]}>
          In moderation
        </ThemedText>
      </View>
    );
  }
  return (
    <View style={[styles.badge, { backgroundColor: palette.successBg }]}>
      <CheckCheck size={11} color={palette.successFg} strokeWidth={2.4} />
      <ThemedText style={[styles.badgeText, { color: palette.successFg }]}>
        Replied
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    padding: Spacing.three,
    borderRadius: Radii.lg,
    gap: Spacing.one + 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.one + 2,
    paddingVertical: 2,
    borderRadius: Radii.pill,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
});
