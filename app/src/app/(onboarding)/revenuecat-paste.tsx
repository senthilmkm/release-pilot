import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AlertCircle, CheckCircle2, ExternalLink, ShieldCheck } from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';

import { ThemedText } from '@/components/themed-text';
import { TextField } from '@/components/text-field';
import { OnboardingShell } from '@/features/onboarding/onboarding-shell';
import { Colors, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';
import { describeRevenueCatError } from '@/lib/api/revenuecat-errors';
import { verifyAndPersistRevenueCat } from '@/lib/auth/verify-and-persist-revenuecat';

const REVENUECAT_DASHBOARD_URL = 'https://app.revenuecat.com';

type Stage =
  | { kind: 'idle' }
  | { kind: 'verifying' }
  | { kind: 'success'; mrr: number; currency: string; activeSubs: number }
  | { kind: 'failed'; title: string; body: string; showRcLink: boolean };

/**
 * Per-app RevenueCat connect screen.
 *
 * Routed to from `revenuecat.tsx` (and also from the More tab later).
 * Receives `?ascAppId=...&appName=...&bundleId=...` so it knows which
 * app's RC project is being wired up.
 *
 * Validation strategy:
 *  - Soft-validate the projectId (non-empty) and secret (starts with "sk_")
 *  - Hard-validate by hitting `/metrics/overview` on tap of "Verify".
 *    This catches mismatched project/key pairs, revoked keys, and the
 *    mandatory overview scope. The optional 14-day chart is checked
 *    lazily on the Today detail screen so older keys fail softly there.
 */
export default function RevenueCatPasteScreen() {
  const params = useLocalSearchParams<{
    ascAppId: string;
    appName: string;
    bundleId: string;
  }>();
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  const ascAppId = String(params.ascAppId ?? '');
  const appName = String(params.appName ?? 'this app');
  const bundleId = String(params.bundleId ?? '');

  const [projectId, setProjectId] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });

  const projectIdValid = projectId.trim().length > 0;
  const secretKeyValid = secretKey.trim().startsWith('sk_') && secretKey.trim().length > 5;
  const canVerify = projectIdValid && secretKeyValid && stage.kind !== 'verifying';

  const verify = async () => {
    if (!canVerify) return;
    setStage({ kind: 'verifying' });

    const result = await verifyAndPersistRevenueCat({
      ascAppId,
      projectId: projectId.trim(),
      secretKey: secretKey.trim(),
    });

    if (result.ok) {
      setStage({
        kind: 'success',
        mrr: result.mrr,
        currency: result.currency,
        activeSubs: result.activeSubscriptions,
      });
      // Auto-pop after a beat so the user sees confirmation
      setTimeout(() => router.back(), 1100);
    } else {
      const described = describeRevenueCatError(result.error);
      setStage({
        kind: 'failed',
        title: described.title,
        body: described.body,
        showRcLink:
          result.error.kind === 'forbidden_missing_scope' ||
          result.error.kind === 'unauthorized',
      });
    }
  };

  return (
    <OnboardingShell
      title={`Connect RevenueCat for ${appName}`}
      ctaLabel={
        stage.kind === 'verifying'
          ? 'Verifying…'
          : stage.kind === 'success'
            ? 'Connected'
            : 'Verify & save'
      }
      onCta={verify}
      secondaryLabel="Skip this app"
      onSecondary={() => router.back()}
      step={6}
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
          <View style={[styles.appBadge, { backgroundColor: palette.backgroundElement, borderColor: palette.border }]}>
            <ThemedText style={[TypeScale.subhead, { color: palette.text }]}>
              {appName}
            </ThemedText>
            {bundleId.length > 0 && (
              <ThemedText style={[TypeScale.footnote, { color: palette.textSecondary }]}>
                {bundleId}
              </ThemedText>
            )}
          </View>

          <View style={[styles.instructionsCard, { backgroundColor: palette.accentMuted }]}>
            <ThemedText style={[TypeScale.footnote, styles.cardTitle, { color: palette.text }]}>
              Where to find these
            </ThemedText>
            <ThemedText style={[TypeScale.footnote, { color: palette.textSecondary }]}>
              <ThemedText style={{ color: palette.text, fontWeight: '600' }}>Project ID:</ThemedText>{' '}
              app.revenuecat.com → pick the project → look in the URL
              (e.g. {'`'}proj_abc123{'`'}), or Project Settings → General.
            </ThemedText>
            <ThemedText style={[TypeScale.footnote, { color: palette.textSecondary }]}>
              <ThemedText style={{ color: palette.text, fontWeight: '600' }}>Secret Key:</ThemedText>{' '}
              Project Settings → API keys → Secret API keys → Edit or + New secret API key → set API
              version to <ThemedText style={{ fontWeight: '600' }}>V2</ThemedText>. Under Charts
              metrics permissions, set all permission types to Read only.
            </ThemedText>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Open RevenueCat dashboard in your browser"
              onPress={() => void WebBrowser.openBrowserAsync(REVENUECAT_DASHBOARD_URL)}
              hitSlop={8}
              style={({ pressed }) => [styles.helpLink, { opacity: pressed ? 0.6 : 1 }]}
            >
              <ExternalLink size={14} color={palette.accent} strokeWidth={2.2} />
              <ThemedText style={[TypeScale.footnote, { color: palette.accent }]}>
                Open RevenueCat
              </ThemedText>
            </Pressable>
          </View>

          <TextField
            label="Project ID"
            value={projectId}
            onChangeText={setProjectId}
            placeholder="proj_abc123xyz456"
            hint="The unique project identifier shown in the dashboard URL"
            valid={projectIdValid}
            showPasteButton
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TextField
            label="V2 Secret API Key"
            value={secretKey}
            onChangeText={setSecretKey}
            placeholder="sk_••••••••••••••••••••••••"
            hint='Starts with "sk_". Stored only in iOS Keychain on this device.'
            valid={secretKeyValid}
            error={
              secretKey.length > 0 && !secretKey.trim().startsWith('sk_')
                ? 'Must start with "sk_" — public SDK keys (appl_/goog_) won\'t work for revenue data'
                : null
            }
            showPasteButton
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />

          <View style={styles.security}>
            <ShieldCheck size={16} color={palette.textTertiary} strokeWidth={2.2} />
            <ThemedText style={[TypeScale.footnote, { color: palette.textTertiary }]}>
              Read-only · stored in Keychain · never sent to our servers.
            </ThemedText>
          </View>

          {stage.kind === 'verifying' && (
            <View style={styles.statusRow}>
              <ActivityIndicator color={palette.accent} />
              <ThemedText style={[TypeScale.subhead, { color: palette.textSecondary }]}>
                Asking RevenueCat for this project&apos;s overview…
              </ThemedText>
            </View>
          )}

          {stage.kind === 'success' && (
            <View style={[styles.successCard, { backgroundColor: '#E0F8E4' }]}>
              <View style={styles.successHeader}>
                <CheckCircle2 size={20} color="#1F7A1F" strokeWidth={2.4} />
                <ThemedText style={[TypeScale.bodyEmph, { color: '#1F4F1F' }]}>
                  Connected
                </ThemedText>
              </View>
              <ThemedText style={[TypeScale.footnote, { color: '#1F4F1F' }]}>
                MRR {formatMoney(stage.mrr, stage.currency)} · {stage.activeSubs} active
                subscriber{stage.activeSubs === 1 ? '' : 's'}
              </ThemedText>
            </View>
          )}

          {stage.kind === 'failed' && (
            <View style={[styles.errorCard, { backgroundColor: palette.destructiveMuted }]}>
              <View style={styles.errorHeader}>
                <AlertCircle size={20} color={palette.destructive} strokeWidth={2.4} />
                <ThemedText style={[TypeScale.bodyEmph, { color: palette.destructive }]}>
                  {stage.title}
                </ThemedText>
              </View>
              <ThemedText style={[TypeScale.footnote, { color: palette.text }]}>
                {stage.body}
              </ThemedText>
              {stage.showRcLink && (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel="Open RevenueCat to update your key"
                  onPress={() => void WebBrowser.openBrowserAsync(REVENUECAT_DASHBOARD_URL)}
                  hitSlop={8}
                  style={({ pressed }) => [styles.errorLink, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <ExternalLink size={14} color={palette.accent} strokeWidth={2.2} />
                  <ThemedText style={[TypeScale.footnote, { color: palette.accent }]}>
                    Open RevenueCat
                  </ThemedText>
                </Pressable>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </OnboardingShell>
  );
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: amount >= 100 ? 0 : 2,
    }).format(amount);
  } catch {
    // Fallback if RC returns a non-ISO currency code
    return `${amount.toFixed(2)} ${currency}`;
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    gap: Spacing.three,
    paddingBottom: Spacing.four,
  },
  appBadge: {
    padding: Spacing.three,
    borderRadius: Radii.md,
    borderWidth: 1,
    alignItems: 'flex-start',
    gap: 2,
  },
  instructionsCard: {
    padding: Spacing.three,
    borderRadius: Radii.md,
    gap: Spacing.two,
  },
  cardTitle: {
    fontWeight: '600',
  },
  helpLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    alignSelf: 'flex-start',
    paddingVertical: Spacing.one,
    minHeight: 44,
  },
  security: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  successCard: {
    padding: Spacing.three,
    borderRadius: Radii.md,
    gap: Spacing.one,
  },
  successHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  errorCard: {
    padding: Spacing.three,
    borderRadius: Radii.md,
    gap: Spacing.two,
  },
  errorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  errorLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.one,
    minHeight: 44,
  },
});
