import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing, TypeScale } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';

type Props = {
  /** Either a Lucide icon (rendered green) OR a number (rendered as accent-bubble). */
  icon?: LucideIcon;
  number?: number;
  title: string;
  body?: string;
};

/**
 * Compact, scannable bullet row. Used for:
 *  - Trust bullets ("Stays on your device" etc.) — use `icon` prop
 *  - Numbered instructions ("1. Tap Generate API Key") — use `number` prop
 *
 * Industry standard: high information density without visual noise.
 */
export function InfoBullet({ icon: Icon, number, title, body }: Props) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  return (
    <View style={styles.row}>
      <View
        style={[
          styles.marker,
          { backgroundColor: Icon ? '#E0F8E4' : palette.accentMuted },
        ]}
      >
        {Icon ? (
          <Icon size={16} color="#1F7A1F" strokeWidth={2.4} />
        ) : (
          <ThemedText
            style={[TypeScale.captionEmph, { color: palette.accent }]}
          >
            {number}
          </ThemedText>
        )}
      </View>
      <View style={styles.text}>
        <ThemedText style={[TypeScale.bodyEmph, { color: palette.text }]}>
          {title}
        </ThemedText>
        {body && (
          <ThemedText
            style={[TypeScale.subhead, { color: palette.textSecondary, marginTop: 2 }]}
          >
            {body}
          </ThemedText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  marker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  text: { flex: 1 },
});
