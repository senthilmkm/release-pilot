import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Star } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';
import type { AggregatedAppRow } from '@/lib/api/asc-queries';
import type { ReviewCounts, ReviewFilter } from '@/lib/domain/review-feed';

type Props = {
  apps: AggregatedAppRow[];
  filter: ReviewFilter;
  counts: ReviewCounts;
  onChange: (filter: ReviewFilter) => void;
};

/**
 * Horizontal scroll of filter chips above the inbox.
 *
 * Three groups, in priority order:
 *   1. Status (All / Needs Reply / Replied)
 *   2. Rating buckets (Negative / Neutral / Positive) with counts
 *   3. App filter — only shown when 2+ apps are connected
 *
 * Chips behave like radio + multiselect:
 *   - Status: radio (only one at a time)
 *   - Ratings: multiselect (empty = all)
 *   - Apps: multiselect (empty = all)
 */
export function FilterBar({ apps, filter, counts, onChange }: Props) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  const status = filter.status ?? 'all';
  const ratingSet = new Set(filter.ratingBuckets ?? []);
  const appSet = new Set(filter.appIds ?? []);

  const toggleRating = (bucket: 'negative' | 'neutral' | 'positive') => {
    const next = new Set(ratingSet);
    if (next.has(bucket)) next.delete(bucket);
    else next.add(bucket);
    onChange({ ...filter, ratingBuckets: Array.from(next) });
  };
  const toggleApp = (appId: string) => {
    const next = new Set(appSet);
    if (next.has(appId)) next.delete(appId);
    else next.add(appId);
    onChange({ ...filter, appIds: Array.from(next) });
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
      style={styles.scroll}
    >
      {/* status chips */}
      <FilterChip
        active={status === 'all'}
        label="All"
        count={counts.total}
        palette={palette}
        onPress={() => onChange({ ...filter, status: 'all' })}
      />
      <FilterChip
        active={status === 'needs_reply'}
        label="Needs reply"
        count={counts.needsReply}
        palette={palette}
        onPress={() => onChange({ ...filter, status: 'needs_reply' })}
      />
      <FilterChip
        active={status === 'replied'}
        label="Replied"
        count={counts.total - counts.needsReply}
        palette={palette}
        onPress={() => onChange({ ...filter, status: 'replied' })}
      />

      <Divider palette={palette} />

      {/* rating chips */}
      <FilterChip
        active={ratingSet.has('negative')}
        label="1-2"
        leadingIcon="star"
        count={counts.negative}
        palette={palette}
        tone="warning"
        onPress={() => toggleRating('negative')}
      />
      <FilterChip
        active={ratingSet.has('neutral')}
        label="3"
        leadingIcon="star"
        count={counts.neutral}
        palette={palette}
        onPress={() => toggleRating('neutral')}
      />
      <FilterChip
        active={ratingSet.has('positive')}
        label="4-5"
        leadingIcon="star"
        count={counts.positive}
        palette={palette}
        tone="success"
        onPress={() => toggleRating('positive')}
      />

      {apps.length >= 2 && (
        <>
          <Divider palette={palette} />
          {apps.map((app) => (
            <FilterChip
              key={app.ascId}
              active={appSet.has(app.ascId)}
              label={app.name}
              palette={palette}
              onPress={() => toggleApp(app.ascId)}
            />
          ))}
        </>
      )}
    </ScrollView>
  );
}

function FilterChip({
  active,
  label,
  count,
  leadingIcon,
  tone,
  palette,
  onPress,
}: {
  active: boolean;
  label: string;
  count?: number;
  leadingIcon?: 'star';
  tone?: 'default' | 'success' | 'warning';
  palette: typeof Colors.light | typeof Colors.dark;
  onPress: () => void;
}) {
  const activeBg = palette.accent;
  const activeFg = palette.textInverse;
  const idleBg = palette.backgroundElevated;
  const idleFg = palette.textSecondary;

  const a11yLabel = typeof count === 'number' && count > 0
    ? `${label}, ${count}`
    : label;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={a11yLabel}
      accessibilityHint={active ? 'Currently selected' : 'Tap to filter'}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: active ? activeBg : idleBg, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      {leadingIcon === 'star' && (
        <Star
          size={11}
          color={active ? activeFg : tone === 'warning' ? palette.warningFg : tone === 'success' ? palette.successFg : idleFg}
          fill={active ? activeFg : tone === 'warning' ? palette.warningFg : tone === 'success' ? palette.successFg : 'transparent'}
        />
      )}
      <ThemedText style={[TypeScale.captionEmph, { color: active ? activeFg : idleFg }]}>
        {label}
        {typeof count === 'number' && count > 0 && (
          <ThemedText style={[TypeScale.caption, { color: active ? activeFg : palette.textTertiary }]}>
            {' '}{count}
          </ThemedText>
        )}
      </ThemedText>
    </Pressable>
  );
}

function Divider({ palette }: { palette: typeof Colors.light | typeof Colors.dark }) {
  return <View style={[styles.divider, { backgroundColor: palette.border }]} />;
}

const styles = StyleSheet.create({
  scroll: {
    maxHeight: 44,
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.one + 2,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radii.pill,
    height: 30,
  },
  divider: {
    width: 1,
    height: 18,
    marginHorizontal: Spacing.one,
  },
});
