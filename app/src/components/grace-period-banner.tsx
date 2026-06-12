import React, { useCallback } from 'react';
import { Linking, Platform, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CreditCard } from 'lucide-react-native';
import Purchases from 'react-native-purchases';

import { ThemedText } from '@/components/themed-text';
import { Spacing, TypeScale } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';
import { useEntitlement } from '@/hooks/use-entitlement';
import { useIsOnline } from '@/hooks/use-is-online';

/**
 * Floating banner shown only when the user's Pro subscription is in a
 * billing grace period — Apple couldn't charge their card on the most
 * recent renewal attempt and is retrying for ~16 days. After that
 * window expires, the entitlement is revoked.
 *
 * This is the single most important "you're about to lose Pro" signal,
 * because without it the user only finds out when features silently
 * lock again. We tap → deep-link to iOS Subscriptions so they can
 * update their payment method in one step.
 *
 * Stacks below the OfflineBanner (top inset + 24) so both can show at
 * once without overlap.
 */
export function GracePeriodBanner() {
  const { entitlement } = useEntitlement();
  const online = useIsOnline();
  const insets = useSafeAreaInsets();
  const scheme = useResolvedScheme();

  const handleManage = useCallback(async () => {
    if (Platform.OS !== 'ios') return;
    try {
      await Purchases.showManageSubscriptions();
    } catch {
      void Linking.openURL('https://apps.apple.com/account/billing');
    }
  }, []);

  if (!entitlement.isInGracePeriod) return null;

  const bg = scheme === 'dark' ? '#4A0E0E' : '#FFE0E0';
  const fg = scheme === 'dark' ? '#FF8B85' : '#7A0014';
  const iconColor = scheme === 'dark' ? '#FF6B6B' : '#B00020';

  // Stack below offline banner when both are visible.
  const top = insets.top + (online ? 0 : 24);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Billing issue — tap to update payment method"
      onPress={handleManage}
      style={({ pressed }) => [
        styles.container,
        { top, backgroundColor: bg, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <CreditCard size={14} color={iconColor} strokeWidth={2.4} />
      <ThemedText style={[TypeScale.caption, styles.message, { color: fg }]} numberOfLines={2}>
        Apple couldn&apos;t renew your Pro subscription. Tap to update your payment method.
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.one + 2,
    zIndex: 999,
  },
  message: { flex: 0, textAlign: 'center' },
});
