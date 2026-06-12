import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';

type Props = {
  title: string;
  ctaLabel: string;
  onCta: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  step: number;
  totalSteps: number;
  children?: React.ReactNode;
};

/**
 * Shared chrome for onboarding screens 2–7.
 *
 * Provides:
 *  - Back arrow (router.back)
 *  - Step indicator ("3 of 7")
 *  - Title
 *  - Body slot (children)
 *  - Sticky primary CTA + optional secondary
 *
 * Why a shell vs per-screen layouts: forces every onboarding step into the
 * same visual rhythm, which is the single biggest contributor to perceived
 * polish in onboarding flows.
 */
export function OnboardingShell({
  title,
  ctaLabel,
  onCta,
  secondaryLabel,
  onSecondary,
  step,
  totalSteps,
  children,
}: Props) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backButton}
        >
          <ChevronLeft size={28} color={palette.text} strokeWidth={2.2} />
        </Pressable>
        <ThemedText style={[TypeScale.footnote, { color: palette.textTertiary }]}>
          {step} of {totalSteps}
        </ThemedText>
        <View style={styles.backButton} />
      </View>

      <View style={styles.body}>
        <ThemedText style={[TypeScale.title1, styles.title, { color: palette.text }]}>
          {title}
        </ThemedText>
        <View style={styles.content}>{children}</View>
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={ctaLabel}
          onPress={onCta}
          style={({ pressed }) => [
            styles.primary,
            { backgroundColor: palette.accent, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <ThemedText style={[TypeScale.bodyEmph, { color: '#FFFFFF' }]}>
            {ctaLabel}
          </ThemedText>
        </Pressable>

        {secondaryLabel && onSecondary && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={secondaryLabel}
            onPress={onSecondary}
            style={styles.secondary}
          >
            <ThemedText style={[TypeScale.callout, { color: palette.textSecondary }]}>
              {secondaryLabel}
            </ThemedText>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    height: 44,
  },
  backButton: { width: 44, height: 44, justifyContent: 'center' },
  body: {
    flex: 1,
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.three,
    gap: Spacing.four,
  },
  title: {},
  content: { flex: 1 },
  actions: {
    paddingHorizontal: Spacing.five,
    paddingBottom: Spacing.four,
    gap: Spacing.two,
  },
  primary: {
    paddingVertical: Spacing.three + 2,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  secondary: {
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
});
