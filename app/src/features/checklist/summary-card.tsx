import React from 'react';
import { StyleSheet, View } from 'react-native';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  HelpCircle,
  XCircle,
} from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';
import type { ChecklistSummary } from '@/lib/domain/checklist-rules';

type Props = {
  summary: ChecklistSummary;
};

/**
 * Big at-a-glance "X of Y passing" card at the top of the checklist screen.
 *
 * Color matches the overall severity:
 *   fail (red), warn (yellow), unknown (blue), pass (green)
 */
export function SummaryCard({ summary }: Props) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  const { fg, bg, Icon, headline, sub } = headlineFor(summary, palette);

  return (
    <View style={[styles.card, { backgroundColor: bg, borderColor: fg + '33' }]}>
      <View style={[styles.iconWrap, { backgroundColor: fg }]}>
        <Icon size={22} color={palette.textInverse} strokeWidth={2.4} />
      </View>
      <View style={styles.text}>
        <ThemedText style={[TypeScale.title2, { color: fg }]}>{headline}</ThemedText>
        <ThemedText style={[TypeScale.subhead, { color: palette.textSecondary }]}>{sub}</ThemedText>
      </View>
    </View>
  );
}

function headlineFor(s: ChecklistSummary, palette: typeof Colors.light | typeof Colors.dark) {
  // No draft in progress → everything is NA (nothing was checkable).
  // Render a neutral "no draft yet" state instead of red blocker copy.
  if (s.fail === 0 && s.warn === 0 && s.unknown === 0 && s.pass === 0 && s.na > 0) {
    return {
      fg: palette.infoFg,
      bg: palette.infoBg,
      Icon: FileText,
      headline: 'Nothing to check yet',
      sub: 'This app has no draft version in progress. Create one in ASC when you\'re ready to ship.',
    };
  }
  if (s.fail > 0) {
    return {
      fg: palette.destructive,
      bg: palette.destructiveMuted,
      Icon: XCircle,
      headline: `${s.fail} blocker${s.fail === 1 ? '' : 's'}`,
      sub: `${s.pass} passing · ${s.warn} warning(s) · ${s.unknown} to check`,
    };
  }
  if (s.warn > 0) {
    return {
      fg: palette.warningFg,
      bg: palette.warningBg,
      Icon: AlertTriangle,
      headline: `${s.warn} warning${s.warn === 1 ? '' : 's'}`,
      sub: `${s.pass} passing · ${s.unknown} to check manually`,
    };
  }
  if (s.unknown > 0) {
    return {
      fg: palette.infoFg,
      bg: palette.infoBg,
      Icon: HelpCircle,
      headline: 'Almost ready',
      sub: `${s.pass} passing · ${s.unknown} you need to verify manually`,
    };
  }
  return {
    fg: palette.successFg,
    bg: palette.successBg,
    Icon: CheckCircle2,
    headline: 'Ready to submit',
    sub: `All ${s.pass} checks passing.`,
  };
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radii.lg,
    borderWidth: 1,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 2,
  },
});
