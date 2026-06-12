import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LockScreenMockup } from '@/features/onboarding/lock-screen-mockup';
import { ThemedText } from '@/components/themed-text';
import { Colors, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';

export default function WelcomeScreen() {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
      <View style={styles.container}>
        <View style={styles.hero}>
          <LockScreenMockup />

          <View style={styles.copy}>
            <ThemedText style={[TypeScale.displayLarge, styles.title, { color: palette.text }]}>
              Release Pilot
            </ThemedText>
            <ThemedText style={[TypeScale.title3, styles.subtitle, { color: palette.textSecondary }]}>
              App Store Connect, on your home screen.
            </ThemedText>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Get started"
            onPress={() => router.push('/(onboarding)/why-asc')}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: palette.accent, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <ThemedText style={[TypeScale.bodyEmph, { color: '#FFFFFF' }]}>
              Get started
            </ThemedText>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Restore a previous Pro subscription"
            onPress={() => router.push('/paywall')}
            hitSlop={8}
            style={styles.tertiaryButton}
          >
            <ThemedText style={[TypeScale.callout, { color: palette.accent }]}>
              Already a Pro subscriber? Restore
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: {
    flex: 1,
    paddingHorizontal: Spacing.five,
    paddingBottom: Spacing.five,
    justifyContent: 'space-between',
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.five,
  },
  copy: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center', fontWeight: '400' },
  actions: { gap: Spacing.three },
  primaryButton: {
    paddingVertical: Spacing.three + 2,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  tertiaryButton: {
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
});
