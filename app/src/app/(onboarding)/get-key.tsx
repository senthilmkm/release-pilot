import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ExternalLink } from 'lucide-react-native';

import { InfoBullet } from '@/components/info-bullet';
import { OnboardingShell } from '@/features/onboarding/onboarding-shell';
import { ThemedText } from '@/components/themed-text';
import { Colors, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';

const ASC_KEYS_URL = 'https://appstoreconnect.apple.com/access/integrations/api';

export default function GetKeyScreen() {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  const openAsc = () => WebBrowser.openBrowserAsync(ASC_KEYS_URL);

  return (
    <OnboardingShell
      title="Get your API key"
      ctaLabel="I have all three"
      onCta={() => router.push('/(onboarding)/paste')}
      step={3}
      totalSteps={8}
    >
      <View style={styles.container}>
        <ThemedText style={[TypeScale.body, { color: palette.textSecondary }]}>
          On your Mac, iPad, or PC, open App Store Connect and head to{' '}
          <ThemedText style={[TypeScale.bodyEmph, { color: palette.text }]}>
            Users and Access → Integrations → Keys
          </ThemedText>
          . The button below opens it for you.
        </ThemedText>

        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Open App Store Connect in Safari"
          onPress={openAsc}
          style={({ pressed }) => [
            styles.linkButton,
            {
              backgroundColor: palette.backgroundElevated,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <ExternalLink size={16} color={palette.accent} strokeWidth={2.2} />
          <ThemedText style={[TypeScale.bodyEmph, { color: palette.accent }]}>
            Open App Store Connect
          </ThemedText>
        </Pressable>

        <View style={styles.bullets}>
          <InfoBullet
            number={1}
            title="Generate the key"
            body={'Tap "Generate API Key". Name it "Release Pilot" and set Access to "App Manager".'}
          />
          <InfoBullet
            number={2}
            title="Copy the Issuer ID"
            body="It's at the top of the Keys page — a GUID like 57246542-1234-5678-9abc-def012345678."
          />
          <InfoBullet
            number={3}
            title="Copy the Key ID"
            body="Listed under your new key — 10 characters, all uppercase (e.g. L9599VFG35)."
          />
          <InfoBullet
            number={4}
            title="Download the .p8 file"
            body={
              'Apple lets you download this only once. ' +
              'Then open it in any text editor (TextEdit, Notepad, Notes app on iPhone) ' +
              'and copy the entire contents — including the BEGIN/END lines.'
            }
          />
        </View>

        <ThemedText style={[TypeScale.footnote, styles.tip, { color: palette.textTertiary }]}>
          Tip: AirDrop the .p8 to your iPhone, then long-press it in Files → Share → copy to clipboard.
        </ThemedText>
      </View>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.four },
  bullets: { gap: Spacing.four },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    borderRadius: Radii.md,
    minHeight: 44,
  },
  tip: {
    marginTop: Spacing.two,
  },
});
