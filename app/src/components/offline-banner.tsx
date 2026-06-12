import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WifiOff } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing, TypeScale } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';
import { useIsOnline } from '@/hooks/use-is-online';

/**
 * Global "you're offline" banner. Mounted once in `app/_layout.tsx`
 * so it renders above every screen including onboarding, paywall,
 * and tabs. Auto-hides the moment connectivity returns.
 *
 * Rendered as an absolutely-positioned overlay so adding/removing it
 * doesn't reshuffle the layout below — important when toggling rapidly
 * during flaky cellular handoffs.
 *
 * Color: a soft warning amber (per Apple's HIG — orange is reserved
 * for connectivity, red is reserved for destructive actions).
 *
 * NOTE: This is purely informational. The app still works offline:
 * cached SQLite data renders, the offline reply queue absorbs writes,
 * and TanStack Query retries automatically when we reconnect.
 */
export function OfflineBanner() {
  const online = useIsOnline();
  const insets = useSafeAreaInsets();
  const scheme = useResolvedScheme();

  if (online) return null;

  const bg = scheme === 'dark' ? '#3D2A00' : '#FFF4E5';
  const fg = scheme === 'dark' ? '#FFD08A' : '#7A4400';
  const iconColor = scheme === 'dark' ? '#FFA340' : '#B86B00';

  return (
    <View
      pointerEvents="box-none"
      style={[styles.container, { top: insets.top, backgroundColor: bg }]}
      accessible
      accessibilityRole="alert"
      accessibilityLabel="You're offline. Cached data is shown; new fetches will retry when you reconnect."
    >
      <WifiOff size={14} color={iconColor} strokeWidth={2.4} />
      <ThemedText style={[TypeScale.caption, { color: fg }]}>
        Offline · showing cached data · will retry when you reconnect
      </ThemedText>
    </View>
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
    zIndex: 1000,
  },
});
