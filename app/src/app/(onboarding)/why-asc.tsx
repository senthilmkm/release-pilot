import React from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Eye, Lock, Unlink } from 'lucide-react-native';

import { InfoBullet } from '@/components/info-bullet';
import { OnboardingShell } from '@/features/onboarding/onboarding-shell';
import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing, TypeScale } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';

export default function WhyAscScreen() {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  return (
    <OnboardingShell
      title="Connect your App Store Connect account"
      ctaLabel="I'll set this up"
      onCta={() => router.push('/(onboarding)/get-key')}
      step={2}
      totalSteps={8}
    >
      <View style={styles.container}>
        <ThemedText style={[TypeScale.body, { color: palette.textSecondary }]}>
          Release Pilot needs an App Store Connect API key to read your apps,
          builds, and reviews.
        </ThemedText>

        <View style={styles.bullets}>
          <InfoBullet
            icon={Lock}
            title="Stays on your device"
            body="Your API key is stored in iOS Keychain, locked with Face ID. It never leaves your iPhone."
          />
          <InfoBullet
            icon={Eye}
            title="Read-only by default"
            body="Only review replies write. Everything else just reads — we can't modify your builds or submissions."
          />
          <InfoBullet
            icon={Unlink}
            title="Revoke anytime"
            body="Open App Store Connect → Users and Access → Integrations to disable the key whenever you want."
          />
        </View>
      </View>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.five },
  bullets: { gap: Spacing.four },
});
