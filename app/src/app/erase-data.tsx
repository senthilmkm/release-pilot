import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  KeyRound,
  LayoutDashboard,
  Mail,
  ShieldOff,
  Sparkles,
  Trash2,
} from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';
import { eraseAllData, type EraseResult } from '@/lib/auth/erase-all-data';
import { haptic } from '@/lib/utils/haptics';

/**
 * Apple App Review Guideline 5.1.1(v) — account deletion.
 *
 * Release Pilot does not maintain server-side user accounts, but the
 * ASC API key the user pastes is the practical equivalent. This screen
 * is the single, obvious entry point reviewers expect to see when they
 * look for "delete my account". Linked from the More tab under
 * "DANGER ZONE" and referenced explicitly in REVIEW_NOTES.md.
 *
 * UX choices:
 *  - Read-mostly explanation first, destructive button last (no risk
 *    of mis-taps from a quick scroll).
 *  - Single confirm Alert — two-step typed confirms are over-friction
 *    for a flow that's already explained line-by-line above.
 *  - Disabled-while-running state with a spinner — eraseAllData can
 *    take a few seconds (Keychain delete + Keychain delete + worker
 *    HTTP, etc.). Without feedback users will re-tap and get
 *    confused.
 *  - On completion we navigate to the onboarding welcome screen
 *    instead of just popping — the user's app is now in its
 *    first-launch state, so dropping them back into the tab they
 *    came from would render an empty Releases tab and confuse them.
 */
export default function EraseDataScreen() {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<EraseResult | null>(null);

  const handleErase = useCallback(() => {
    Alert.alert(
      'Erase all data?',
      'This permanently deletes every App Store Connect key, RevenueCat secret, cached app data, and reply draft from this device. Active App Store subscriptions are NOT cancelled (you manage those in Settings → Apple ID → Subscriptions).',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Erase everything',
          style: 'destructive',
          onPress: async () => {
            void haptic.warning();
            setRunning(true);
            const res = await eraseAllData();
            setResult(res);
            setRunning(false);
            void haptic.success();
            // Tiny delay so the success state can render briefly before
            // the navigation transition steals focus.
            setTimeout(() => {
              router.replace('/(onboarding)/welcome');
            }, 1200);
          },
        },
      ],
    );
  }, []);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]} edges={['top']}>
      <View style={styles.headerBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={12}
          onPress={() => router.back()}
        >
          <ChevronLeft size={26} color={palette.text} strokeWidth={2.2} />
        </Pressable>
        <ThemedText style={[TypeScale.title3, { color: palette.text }]}>
          Erase all data
        </ThemedText>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* --- Hero --- */}
        <View style={[styles.hero, { backgroundColor: palette.destructiveMuted }]}>
          <View style={[styles.heroIcon, { backgroundColor: palette.destructive }]}>
            <ShieldOff size={28} color="#FFFFFF" strokeWidth={2.2} />
          </View>
          <ThemedText style={[TypeScale.title2, { color: palette.text, textAlign: 'center' }]}>
            Reset Release Pilot to a fresh install
          </ThemedText>
          <ThemedText
            style={[TypeScale.subhead, { color: palette.textSecondary, textAlign: 'center' }]}
          >
            One tap, everything on this device — credentials, caches, drafts, and the worker
            registration that powers your push notifications.
          </ThemedText>
        </View>

        {/* --- What gets deleted --- */}
        <Section title="WHAT GETS DELETED" palette={palette}>
          <Row palette={palette} icon={<KeyRound size={18} />} title="App Store Connect API keys">
            Every connected team. The .p8 file is wiped from the iOS Keychain.
          </Row>
          <Row palette={palette} icon={<Sparkles size={18} />} title="RevenueCat secret keys">
            Every per-app secret key you&apos;ve connected for the Today briefing.
          </Row>
          <Row palette={palette} icon={<LayoutDashboard size={18} />} title="Cached app data">
            Releases, version history, customer reviews, draft replies, and the Live Activity /
            widget state on your Home & Lock Screens.
          </Row>
          <Row palette={palette} icon={<Mail size={18} />} title="Push registration">
            We call the Release Pilot worker to delete its row for this device, so Apple stops
            polling on your behalf and you&apos;ll receive no more notifications.
          </Row>
        </Section>

        {/* --- What does NOT get deleted --- */}
        <Section title="WHAT DOES NOT GET DELETED" palette={palette}>
          <Row palette={palette} icon={<AlertTriangle size={18} />} title="Your App Store subscription">
            Pro is billed by Apple, not Release Pilot. Cancel it in Settings → Apple ID →
            Subscriptions. (If you don&apos;t, the trial / renewal continues — but the app has no data
            to show until you re-add an API key.)
          </Row>
          <Row palette={palette} icon={<AlertTriangle size={18} />} title="The API key in App Store Connect itself">
            We can&apos;t revoke it for you. If you want belt-and-suspenders, also revoke it at{' '}
            appstoreconnect.apple.com → Users and Access → Integrations → App Store Connect API.
          </Row>
        </Section>

        {/* --- Result panel (only after running) --- */}
        {result && (
          <View
            style={[
              styles.resultPanel,
              {
                backgroundColor: result.ok ? palette.successBg : palette.destructiveMuted,
              },
            ]}
          >
            <CheckCircle2
              size={20}
              color={result.ok ? palette.successFg : palette.destructive}
              strokeWidth={2.2}
            />
            <View style={{ flex: 1, gap: 2 }}>
              <ThemedText style={[TypeScale.bodyEmph, { color: palette.text }]}>
                {result.ok ? 'All data erased' : 'Erase finished with warnings'}
              </ThemedText>
              <ThemedText style={[TypeScale.footnote, { color: palette.textSecondary }]}>
                {result.ok
                  ? 'Returning to the welcome screen…'
                  : 'Some steps failed (check Diagnostics for details). The app will still reset.'}
              </ThemedText>
            </View>
          </View>
        )}

        {/* --- Action button --- */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Erase everything"
          disabled={running || result !== null}
          onPress={handleErase}
          style={({ pressed }) => [
            styles.eraseButton,
            {
              backgroundColor: palette.destructive,
              opacity: running || result !== null ? 0.55 : pressed ? 0.85 : 1,
            },
          ]}
        >
          {running ? (
            <>
              <ActivityIndicator color="#FFFFFF" />
              <ThemedText style={[TypeScale.bodyEmph, { color: '#FFFFFF' }]}>Erasing…</ThemedText>
            </>
          ) : (
            <>
              <Trash2 size={18} color="#FFFFFF" strokeWidth={2.2} />
              <ThemedText style={[TypeScale.bodyEmph, { color: '#FFFFFF' }]}>
                Erase everything
              </ThemedText>
            </>
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          disabled={running}
          onPress={() => router.back()}
          style={styles.cancelButton}
        >
          <ThemedText style={[TypeScale.body, { color: palette.textSecondary }]}>
            Cancel
          </ThemedText>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------

function Section({
  title,
  palette,
  children,
}: {
  title: string;
  palette: typeof Colors.light | typeof Colors.dark;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <ThemedText
        style={[TypeScale.captionEmph, styles.sectionLabel, { color: palette.textTertiary }]}
      >
        {title}
      </ThemedText>
      <View style={[styles.sectionBody, { backgroundColor: palette.backgroundElevated }]}>
        {children}
      </View>
    </View>
  );
}

function Row({
  palette,
  icon,
  title,
  children,
}: {
  palette: typeof Colors.light | typeof Colors.dark;
  icon: React.ReactElement<{ color?: string; strokeWidth?: number }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: palette.backgroundSelected }]}>
        {React.cloneElement(icon, { color: palette.text, strokeWidth: 2.2 })}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <ThemedText style={[TypeScale.bodyEmph, { color: palette.text }]}>{title}</ThemedText>
        <ThemedText style={[TypeScale.footnote, { color: palette.textSecondary }]}>
          {children}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  scroll: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  hero: {
    padding: Spacing.four,
    borderRadius: Radii.lg,
    alignItems: 'center',
    gap: Spacing.two,
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  section: { gap: Spacing.two },
  sectionLabel: {
    marginHorizontal: Spacing.two,
    letterSpacing: 0.5,
  },
  sectionBody: {
    borderRadius: Radii.lg,
    paddingVertical: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radii.lg,
  },
  eraseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 52,
    borderRadius: Radii.md,
    marginTop: Spacing.two,
  },
  cancelButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.three,
  },
});
