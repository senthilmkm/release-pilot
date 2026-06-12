import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { Bell, BellRing, Lock, Sparkle } from 'lucide-react-native';

import { InfoBullet } from '@/components/info-bullet';
import { OnboardingShell } from '@/features/onboarding/onboarding-shell';
import { ThemedText } from '@/components/themed-text';
import { Colors, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';
import { usePaywallGate } from '@/hooks/use-paywall-gate';
import { registerDeviceWithWorker } from '@/lib/push/register-device';
import { scheduleBriefingNotification } from '@/lib/push/schedule-briefing';

export default function NotificationsScreen() {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];
  const [requesting, setRequesting] = useState(false);
  const gate = usePaywallGate();

  const enable = async () => {
    // Push notifications are Pro-only — gate BEFORE the iOS permission
    // prompt fires so free users see a clear upgrade pitch instead of
    // burning their one-time "allow notifications" decision on a feature
    // that wouldn't deliver anyway. If they convert at the paywall the
    // app will return here and they can re-tap Enable.
    const decision = gate.check('push-notifications-pro');
    if (!decision.allowed) {
      gate.openPaywall(decision.reason);
      return;
    }

    setRequesting(true);
    try {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });

      if (status === 'granted') {
        // Permission just granted — try to grab the APNs token AND
        // register it with the worker for every connected ASC account.
        // We fire-and-forget; if it fails (network, worker down) the
        // background-fetch fallback in `_layout.tsx` will retry later.
        try {
          const tokenObj = await Notifications.getDevicePushTokenAsync();
          if (tokenObj.type === 'ios' && tokenObj.data) {
            void registerDeviceWithWorker({ deviceToken: tokenObj.data });
          }
        } catch {
          // Token capture can fail in Expo Go / simulators — non-blocking
        }

        // Schedule the daily 7am local push for the Briefing tab.
        // Local push doesn't require an APNs token, so this works even
        // when worker registration fails.
        void scheduleBriefingNotification();
      }
    } catch {
      // Permission failures aren't blocking; we proceed regardless.
    } finally {
      setRequesting(false);
      router.push('/(onboarding)/trial');
    }
  };

  const skip = () => router.push('/(onboarding)/trial');

  return (
    <OnboardingShell
      title="Get pushed when a release changes state"
      ctaLabel={requesting ? 'Asking iOS…' : 'Enable notifications'}
      onCta={enable}
      secondaryLabel="Not now"
      onSecondary={skip}
      step={7}
      totalSteps={8}
    >
      <View style={styles.container}>
        <View style={[styles.iconBubble, { backgroundColor: palette.accentMuted }]}>
          <BellRing size={36} color={palette.accent} strokeWidth={1.8} />
        </View>

        <ThemedText style={[TypeScale.body, styles.copy, { color: palette.textSecondary }]}>
          When a version moves through review — Submitted → In Review → Live —
          you&apos;ll get an instant push. No more F5&apos;ing App Store Connect.
        </ThemedText>

        <View style={styles.bullets}>
          <InfoBullet
            icon={Bell}
            title="State-change pushes"
            body="One notification per state transition. No spam."
          />
          <InfoBullet
            icon={Sparkle}
            title="Low-rating reviews"
            body="Optional alert when a new ★ or ★★ review lands."
          />
          <InfoBullet
            icon={Lock}
            title="Pro feature"
            body="Push notifications are part of Release Pilot Pro. Tap Enable to see the plan options."
          />
        </View>
      </View>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: Spacing.four,
    paddingTop: Spacing.three,
  },
  iconBubble: {
    width: 96,
    height: 96,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { textAlign: 'center' },
  bullets: {
    alignSelf: 'stretch',
    gap: Spacing.four,
    marginTop: Spacing.three,
  },
});
