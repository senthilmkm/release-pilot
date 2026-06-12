import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { ChevronRight, Lock } from 'lucide-react-native';

import { StateBadge } from '@/components/state-badge';
import { ThemedText } from '@/components/themed-text';
import { Colors, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';
import type { LatestStateSnapshot } from '@/lib/domain/version-events';

type Props = {
  appName: string;
  bundleId: string;
  teamName: string;
  /** Live state snapshot. `null` while the per-app versions query is loading. */
  snapshot: LatestStateSnapshot | null;
  /** True when the state query for THIS app is still in-flight. */
  isLoadingState?: boolean;
  /** True when the app is locked behind the Pro paywall (free-tier user's
   *  2nd+ app). Row stays tappable — the parent decides whether to open
   *  the detail screen or the paywall. We just show the visual affordance. */
  isLocked?: boolean;
  onPress?: () => void;
};

/**
 * Per-app row in the Releases tab.
 *
 * Renders, top to bottom:
 *   1. App icon (initial-bubble) + name + bundle/team
 *   2. State badge (or spinner while loading) + version string
 *   3. Chevron to drill into AppDetail
 */
export function AppRow({
  appName,
  bundleId,
  teamName,
  snapshot,
  isLoadingState,
  isLocked,
  onPress,
}: Props) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  const initial = appName.trim().charAt(0).toUpperCase() || '?';

  const accessibilityLabel = (() => {
    const base = snapshot && !snapshot.isEmpty
      ? `${appName}, v${snapshot.versionString} ${snapshot.state.replaceAll('_', ' ')}`
      : `${appName}, ${teamName}`;
    return isLocked ? `${base}. Pro only — opens paywall.` : base;
  })();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: palette.backgroundElevated,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.icon,
          { backgroundColor: isLocked ? palette.textTertiary : palette.accent },
        ]}
      >
        <ThemedText style={[TypeScale.title3, { color: '#FFFFFF' }]}>
          {initial}
        </ThemedText>
      </View>

      <View style={styles.text}>
        <View style={styles.titleRow}>
          <ThemedText
            style={[
              TypeScale.bodyEmph,
              { color: isLocked ? palette.textSecondary : palette.text, flexShrink: 1 },
            ]}
            numberOfLines={1}
          >
            {appName}
          </ThemedText>
          {isLocked && <ProBadge palette={palette} />}
        </View>
        <ThemedText
          style={[TypeScale.footnote, { color: palette.textSecondary }]}
          numberOfLines={1}
        >
          {bundleId} · {teamName}
        </ThemedText>

        <View style={styles.stateRow}>
          {isLoadingState ? (
            <View style={styles.statePlaceholder}>
              <ActivityIndicator size="small" color={palette.textTertiary} />
              <ThemedText style={[TypeScale.caption, { color: palette.textTertiary }]}>
                Loading state…
              </ThemedText>
            </View>
          ) : snapshot && !snapshot.isEmpty ? (
            <View style={styles.stateRowInner}>
              <StateBadge state={snapshot.state} variant="compact" />
              <ThemedText style={[TypeScale.caption, { color: palette.textTertiary }]} numberOfLines={1}>
                v{snapshot.versionString}
                {snapshot.buildNumber ? ` (${snapshot.buildNumber})` : ''}
              </ThemedText>
            </View>
          ) : (
            <ThemedText style={[TypeScale.caption, { color: palette.textTertiary }]}>
              No versions yet
            </ThemedText>
          )}
        </View>
      </View>

      <ChevronRight size={20} color={palette.textTertiary} strokeWidth={2} />
    </Pressable>
  );
}

function ProBadge({ palette }: { palette: typeof Colors.light | typeof Colors.dark }) {
  return (
    <View style={[styles.proBadge, { backgroundColor: palette.accentMuted }]}>
      <Lock size={10} color={palette.accent} strokeWidth={2.5} />
      <ThemedText style={[styles.proBadgeText, { color: palette.accent }]}>PRO</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: Radii.lg,
    gap: Spacing.three,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: Radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  proBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radii.sm,
  },
  proBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  stateRow: {
    marginTop: Spacing.one + 2,
  },
  stateRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  statePlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
});
