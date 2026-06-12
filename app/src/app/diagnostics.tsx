import React, { useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Application from 'expo-application';
import * as Clipboard from 'expo-clipboard';
import * as Notifications from 'expo-notifications';
import { Bell, Bug, Check, ChevronLeft, Copy, X } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';
import { useAccountsStore } from '@/lib/state/accounts';
import { useEntitlement } from '@/hooks/use-entitlement';
import { describeEntitlement } from '@/lib/subscription/entitlements';
import { usePushRegistrationStore } from '@/lib/state/push-registration';
import { useIsOnline } from '@/hooks/use-is-online';
import { getChecklistRuns } from '@/lib/subscription/gate-counters';
import { haptic } from '@/lib/utils/haptics';

/**
 * Diagnostics screen. The "what's wrong" page users hit when something
 * isn't working as expected. Also the page they screenshot when
 * reporting issues — so every line should be self-explanatory and
 * the whole payload should be one-tap copyable to clipboard.
 *
 * No PII / secrets: we show issuer ID prefixes only, never the .p8
 * or APNs token contents. This page is safe to share publicly.
 */
export default function DiagnosticsScreen() {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  const accounts = useAccountsStore((s) => s.accounts);
  const { entitlement, status: subStatus } = useEntitlement();
  const pushRegMap = usePushRegistrationStore((s) => s.registrations);
  const deviceToken = usePushRegistrationStore((s) => s.deviceToken);
  const pushReg = useMemo(() => Object.values(pushRegMap), [pushRegMap]);
  const online = useIsOnline();
  const recentRuns = getChecklistRuns();

  const buildVersion = `${Application.nativeApplicationVersion ?? '?'} (${Application.nativeBuildVersion ?? '?'})`;

  const blocks = useMemo<DiagBlock[]>(() => {
    return [
      {
        title: 'App',
        rows: [
          ['Bundle ID',     Application.applicationId ?? '?'],
          ['Version',       buildVersion],
          ['Online',        online ? 'Yes' : 'No (offline)'],
        ],
      },
      {
        title: 'Subscription',
        rows: [
          ['Tier',          describeEntitlement(entitlement)],
          ['SDK status',    subStatus],
          ['In trial',      entitlement.isInTrial ? 'Yes' : 'No'],
          ['Grace period',  entitlement.isInGracePeriod ? 'Yes' : 'No'],
          ['Expires',       entitlement.expiresAtMs
            ? new Date(entitlement.expiresAtMs).toLocaleString()
            : '—'],
        ],
      },
      {
        title: `ASC accounts (${accounts.length})`,
        rows: accounts.length === 0
          ? [['(none)', '']]
          : accounts.map((a): [string, string] => [
              a.teamName,
              `${a.keyId} · ${a.issuerId.slice(0, 8)}…`,
            ]),
      },
      {
        title: `Push registrations (${pushReg.length})`,
        rows: [
          ['Device token',
            deviceToken ? `${deviceToken.slice(0, 8)}…${deviceToken.slice(-4)}` : '(not granted)',
          ],
          ...(pushReg.length === 0
            ? ([['Worker-side', '(none)']] as [string, string][])
            : pushReg.map((r): [string, string] => {
                const last = r.lastSyncAtMs
                  ? new Date(r.lastSyncAtMs).toLocaleString()
                  : 'never';
                return [
                  r.issuerId.slice(0, 8) + '…',
                  `synced ${last}`,
                ];
              })),
        ],
      },
      {
        title: 'Paywall counters',
        rows: [
          ['Checklist runs (7d)', `${recentRuns.length}`],
        ],
      },
    ];
  }, [buildVersion, online, entitlement, subStatus, accounts, deviceToken, pushReg, recentRuns]);

  const handleCopyAll = async () => {
    void haptic.light();
    const text = blocks
      .map((b) => `## ${b.title}\n` + b.rows.map(([k, v]) => `  ${k}: ${v}`).join('\n'))
      .join('\n\n');
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied', 'Diagnostics copied to clipboard. Paste into your support email.');
  };

  const handleSendTestPush = async () => {
    void haptic.light();
    const perm = await Notifications.getPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert(
        'Notifications off',
        'Enable notifications in iOS Settings → Release Pilot, then try again.',
      );
      return;
    }
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Recall: Personal Memory',
          body: 'Now In Review · Submitted 6h ago',
          sound: 'default',
          data: { type: 'diagnostic-test' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 8,
          repeats: false,
        },
      });
      Alert.alert(
        'Lock your phone now',
        'A test notification will arrive in 8 seconds. Press the side button to lock the screen so it appears on the Lock Screen.',
      );
    } catch (e) {
      Alert.alert('Could not send', String(e));
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.navButton}
        >
          <ChevronLeft size={28} color={palette.text} strokeWidth={2.2} />
        </Pressable>
        <ThemedText style={[TypeScale.bodyEmph, styles.headerTitle, { color: palette.text }]}>
          Diagnostics
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Copy diagnostics to clipboard"
          onPress={handleCopyAll}
          hitSlop={12}
          style={[styles.copyButton, { backgroundColor: palette.backgroundElevated }]}
        >
          <Copy size={14} color={palette.textSecondary} strokeWidth={2.2} />
          <ThemedText style={[TypeScale.captionEmph, { color: palette.textSecondary }]}>
            Copy
          </ThemedText>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.intro, { backgroundColor: palette.accentMuted }]}>
          <Bug size={16} color={palette.accent} strokeWidth={2.2} />
          <ThemedText style={[TypeScale.footnote, { color: palette.text, flex: 1 }]}>
            Everything here is non-sensitive. Tap Copy and paste into a
            support email if something looks wrong.
          </ThemedText>
        </View>

        {blocks.map((block) => (
          <View key={block.title} style={styles.block}>
            <ThemedText style={[TypeScale.captionEmph, styles.blockTitle, { color: palette.textTertiary }]}>
              {block.title.toUpperCase()}
            </ThemedText>
            <View style={[styles.blockBody, { backgroundColor: palette.backgroundElevated }]}>
              {block.rows.map(([k, v], idx) => (
                <View
                  key={`${k}:${idx}`}
                  style={[
                    styles.row,
                    idx < block.rows.length - 1 && {
                      borderBottomColor: palette.border,
                      borderBottomWidth: StyleSheet.hairlineWidth,
                    },
                  ]}
                >
                  <ThemedText style={[TypeScale.footnote, { color: palette.textSecondary, flex: 1 }]}>
                    {k}
                  </ThemedText>
                  <ThemedText
                    style={[TypeScale.footnote, { color: palette.text, flexShrink: 1 }]}
                    numberOfLines={2}
                  >
                    {v}
                  </ThemedText>
                  {v === 'Yes' && <Check size={14} color={palette.successFg} strokeWidth={2.4} />}
                  {(v === 'No' || v === 'No (offline)') && (
                    <X size={14} color={palette.destructive} strokeWidth={2.4} />
                  )}
                </View>
              ))}
            </View>
          </View>
        ))}

        <View style={styles.block}>
          <ThemedText style={[TypeScale.captionEmph, styles.blockTitle, { color: palette.textTertiary }]}>
            TESTS
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send test notification in 8 seconds"
            onPress={handleSendTestPush}
            style={({ pressed }) => [
              styles.testButton,
              { backgroundColor: palette.backgroundElevated, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Bell size={18} color={palette.accent} strokeWidth={2.2} />
            <View style={styles.testButtonText}>
              <ThemedText style={[TypeScale.bodyEmph, { color: palette.text }]}>
                Send test notification
              </ThemedText>
              <ThemedText style={[TypeScale.footnote, { color: palette.textSecondary }]}>
                Arrives in 8 seconds. Lock your phone to capture the Lock Screen.
              </ThemedText>
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

type DiagBlock = { title: string; rows: [string, string][] };

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
  },
  navButton: { width: 44, height: 44, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center' },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radii.pill,
  },
  scroll: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  intro: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radii.md,
  },
  block: { gap: Spacing.two },
  blockTitle: { marginHorizontal: Spacing.two, letterSpacing: 0.5 },
  blockBody: {
    borderRadius: Radii.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radii.lg,
    minHeight: 64,
  },
  testButtonText: {
    flex: 1,
    gap: 2,
  },
});
