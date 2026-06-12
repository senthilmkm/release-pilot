import React, { useEffect, useMemo } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { Colors, Radii, Spacing } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';

/**
 * Animated shimmer skeleton. Used in place of spinners for cold-start
 * list loads (Releases, Reviews, Checklist) so the user sees the
 * approximate UI shape immediately instead of a vague spinner.
 *
 * Why: research consistently shows skeletons feel ~30% faster than
 * spinners on the same actual wait time.
 *
 * Pure React Native Animated (no reanimated needed for a 1-axis fade)
 * keeps this lightweight and avoids touching the worklet runtime.
 */
export function SkeletonBlock({
  width,
  height,
  radius = Radii.sm,
  style,
}: {
  width: number | `${number}%`;
  height: number;
  radius?: number;
  style?: object;
}) {
  // useMemo (rather than useRef.current) keeps eslint's `react-hooks/refs`
  // happy — Animated.Value is mutable, so we just need a stable instance.
  const opacity = useMemo(() => new Animated.Value(0.5), []);
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.5,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: palette.backgroundElevated,
          opacity,
        },
        style,
      ]}
    />
  );
}

/** Row that mirrors the AppRow shape — small thumb + 2 lines + badge. */
export function AppRowSkeleton() {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];
  return (
    <View style={[styles.row, { backgroundColor: palette.backgroundElement, borderColor: palette.border }]}>
      <SkeletonBlock width={40} height={40} radius={Radii.sm} />
      <View style={styles.rowText}>
        <SkeletonBlock width={'70%'} height={18} />
        <SkeletonBlock width={'40%'} height={14} />
      </View>
      <SkeletonBlock width={72} height={26} radius={Radii.pill} />
    </View>
  );
}

/** Row that mirrors the ReviewCard shape — stars + 2 text lines + meta. */
export function ReviewRowSkeleton() {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];
  return (
    <View style={[styles.reviewRow, { backgroundColor: palette.backgroundElement, borderColor: palette.border }]}>
      <View style={styles.reviewRowHead}>
        <SkeletonBlock width={88} height={14} />
        <SkeletonBlock width={56} height={12} />
      </View>
      <SkeletonBlock width={'85%'} height={16} />
      <SkeletonBlock width={'60%'} height={14} />
    </View>
  );
}

/** Generic body for the Checklist tab — 10 rule rows. */
export function ChecklistRowSkeleton() {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];
  return (
    <View style={[styles.checklistRow, { backgroundColor: palette.backgroundElement, borderColor: palette.border }]}>
      <SkeletonBlock width={20} height={20} radius={10} />
      <View style={styles.rowText}>
        <SkeletonBlock width={'65%'} height={16} />
        <SkeletonBlock width={'40%'} height={12} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, gap: Spacing.two },
  reviewRow: {
    padding: Spacing.three,
    borderRadius: Radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
  },
  reviewRowHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radii.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
