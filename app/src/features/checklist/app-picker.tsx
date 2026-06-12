import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Lock } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing, TypeScale } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';
import type { AggregatedAppRow } from '@/lib/api/asc-queries';

type Props = {
  apps: AggregatedAppRow[];
  selectedAppId: string | null;
  onSelect: (appId: string) => void;
  /** Optional predicate: `true` for apps the current user can't access
   *  (free-tier 2nd+ app). Chip stays tappable so the parent can route
   *  to paywall; we just paint it as locked. */
  isLocked?: (ascId: string) => boolean;
};

/**
 * Horizontal app-picker chip row above the checklist results.
 *
 * Hidden when only one app is connected (no value in picking).
 *
 * Design notes:
 *  - No leading icon bubble. Earlier iterations had one (first letter
 *    in a coloured circle) but it caused a visible first-frame artifact:
 *    on mount the chip layout briefly appeared as a circle.
 *  - Each chip has a FIXED width (`CHIP_WIDTH`). RN otherwise measures
 *    the chip in two passes (intrinsic padding-only first, then re-sizes
 *    once text width arrives) which on cold mount briefly produced a
 *    small square that looked round at the `borderRadius` we use. A
 *    fixed width eliminates the intermediate frame entirely.
 *  - `borderRadius: 14` (not `Radii.pill`) means even if a layout bug
 *    ever recurred, the chip cannot geometrically become a perfect
 *    circle — defence in depth.
 */

// Width chosen to fit the longest realistic app name ("Recall: Personal
// Memory") at subhead size while still leaving room for two chips on
// the smallest iPhone widths.
const CHIP_WIDTH = 180;

export function AppPicker({ apps, selectedAppId, onSelect, isLocked }: Props) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  if (apps.length < 2) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {apps.map((app) => {
        const active = app.ascId === selectedAppId;
        const locked = isLocked?.(app.ascId) ?? false;
        const accessibilityLabel = locked
          ? `${app.name}, Pro only — tap to upgrade`
          : `Run checklist on ${app.name}`;
        return (
          <Pressable
            key={app.ascId}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={accessibilityLabel}
            onPress={() => onSelect(app.ascId)}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: active ? palette.accent : palette.backgroundElevated,
                borderColor: active ? palette.accent : palette.border,
                opacity: pressed ? 0.85 : locked ? 0.75 : 1,
              },
            ]}
          >
            {locked && (
              <View style={styles.lockBubble}>
                <Lock
                  size={11}
                  color={active ? palette.textInverse : palette.textTertiary}
                  strokeWidth={2.5}
                />
              </View>
            )}
            <ThemedText
              style={[
                TypeScale.subhead,
                {
                  color: active
                    ? palette.textInverse
                    : locked
                      ? palette.textSecondary
                      : palette.text,
                  fontWeight: '600',
                  textAlign: 'center',
                  flexShrink: 1,
                },
              ]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {app.name}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  chip: {
    // Fixed width prevents the two-pass measurement flicker where the
    // chip first renders at padding-only width (~24px) before text
    // measures. With a 44px height + 14px radius, a 24px-wide box
    // would briefly look round on cold mount.
    width: CHIP_WIDTH,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
    overflow: 'hidden',
  },
  lockBubble: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
