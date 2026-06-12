import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Bell,
  BellOff,
  Bug,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  DollarSign,
  ExternalLink,
  LayoutGrid,
  Plus,
  RefreshCw,
  ShieldOff,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';
import { useAccountsStore } from '@/lib/state/accounts';
import { useAppRevenueCatStore } from '@/lib/state/app-revenuecat';
import { useAllAppsQuery } from '@/lib/api/asc-queries';
import { deleteRevenueCatSecret } from '@/lib/auth/revenuecat-credentials';
import { useEntitlement } from '@/hooks/use-entitlement';
import { usePaywallGate } from '@/hooks/use-paywall-gate';
import { useNotificationPermission } from '@/hooks/use-notification-permission';
import { restorePurchases } from '@/lib/subscription/purchase';
import { refreshSubscriptionState } from '@/lib/subscription/init';
import { describeEntitlement } from '@/lib/subscription/entitlements';
import { useSubscriptionStore } from '@/lib/state/subscription';
import { haptic } from '@/lib/utils/haptics';
import Purchases from 'react-native-purchases';

/**
 * More tab. Contains everything that doesn't need its own tab:
 *  - Subscription status + manage / restore actions
 *  - Connected ASC accounts (add gated by Pro on 2nd+)
 *  - Notifications hint
 *  - Diagnostics (build version)
 */

export default function MoreTab() {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  const accounts = useAccountsStore((s) => s.accounts);
  const removeAccount = useAccountsStore((s) => s.removeAccount);
  const rcByAppId = useAppRevenueCatStore((s) => s.byAscAppId);
  const removeRcEntry = useAppRevenueCatStore((s) => s.remove);
  const appsQuery = useAllAppsQuery();
  const { entitlement, status } = useEntitlement();
  const lastSyncedAtMs = useSubscriptionStore((s) => s.lastSyncedAtMs);
  const paywall = usePaywallGate();
  const notifPerm = useNotificationPermission();

  const [refreshing, setRefreshing] = useState(false);
  const [forceSyncing, setForceSyncing] = useState(false);

  /** Pull-to-refresh handler — bust the RC cache so any plan change
   *  made outside the app (iOS Settings, paywall on another device) is
   *  reflected immediately. */
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshSubscriptionState({ invalidateCache: true });
      void appsQuery.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [appsQuery]);

  /** Nuclear "Force re-sync with App Store" — re-fetches the StoreKit
   *  receipt from Apple and re-validates server-side. Only needed when
   *  cache invalidation alone didn't pick up a plan change (rare, but
   *  the manual escape hatch users need when something's clearly stuck). */
  const handleForceSync = useCallback(async () => {
    void haptic.light();
    setForceSyncing(true);
    try {
      await refreshSubscriptionState({ syncPurchases: true });
      void haptic.success();
      Alert.alert(
        'Synced',
        'Your subscription has been re-checked with the App Store.',
      );
    } catch (e) {
      void haptic.error();
      Alert.alert('Sync failed', String(e));
    } finally {
      setForceSyncing(false);
    }
  }, []);

  const handleAddAccount = useCallback(() => {
    const decision = paywall.check('add-account-limit');
    if (!decision.allowed) {
      paywall.openPaywall(decision.reason);
      return;
    }
    router.push('/(onboarding)/why-asc');
  }, [paywall]);

  const handleRestore = useCallback(async () => {
    const result = await restorePurchases();
    if (result.kind === 'success') {
      Alert.alert(
        result.isPro ? 'Pro restored' : 'Nothing to restore',
        result.isPro
          ? 'Your Pro subscription is active again.'
          : 'We didn\'t find a Pro purchase on this Apple ID.',
      );
    } else if (result.kind === 'error') {
      Alert.alert('Restore failed', result.message);
    }
  }, []);

  const handleManageSubscription = useCallback(async () => {
    if (Platform.OS !== 'ios') return;
    try {
      await Purchases.showManageSubscriptions();
    } catch {
      // Fallback: open the iOS Settings subscription page deep link.
      void Linking.openURL('https://apps.apple.com/account/subscriptions');
    }
  }, []);

  const handleRemoveAccount = useCallback(
    (issuerId: string, teamName: string) => {
      Alert.alert(
        'Disconnect account',
        `Disconnect ${teamName}? Your API key will be removed from this device.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disconnect',
            style: 'destructive',
            onPress: () => removeAccount(issuerId),
          },
        ],
      );
    },
    [removeAccount],
  );

  const handleRemoveRevenueCat = useCallback(
    (ascAppId: string, appName: string) => {
      Alert.alert(
        'Disconnect RevenueCat',
        `Stop showing revenue data for ${appName}? The secret key will be removed from this device. You can reconnect later.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disconnect',
            style: 'destructive',
            onPress: () => {
              // Order matters: clear the keychain first, then the store.
              // If the keychain delete fails, the store still has the
              // metadata so the user can re-try the disconnect cleanly.
              void deleteRevenueCatSecret(ascAppId).finally(() => {
                removeRcEntry(ascAppId);
              });
            },
          },
        ],
      );
    },
    [removeRcEntry],
  );

  const handleConnectRevenueCat = useCallback(
    (ascAppId: string, appName: string, bundleId: string) => {
      // RC connect is always Pro-only — for any app, on any tier. Free
      // users get the paywall with the "Connect RevenueCat" copy.
      // (Disconnect is NOT gated — users can always revoke a stored key.)
      const decision = paywall.check('connect-revenuecat-pro');
      if (!decision.allowed) {
        paywall.openPaywall(decision.reason);
        return;
      }
      router.push({
        pathname: '/(onboarding)/revenuecat-paste',
        params: { ascAppId, appName, bundleId },
      });
    },
    [paywall],
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]} edges={['top']}>
      <View style={styles.header}>
        <ThemedText style={[TypeScale.title1, { color: palette.text }]}>More</ThemedText>
        <ThemedText style={[TypeScale.subhead, { color: palette.textSecondary }]}>
          Subscription, accounts, and settings.
        </ThemedText>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={palette.accent}
          />
        }
      >
        {/* --- Subscription card --- */}
        <SectionLabel palette={palette}>SUBSCRIPTION</SectionLabel>
        <View style={[styles.card, { backgroundColor: palette.backgroundElevated }]}>
          <View style={styles.cardRow}>
            <View style={[styles.iconBubble, { backgroundColor: palette.accentMuted }]}>
              <Sparkles size={20} color={palette.accent} strokeWidth={2} />
            </View>
            <View style={styles.cardRowBody}>
              <ThemedText style={[TypeScale.bodyEmph, { color: palette.text }]}>
                {describeEntitlement(entitlement)}
              </ThemedText>
              <ThemedText style={[TypeScale.footnote, { color: palette.textSecondary }]}>
                {subscriptionSubtitle(entitlement, status)}
              </ThemedText>
              {lastSyncedAtMs ? (
                <ThemedText style={[TypeScale.caption, { color: palette.textTertiary }]}>
                  Synced {formatTimeAgo(lastSyncedAtMs)} · pull down to refresh
                </ThemedText>
              ) : null}
            </View>
          </View>

          {!entitlement.isPro && status !== 'unconfigured' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="See Pro plans"
              onPress={() => paywall.openPaywall()}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: palette.accent, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <ThemedText style={[TypeScale.bodyEmph, { color: palette.textInverse }]}>
                Upgrade to Pro
              </ThemedText>
            </Pressable>
          ) : entitlement.isPro ? (
            <View style={styles.proActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Change between Monthly and Yearly plans"
                onPress={() => paywall.openPaywall()}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { borderColor: palette.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Sparkles size={16} color={palette.text} strokeWidth={2.2} />
                <ThemedText style={[TypeScale.bodyEmph, { color: palette.text, flex: 1 }]}>
                  Change plan
                </ThemedText>
                <ChevronRight size={18} color={palette.textTertiary} strokeWidth={2.2} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Manage or cancel subscription in Apple ID Settings"
                onPress={handleManageSubscription}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { borderColor: palette.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <CreditCard size={16} color={palette.text} strokeWidth={2.2} />
                <ThemedText style={[TypeScale.bodyEmph, { color: palette.text, flex: 1 }]}>
                  Manage or cancel
                </ThemedText>
                <ChevronRight size={18} color={palette.textTertiary} strokeWidth={2.2} />
              </Pressable>
            </View>
          ) : null}

          <View style={styles.linkRowGroup}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Restore previous purchases"
              onPress={handleRestore}
              hitSlop={8}
              style={styles.linkRow}
            >
              <ThemedText style={[TypeScale.footnote, { color: palette.accent }]}>
                Restore Purchases
              </ThemedText>
            </Pressable>
            <ThemedText style={[TypeScale.footnote, { color: palette.textTertiary }]}>·</ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Force re-sync subscription with the App Store. Use this if your plan is stuck on a stale value after switching."
              onPress={handleForceSync}
              disabled={forceSyncing}
              hitSlop={8}
              style={styles.linkRow}
            >
              {forceSyncing ? (
                <ActivityIndicator color={palette.accent} />
              ) : (
                <>
                  <RefreshCw size={12} color={palette.accent} strokeWidth={2.4} />
                  <ThemedText style={[TypeScale.footnote, { color: palette.accent }]}>
                    Force re-sync
                  </ThemedText>
                </>
              )}
            </Pressable>
          </View>
        </View>

        {/* --- Accounts --- */}
        <SectionLabel palette={palette}>APP STORE CONNECT ACCOUNTS</SectionLabel>
        <View style={[styles.card, { backgroundColor: palette.backgroundElevated, padding: 0 }]}>
          {accounts.map((acc, i) => (
            <View key={acc.issuerId}>
              <View style={[styles.accountRow]}>
                <View style={[styles.iconBubble, { backgroundColor: palette.backgroundSelected }]}>
                  <Users size={18} color={palette.text} strokeWidth={2.2} />
                </View>
                <View style={styles.cardRowBody}>
                  <ThemedText style={[TypeScale.bodyEmph, { color: palette.text }]}>
                    {acc.teamName}
                  </ThemedText>
                  <ThemedText style={[TypeScale.footnote, { color: palette.textSecondary }]}>
                    Key {acc.keyId}
                  </ThemedText>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Disconnect ${acc.teamName}`}
                  onPress={() => handleRemoveAccount(acc.issuerId, acc.teamName)}
                  hitSlop={8}
                  style={styles.iconButton}
                >
                  <Trash2 size={18} color={palette.destructive} strokeWidth={2} />
                </Pressable>
              </View>
              {i < accounts.length - 1 && (
                <View style={[styles.divider, { backgroundColor: palette.border }]} />
              )}
            </View>
          ))}

          <View style={[styles.divider, { backgroundColor: palette.border }]} />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add another App Store Connect account"
            onPress={handleAddAccount}
            style={({ pressed }) => [
              styles.accountRow,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <View style={[styles.iconBubble, { backgroundColor: palette.accentMuted }]}>
              <Plus size={18} color={palette.accent} strokeWidth={2.4} />
            </View>
            <View style={styles.cardRowBody}>
              <ThemedText style={[TypeScale.bodyEmph, { color: palette.accent }]}>
                Connect another account
              </ThemedText>
              {!entitlement.isPro && accounts.length >= 1 && (
                <ThemedText style={[TypeScale.caption, { color: palette.textTertiary }]}>
                  Pro feature
                </ThemedText>
              )}
            </View>
            <ChevronRight size={18} color={palette.textTertiary} strokeWidth={2.2} />
          </Pressable>
        </View>

        {/* --- RevenueCat --- */}
        <SectionLabel palette={palette}>REVENUE TRACKING (REVENUECAT)</SectionLabel>
        <View style={[styles.card, { backgroundColor: palette.backgroundElevated, padding: 0 }]}>
          {(appsQuery.data?.apps ?? []).length === 0 ? (
            <View style={styles.accountRow}>
              <View style={[styles.iconBubble, { backgroundColor: palette.backgroundSelected }]}>
                <DollarSign size={18} color={palette.textTertiary} strokeWidth={2.2} />
              </View>
              <View style={styles.cardRowBody}>
                <ThemedText style={[TypeScale.bodyEmph, { color: palette.text }]}>
                  No apps to connect
                </ThemedText>
                <ThemedText style={[TypeScale.footnote, { color: palette.textSecondary }]}>
                  Connect an App Store Connect account first.
                </ThemedText>
              </View>
            </View>
          ) : (
            (appsQuery.data?.apps ?? []).map((app, i, arr) => {
              const meta = rcByAppId[app.ascId];
              const isConnected = Boolean(meta?.verified);
              return (
                <View key={app.ascId}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      isConnected
                        ? `${app.name}: RevenueCat connected to project ${meta?.projectId}. Tap to update credentials.`
                        : `${app.name}: connect RevenueCat to see revenue here`
                    }
                    onPress={() => handleConnectRevenueCat(app.ascId, app.name, app.bundleId)}
                    style={({ pressed }) => [styles.accountRow, { opacity: pressed ? 0.7 : 1 }]}
                  >
                    <View
                      style={[
                        styles.iconBubble,
                        {
                          backgroundColor: isConnected
                            ? palette.successBg
                            : palette.backgroundSelected,
                        },
                      ]}
                    >
                      {isConnected ? (
                        <CheckCircle2 size={18} color={palette.successFg} strokeWidth={2.2} />
                      ) : (
                        <DollarSign size={18} color={palette.textSecondary} strokeWidth={2.2} />
                      )}
                    </View>
                    <View style={styles.cardRowBody}>
                      <ThemedText style={[TypeScale.bodyEmph, { color: palette.text }]}>
                        {app.name}
                      </ThemedText>
                      <ThemedText style={[TypeScale.footnote, { color: palette.textSecondary }]}>
                        {isConnected
                          ? `Connected · ${meta?.projectId ?? ''}`
                          : 'Tap to connect for MRR + subscriber counts'}
                      </ThemedText>
                    </View>
                    {isConnected ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Disconnect RevenueCat for ${app.name}`}
                        onPress={() => handleRemoveRevenueCat(app.ascId, app.name)}
                        hitSlop={8}
                        style={styles.iconButton}
                      >
                        <Trash2 size={18} color={palette.destructive} strokeWidth={2} />
                      </Pressable>
                    ) : (
                      <ChevronRight size={18} color={palette.textTertiary} strokeWidth={2.2} />
                    )}
                  </Pressable>
                  {i < arr.length - 1 && (
                    <View style={[styles.divider, { backgroundColor: palette.border }]} />
                  )}
                </View>
              );
            })
          )}
        </View>

        {/* --- Notifications ---
            Tri-state row that combines iOS permission AND Pro entitlement.
            Push notifications are Pro-only, so a free user with iOS perm
            granted still sees "Pro feature" (not "Enabled") because the
            worker won't actually deliver pushes to their device. Tap
            routes to paywall (free) or iOS Settings (pro). */}
        <SectionLabel palette={palette}>NOTIFICATIONS</SectionLabel>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            entitlement.isPro
              ? `Push notifications: ${notifPerm}. Tap to open iOS Settings.`
              : 'Push notifications are a Pro feature. Tap to see plans.'
          }
          onPress={() => {
            if (!entitlement.isPro) {
              paywall.openPaywall('push-notifications-pro');
              return;
            }
            Linking.openSettings();
          }}
          style={[styles.card, { backgroundColor: palette.backgroundElevated }]}
        >
          <View style={styles.cardRow}>
            <View
              style={[
                styles.iconBubble,
                {
                  backgroundColor: !entitlement.isPro
                    ? palette.accentMuted
                    : notifPerm === 'granted'
                      ? palette.successBg
                      : notifPerm === 'denied'
                        ? palette.destructiveMuted
                        : palette.backgroundSelected,
                },
              ]}
            >
              {!entitlement.isPro ? (
                <Bell size={18} color={palette.accent} strokeWidth={2.2} />
              ) : notifPerm === 'granted' ? (
                <CheckCircle2 size={18} color={palette.successFg} strokeWidth={2.2} />
              ) : notifPerm === 'denied' ? (
                <BellOff size={18} color={palette.destructive} strokeWidth={2.2} />
              ) : (
                <Bell size={18} color={palette.text} strokeWidth={2.2} />
              )}
            </View>
            <View style={styles.cardRowBody}>
              <ThemedText style={[TypeScale.bodyEmph, { color: palette.text }]}>
                Push notifications
              </ThemedText>
              <ThemedText style={[TypeScale.footnote, { color: palette.textSecondary }]}>
                {!entitlement.isPro
                  ? 'Pro · get pushed when a release changes state'
                  : notifPerm === 'granted'
                    ? 'Enabled · you\'ll be alerted on state changes'
                    : notifPerm === 'denied'
                      ? 'Disabled in iOS Settings — tap to enable'
                      : notifPerm === 'undetermined'
                        ? 'Not yet enabled — tap to allow'
                        : 'Not available on this device'}
              </ThemedText>
            </View>
            <ExternalLink size={16} color={palette.textTertiary} strokeWidth={2.2} />
          </View>
        </Pressable>

        {/* --- Home / Lock Screen widget --- */}
        <SectionLabel palette={palette}>HOME &amp; LOCK SCREEN</SectionLabel>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Learn how to add the Release Pilot widget to your Home or Lock Screen"
          onPress={() => router.push('/widget-instructions')}
          style={[styles.card, { backgroundColor: palette.backgroundElevated }]}
        >
          <View style={styles.cardRow}>
            <View style={[styles.iconBubble, { backgroundColor: palette.accentMuted }]}>
              <LayoutGrid size={18} color={palette.accent} strokeWidth={2.2} />
            </View>
            <View style={styles.cardRowBody}>
              <ThemedText style={[TypeScale.bodyEmph, { color: palette.text }]}>
                Add the widget
              </ThemedText>
              <ThemedText style={[TypeScale.footnote, { color: palette.textSecondary }]}>
                {entitlement.isPro
                  ? 'Six sizes, including Lock Screen — see all your apps at a glance'
                  : 'Six sizes, including Lock Screen · free shows 1 app, Pro shows all'}
              </ThemedText>
            </View>
            <ChevronRight size={18} color={palette.textTertiary} strokeWidth={2.2} />
          </View>
        </Pressable>

        {/* --- Diagnostics --- */}
        <SectionLabel palette={palette}>SUPPORT</SectionLabel>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open diagnostics — copy non-sensitive app state to clipboard"
          onPress={() => router.push('/diagnostics')}
          style={[styles.card, { backgroundColor: palette.backgroundElevated }]}
        >
          <View style={styles.cardRow}>
            <View style={[styles.iconBubble, { backgroundColor: palette.backgroundSelected }]}>
              <Bug size={18} color={palette.text} strokeWidth={2.2} />
            </View>
            <View style={styles.cardRowBody}>
              <ThemedText style={[TypeScale.bodyEmph, { color: palette.text }]}>
                Diagnostics
              </ThemedText>
              <ThemedText style={[TypeScale.footnote, { color: palette.textSecondary }]}>
                Version, accounts, subscription, push state
              </ThemedText>
            </View>
            <ChevronRight size={18} color={palette.textTertiary} strokeWidth={2.2} />
          </View>
        </Pressable>

        {/* --- Danger zone --- */}
        <SectionLabel palette={palette}>DANGER ZONE</SectionLabel>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Erase all data — delete all credentials, caches, and worker registration"
          onPress={() => router.push('/erase-data')}
          style={[styles.card, { backgroundColor: palette.backgroundElevated }]}
        >
          <View style={styles.cardRow}>
            <View style={[styles.iconBubble, { backgroundColor: palette.destructiveMuted }]}>
              <ShieldOff size={18} color={palette.destructive} strokeWidth={2.2} />
            </View>
            <View style={styles.cardRowBody}>
              <ThemedText style={[TypeScale.bodyEmph, { color: palette.text }]}>
                Erase all data
              </ThemedText>
              <ThemedText style={[TypeScale.footnote, { color: palette.textSecondary }]}>
                Reset to a fresh install — keys, caches, push, widgets
              </ThemedText>
            </View>
            <ChevronRight size={18} color={palette.textTertiary} strokeWidth={2.2} />
          </View>
        </Pressable>

        <ThemedText style={[TypeScale.caption, styles.footer, { color: palette.textTertiary }]}>
          Release Pilot · v1.0 · Made for indie iOS developers
        </ThemedText>
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionLabel({
  palette,
  children,
}: {
  palette: typeof Colors.light | typeof Colors.dark;
  children: string;
}) {
  return (
    <ThemedText style={[TypeScale.captionEmph, styles.sectionLabel, { color: palette.textTertiary }]}>
      {children}
    </ThemedText>
  );
}

/**
 * Compact "synced X ago" formatter. We intentionally cap at "1d ago" —
 * if it's been longer than a day, RC's foreground refresh hasn't fired
 * (or has been failing silently) and the user should pull-to-refresh
 * regardless of the exact delta.
 */
function formatTimeAgo(ms: number): string {
  const delta = Math.max(0, Date.now() - ms);
  const sec = Math.floor(delta / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return '> 1d ago';
}

function subscriptionSubtitle(
  entitlement: ReturnType<typeof useEntitlement>['entitlement'],
  status: ReturnType<typeof useEntitlement>['status'],
): string {
  // Treat "unconfigured" like "free" from the user's point of view —
  // everything in the free plan works; Pro plans will appear once the
  // RevenueCat key is wired up. No need to expose plumbing details.
  if (status === 'unconfigured') return 'Free plan · all free-tier features are available';
  if (status === 'loading') return 'Loading…';
  if (status === 'error') return 'Couldn\'t reach the App Store. Pull down to refresh later.';
  if (!entitlement.isPro) return 'Free plan · 1 app, 3 checklist runs / week, 2 replies / month';
  if (entitlement.expiresAtMs) {
    const when = new Date(entitlement.expiresAtMs).toLocaleDateString();
    return entitlement.isInTrial
      ? `Free trial ends ${when}`
      : `Renews ${when}`;
  }
  return 'Lifetime access — thank you!';
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    gap: 2,
  },
  scroll: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.two,
  },
  sectionLabel: {
    marginTop: Spacing.four,
    marginBottom: Spacing.two,
    marginHorizontal: Spacing.two,
    letterSpacing: 0.5,
  },
  card: {
    borderRadius: Radii.lg,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  cardRowBody: { flex: 1, gap: 2 },
  iconBubble: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryButton: {
    height: 44,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    height: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: Radii.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  proActions: {
    gap: Spacing.two,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  iconButton: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.three + 36 + Spacing.three,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.one,
    minHeight: 32,
  },
  linkRowGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  footer: {
    textAlign: 'center',
    marginTop: Spacing.five,
  },
});
