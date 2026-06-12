import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { ChevronLeft, ExternalLink, HelpCircle } from 'lucide-react-native';
import { router } from 'expo-router';

import { StateBadge } from '@/components/state-badge';
import { ThemedText } from '@/components/themed-text';
import {
  Colors,
  Radii,
  Spacing,
  TypeScale,
  type SemanticState,
} from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';
import { formatRelativeShort } from '@/lib/utils/date-format';

type Props = {
  appName: string;
  bundleId: string;
  teamName: string;
  currentState: SemanticState;
  currentVersion: string;
  currentBuild: string | null;
  scheduledReleaseAt: string | null;
  isEmpty: boolean;
  onStateHelpTap: () => void;
  ascAppId: string;
};

/**
 * App detail header.
 *
 * Hierarchy (top to bottom):
 *   - back arrow + ASC link
 *   - app icon + name + team
 *   - state badge (large) + `?` info icon → opens StateHelpModal
 *   - context line ("v1.8.23 (45)" + scheduled date if applicable)
 */
export function AppDetailHeader({
  appName,
  bundleId,
  teamName,
  currentState,
  currentVersion,
  currentBuild,
  scheduledReleaseAt,
  isEmpty,
  onStateHelpTap,
  ascAppId,
}: Props) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  const openInAsc = () =>
    WebBrowser.openBrowserAsync(`https://appstoreconnect.apple.com/apps/${ascAppId}/distribution/ios`);

  return (
    <View style={styles.container}>
      <View style={styles.navRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.navButton}
        >
          <ChevronLeft size={28} color={palette.text} strokeWidth={2.2} />
        </Pressable>

        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Open in App Store Connect"
          onPress={openInAsc}
          hitSlop={12}
          style={[styles.ascButton, { backgroundColor: palette.backgroundElevated }]}
        >
          <ExternalLink size={14} color={palette.textSecondary} strokeWidth={2.2} />
          <ThemedText style={[TypeScale.captionEmph, { color: palette.textSecondary }]}>
            ASC
          </ThemedText>
        </Pressable>
      </View>

      <View style={styles.identityRow}>
        <View style={[styles.appIcon, { backgroundColor: palette.accent }]}>
          <ThemedText style={[TypeScale.title2, { color: '#FFFFFF' }]}>
            {appName.trim().charAt(0).toUpperCase() || '?'}
          </ThemedText>
        </View>
        <View style={styles.identityText}>
          <ThemedText style={[TypeScale.title2, { color: palette.text }]} numberOfLines={1}>
            {appName}
          </ThemedText>
          <ThemedText
            style={[TypeScale.footnote, { color: palette.textSecondary }]}
            numberOfLines={1}
          >
            {bundleId} · {teamName}
          </ThemedText>
        </View>
      </View>

      {isEmpty ? (
        <ThemedText style={[TypeScale.body, { color: palette.textSecondary }]}>
          No versions submitted yet.
        </ThemedText>
      ) : (
        <>
          <View style={styles.stateRow}>
            <StateBadge state={currentState} variant="full" />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="What does this state mean?"
              onPress={onStateHelpTap}
              hitSlop={12}
              style={styles.helpButton}
            >
              <HelpCircle size={18} color={palette.textTertiary} strokeWidth={2.2} />
            </Pressable>
          </View>

          <View style={styles.contextRow}>
            <ThemedText style={[TypeScale.callout, { color: palette.textSecondary }]}>
              v{currentVersion}
              {currentBuild && ` (${currentBuild})`}
            </ThemedText>
            {scheduledReleaseAt && currentState === 'approved_scheduled' && (
              <ThemedText style={[TypeScale.footnote, { color: palette.textTertiary }]}>
                · releasing {formatRelativeShort(scheduledReleaseAt)}
              </ThemedText>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    gap: Spacing.three,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  navButton: { width: 44, height: 44, justifyContent: 'center' },
  ascButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radii.pill,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  appIcon: {
    width: 56,
    height: 56,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityText: {
    flex: 1,
    gap: 2,
  },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  helpButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.one,
  },
});
