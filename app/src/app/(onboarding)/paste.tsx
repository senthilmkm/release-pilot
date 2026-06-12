import React from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { HelpCircle, ShieldCheck } from 'lucide-react-native';

import { OnboardingShell } from '@/features/onboarding/onboarding-shell';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing, TypeScale } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';
import {
  isValidIssuerId,
  isValidKeyId,
  isValidP8PEM,
  validationMessage,
} from '@/lib/auth/credentials';
import { useOnboardingDraft } from '@/lib/state/onboarding-draft';

export default function PasteScreen() {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  const issuerId = useOnboardingDraft((s) => s.issuerId);
  const keyId = useOnboardingDraft((s) => s.keyId);
  const p8PEM = useOnboardingDraft((s) => s.p8PEM);
  const setField = useOnboardingDraft((s) => s.setField);

  const allValid = isValidIssuerId(issuerId) && isValidKeyId(keyId) && isValidP8PEM(p8PEM);

  return (
    <OnboardingShell
      title="Paste your credentials"
      ctaLabel="Connect"
      onCta={() => router.push('/(onboarding)/verify')}
      step={4}
      totalSteps={8}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Show the instructions again"
            onPress={() => router.back()}
            hitSlop={8}
            style={({ pressed }) => [styles.helpLink, { opacity: pressed ? 0.6 : 1 }]}
          >
            <HelpCircle size={14} color={palette.accent} strokeWidth={2.2} />
            <ThemedText style={[TypeScale.footnote, { color: palette.accent }]}>
              Show the instructions again
            </ThemedText>
          </Pressable>

          <TextField
            label="Issuer ID"
            value={issuerId}
            onChangeText={(v) => setField('issuerId', v)}
            placeholder="57246542-1234-5678-9abc-def012345678"
            error={validationMessage('issuerId', issuerId)}
            hint="GUID at the top of the Keys page in App Store Connect"
            valid={isValidIssuerId(issuerId)}
            showPasteButton
            autoComplete="off"
          />

          <TextField
            label="Key ID"
            value={keyId}
            onChangeText={(v) => setField('keyId', v.toUpperCase())}
            placeholder="L9599VFG35"
            error={validationMessage('keyId', keyId)}
            hint="10 uppercase letters/digits, shown next to your new key"
            valid={isValidKeyId(keyId)}
            showPasteButton
            autoComplete="off"
            maxLength={10}
          />

          <TextField
            label="Private Key (.p8)"
            value={p8PEM}
            onChangeText={(v) => setField('p8PEM', v)}
            placeholder="-----BEGIN PRIVATE KEY-----&#10;MIGHAgEAMBM...&#10;-----END PRIVATE KEY-----"
            error={validationMessage('p8', p8PEM)}
            hint="Open the downloaded .p8 file in any text editor and paste the full contents (including BEGIN/END lines)"
            valid={isValidP8PEM(p8PEM)}
            showPasteButton
            multiline
          />

          <View style={styles.security}>
            <ShieldCheck size={16} color={palette.textTertiary} strokeWidth={2.2} />
            <ThemedText style={[TypeScale.footnote, { color: palette.textTertiary }]}>
              Stored locally in Keychain, gated by Face ID. Never sent to our servers.
            </ThemedText>
          </View>

          {!allValid && (
            <ThemedText style={[TypeScale.footnote, styles.disabledHint, { color: palette.textTertiary }]}>
              Fill in all three fields to continue.
            </ThemedText>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: Spacing.four, paddingBottom: Spacing.four },
  helpLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    alignSelf: 'flex-start',
    paddingVertical: Spacing.one,
  },
  security: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  disabledHint: {
    textAlign: 'center',
  },
});
