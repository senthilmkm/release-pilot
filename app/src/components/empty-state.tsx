import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';

type Props = {
  icon: LucideIcon;
  title: string;
  body: string;
  cta?: {
    label: string;
    onPress: () => void;
  };
};

/**
 * Industry-standard empty state. Used in every list view when no data.
 * Follows Apple HIG: friendly icon, clear copy, single CTA.
 */
export function EmptyState({ icon: Icon, title, body, cta }: Props) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  return (
    <View style={styles.container}>
      <View style={[styles.iconBubble, { backgroundColor: palette.backgroundElevated }]}>
        <Icon size={36} color={palette.textSecondary} strokeWidth={1.6} />
      </View>
      <ThemedText style={[TypeScale.title3, styles.title, { color: palette.text }]}>
        {title}
      </ThemedText>
      <ThemedText style={[TypeScale.body, styles.body, { color: palette.textSecondary }]}>
        {body}
      </ThemedText>
      {cta && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={cta.label}
          onPress={cta.onPress}
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: palette.accent, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <ThemedText style={[TypeScale.bodyEmph, { color: '#FFFFFF' }]}>
            {cta.label}
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.five,
    gap: Spacing.three,
  },
  iconBubble: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    textAlign: 'center',
  },
  body: {
    textAlign: 'center',
    maxWidth: 320,
  },
  cta: {
    marginTop: Spacing.three,
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.three,
    borderRadius: Radii.md,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
