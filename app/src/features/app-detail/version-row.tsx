import React from 'react';
import { StyleSheet, View } from 'react-native';

import { StateBadge } from '@/components/state-badge';
import { ThemedText } from '@/components/themed-text';
import { Colors, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';
import { formatRelativeShort } from '@/lib/utils/date-format';
import type { VersionSummary } from '@/lib/domain/version-events';

type Props = {
  summary: VersionSummary;
  isFirst?: boolean;
  isLast?: boolean;
};

/**
 * One row in the App detail timeline. Renders:
 *   - vertical connector line (dot at the row's center, line above + below)
 *   - version + build number
 *   - state badge (compact)
 *   - relative timestamp ("3 days ago")
 *
 * Visual rhythm matches iOS Mail's "thread" view — a tight, scannable list
 * where state and time are the two things users care about most.
 */
export function VersionRow({ summary, isFirst, isLast }: Props) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  return (
    <View style={styles.row}>
      <View style={styles.rail}>
        <View
          style={[
            styles.lineSegment,
            isFirst && styles.invisible,
            { backgroundColor: palette.border },
          ]}
        />
        <View style={[styles.dot, { borderColor: palette.accent, backgroundColor: palette.background }]} />
        <View
          style={[
            styles.lineSegment,
            isLast && styles.invisible,
            { backgroundColor: palette.border },
          ]}
        />
      </View>

      <View style={[styles.card, { backgroundColor: palette.backgroundElevated }]}>
        <View style={styles.header}>
          <View style={styles.versionGroup}>
            <ThemedText style={[TypeScale.bodyEmph, { color: palette.text }]}>
              v{summary.versionString}
            </ThemedText>
            {summary.buildNumber && (
              <ThemedText style={[TypeScale.footnote, { color: palette.textTertiary }]}>
                ({summary.buildNumber})
              </ThemedText>
            )}
          </View>
          <StateBadge
            state={summary.state}
            variant="compact"
            superseded={summary.isSuperseded}
          />
        </View>

        <ThemedText style={[TypeScale.caption, { color: palette.textTertiary }]}>
          {formatRelativeShort(summary.createdAt)}
          {summary.scheduledReleaseAt && summary.state === 'approved_scheduled' && (
            <> · scheduled {formatRelativeShort(summary.scheduledReleaseAt)}</>
          )}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 72,
  },
  rail: {
    width: 32,
    alignItems: 'center',
  },
  lineSegment: {
    flex: 1,
    width: 2,
  },
  invisible: {
    backgroundColor: 'transparent',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  card: {
    flex: 1,
    marginVertical: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radii.md,
    gap: Spacing.one,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  versionGroup: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.one,
  },
});
