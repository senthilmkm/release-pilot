import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Eye } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';

/**
 * Visual mockup of a Lock Screen Live Activity for the Welcome screen.
 * Hardcoded values — purely decorative. Real Live Activities arrive in Phase 5.
 */
export function LockScreenMockup() {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  return (
    <View style={[styles.lockScreen, { backgroundColor: palette.backgroundElevated }]}>
      <ThemedText style={[TypeScale.caption, styles.time, { color: palette.textTertiary }]}>
        9:41
      </ThemedText>

      <View style={[styles.activityCard, { backgroundColor: palette.background }]}>
        <View style={styles.appRow}>
          <View style={[styles.appIcon, { backgroundColor: palette.accent }]}>
            <ThemedText style={[TypeScale.captionEmph, { color: '#FFFFFF' }]}>R</ThemedText>
          </View>
          <View style={styles.appText}>
            <ThemedText style={[TypeScale.footnote, { color: palette.text }]}>
              Recall
            </ThemedText>
            <ThemedText style={[TypeScale.caption, { color: palette.textTertiary }]}>
              v2.0 (45)
            </ThemedText>
          </View>
          <View style={[styles.statePill, { backgroundColor: '#FFF4C2' }]}>
            <Eye size={11} color="#7A5C00" strokeWidth={2.4} />
            <ThemedText style={[styles.stateLabel, { color: '#7A5C00' }]}>
              In Review · 14m
            </ThemedText>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  lockScreen: {
    borderRadius: Radii.xl,
    padding: Spacing.three,
    width: '100%',
    maxWidth: 320,
    gap: Spacing.three,
    aspectRatio: 1.4,
    justifyContent: 'center',
  },
  time: {
    textAlign: 'center',
    fontSize: 11,
  },
  activityCard: {
    borderRadius: Radii.lg,
    padding: Spacing.three,
  },
  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  appIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appText: {
    flex: 1,
  },
  statePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radii.pill,
  },
  stateLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
});
