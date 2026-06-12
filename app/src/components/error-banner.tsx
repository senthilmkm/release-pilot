import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AlertTriangle, WifiOff } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing, TypeScale } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';

export type BannerVariant = 'offline' | 'warning' | 'error';

type Props = {
  variant: BannerVariant;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

const VARIANT_STYLES = {
  light: {
    offline: { bg: '#FFF4E5', fg: '#7A4400', icon: '#B86B00' },
    warning: { bg: '#FFF4C2', fg: '#7A5C00', icon: '#9C7300' },
    error:   { bg: '#FFE0E0', fg: '#7A0014', icon: '#B00020' },
  },
  dark: {
    offline: { bg: '#3D2A00', fg: '#FFD08A', icon: '#FFA340' },
    warning: { bg: '#3D2F00', fg: '#FFD970', icon: '#FFC72E' },
    error:   { bg: '#4A0E0E', fg: '#FF8B85', icon: '#FF6B6B' },
  },
} as const;

/**
 * Non-blocking banner that shows at the top of a tab when something is off
 * (offline, rate-limited, push registration failed). Always actionable when
 * possible. Never blocks navigation.
 */
export function ErrorBanner({ variant, message, actionLabel, onAction }: Props) {
  const scheme = useResolvedScheme();
  const palette = VARIANT_STYLES[scheme][variant];
  const Icon = variant === 'offline' ? WifiOff : AlertTriangle;

  return (
    <View
      style={[styles.container, { backgroundColor: palette.bg }]}
      accessible
      accessibilityRole="alert"
      accessibilityLabel={message}
    >
      <Icon size={16} color={palette.icon} strokeWidth={2.2} />
      <ThemedText style={[TypeScale.footnote, styles.message, { color: palette.fg }]}>
        {message}
      </ThemedText>
      {actionLabel && onAction && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          hitSlop={8}
        >
          <ThemedText style={[TypeScale.captionEmph, { color: palette.fg }]}>
            {actionLabel}
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Radii.sm,
    marginHorizontal: Spacing.four,
    marginVertical: Spacing.two,
  },
  message: {
    flex: 1,
  },
});
