import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Star } from 'lucide-react-native';

import { Colors } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';

type Props = {
  rating: number;          // 1–5
  size?: number;
  showEmpty?: boolean;     // show 5 stars even when rating < 5
};

/**
 * 5-star visual rating. Filled stars use the warning yellow from our
 * palette (matches Apple's review-stars convention).
 */
export function RatingStars({ rating, size = 14, showEmpty = true }: Props) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  const total = showEmpty ? 5 : Math.max(1, Math.round(rating));
  return (
    <View style={styles.row} accessibilityRole="text" accessibilityLabel={`${rating} out of 5 stars`}>
      {Array.from({ length: total }, (_, i) => {
        const filled = i < rating;
        return (
          <Star
            key={i}
            size={size}
            color={filled ? '#F2A900' : palette.border}
            fill={filled ? '#F2A900' : 'transparent'}
            strokeWidth={2}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 2,
  },
});
