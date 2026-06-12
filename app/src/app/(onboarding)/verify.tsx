import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { AlertCircle, Check, ExternalLink } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';
import { describeASCError, toASCError } from '@/lib/api/asc-errors';
import { verifyAndPersistAccount } from '@/lib/auth/verify-and-persist';
import { useOnboardingDraft } from '@/lib/state/onboarding-draft';

const ASC_KEYS_URL = 'https://appstoreconnect.apple.com/access/integrations/api';

type Stage =
  | { kind: 'signing' }
  | { kind: 'fetching' }
  | { kind: 'success'; teamName: string; appsCount: number }
  | {
      kind: 'failed';
      title: string;
      body: string;
      actionLabel: string | null;
      /** True for 401/403 errors — show a "Generate a new key" secondary path. */
      isAuthIssue: boolean;
    };

export default function VerifyScreen() {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  const issuerId = useOnboardingDraft((s) => s.issuerId);
  const keyId = useOnboardingDraft((s) => s.keyId);
  const p8PEM = useOnboardingDraft((s) => s.p8PEM);
  const reset = useOnboardingDraft((s) => s.reset);

  const [stage, setStage] = useState<Stage>({ kind: 'signing' });

  // Use a ref so the run() effect doesn't double-execute if a fast retry
  // happens during the transient signing/fetching window.
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    void (async () => {
      // Tiny pause so the user perceives the "signing" step (avoids a
      // jarring flash if the call resolves in < 200ms).
      await new Promise((r) => setTimeout(r, 300));
      setStage({ kind: 'fetching' });

      const result = await verifyAndPersistAccount({ issuerId, keyId, p8PEM });

      if (result.ok) {
        setStage({
          kind: 'success',
          teamName: result.teamName,
          appsCount: result.appsCount,
        });
        reset(); // clear draft credentials from memory
        // Auto-advance to the RevenueCat connect step. It's optional —
        // user can skip and still get push notifications + trial + tabs.
        setTimeout(() => router.replace('/(onboarding)/revenuecat'), 900);
      } else {
        const describe = describeASCError(result.error);
        const ascErr = toASCError(result.error);
        const isAuthIssue =
          ascErr.kind === 'unauthorized' || ascErr.kind === 'forbidden';
        setStage({
          kind: 'failed',
          title: describe.title,
          body: describe.body,
          actionLabel: describe.actionLabel,
          isAuthIssue,
        });
      }
    })();
  }, [issuerId, keyId, p8PEM, reset]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
      <View style={styles.container}>
        {(stage.kind === 'signing' || stage.kind === 'fetching') && (
          <>
            <ActivityIndicator size="large" color={palette.accent} />
            <ThemedText style={[TypeScale.title2, { color: palette.text }]}>
              Connecting…
            </ThemedText>
            <View style={styles.steps}>
              <Step label="Signing JWT" done state={stage.kind === 'fetching'} />
              <Step label="Fetching apps" done={false} state={stage.kind === 'fetching'} />
            </View>
          </>
        )}

        {stage.kind === 'success' && (
          <>
            <View style={[styles.successBubble, { backgroundColor: '#E0F8E4' }]}>
              <Check size={36} color="#1F7A1F" strokeWidth={2.4} />
            </View>
            <ThemedText style={[TypeScale.title2, styles.center, { color: palette.text }]}>
              Connected
            </ThemedText>
            <ThemedText style={[TypeScale.body, styles.center, { color: palette.textSecondary }]}>
              {stage.teamName} · {stage.appsCount} app{stage.appsCount === 1 ? '' : 's'} found
            </ThemedText>
          </>
        )}

        {stage.kind === 'failed' && (
          <>
            <View style={[styles.errorBubble, { backgroundColor: palette.destructiveMuted }]}>
              <AlertCircle size={36} color={palette.destructive} strokeWidth={2.4} />
            </View>
            <ThemedText style={[TypeScale.title2, styles.center, { color: palette.text }]}>
              {stage.title}
            </ThemedText>
            <ThemedText style={[TypeScale.body, styles.center, { color: palette.textSecondary }]}>
              {stage.body}
            </ThemedText>
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={stage.actionLabel ?? 'Check your credentials and try again'}
                onPress={() => router.back()}
                style={({ pressed }) => [
                  styles.primary,
                  { backgroundColor: palette.accent, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <ThemedText style={[TypeScale.bodyEmph, { color: '#FFFFFF' }]}>
                  {stage.actionLabel ?? 'Check credentials'}
                </ThemedText>
              </Pressable>

              {stage.isAuthIssue && (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel="Open App Store Connect to generate a new key"
                  onPress={() => void WebBrowser.openBrowserAsync(ASC_KEYS_URL)}
                  hitSlop={8}
                  style={({ pressed }) => [styles.secondaryLink, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <ExternalLink size={14} color={palette.accent} strokeWidth={2.2} />
                  <ThemedText style={[TypeScale.callout, { color: palette.accent }]}>
                    Generate a new key in App Store Connect
                  </ThemedText>
                </Pressable>
              )}
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function Step({ label, done, state }: { label: string; done: boolean; state: boolean }) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];
  return (
    <View style={styles.stepRow}>
      <View
        style={[
          styles.stepDot,
          {
            backgroundColor: done ? '#1F7A1F' : state ? palette.accent : palette.border,
          },
        ]}
      >
        {done && <Check size={10} color="#FFFFFF" strokeWidth={3} />}
      </View>
      <ThemedText
        style={[
          TypeScale.subhead,
          { color: done || state ? palette.text : palette.textTertiary },
        ]}
      >
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.five,
  },
  steps: {
    marginTop: Spacing.three,
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  stepDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { textAlign: 'center' },
  successBubble: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBubble: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    width: '100%',
    marginTop: Spacing.three,
    gap: Spacing.two,
  },
  primary: {
    paddingVertical: Spacing.three + 2,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  secondaryLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.two,
    minHeight: 44,
  },
});
