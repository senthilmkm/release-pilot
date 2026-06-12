import React from 'react';
import { StyleSheet, View } from 'react-native';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  HelpCircle,
  Rocket,
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
  // No editable draft → switch to neutral "no pending submission" copy
  // regardless of how many app-level rules happen to pass. Without this
  // an already-live app would falsely show "Ready to submit" because its
  // Content Rights / Category / Privacy URL all pass on stored metadata.
  if (!s.hasDraft) {
    if (s.isFirstVersion) {
      // First-time submitter — nothing has ever shipped. Nudge them to
      // create their v1.0 draft in ASC.
      return {
        fg: palette.infoFg,
        bg: palette.infoBg,
        Icon: FileText,
        headline: 'No draft yet',
        sub: 'Create a new version in App Store Connect when you\'re ready to ship v1.0.',
      };
    }
    // Returning developer between releases. The app-level metadata still
    // gets checked because settings CAN drift after launch (subscription
    // slips into MISSING_METADATA, someone removes the Privacy URL, etc.).
    // We only surface the section when something actually needs attention.
    if (s.fail > 0) {
      return {
        fg: palette.destructive,
        bg: palette.destructiveMuted,
        Icon: XCircle,
        headline: `${s.fail} app-level blocker${s.fail === 1 ? '' : 's'}`,
        sub: 'Settings drifted since launch. Fix before your next submission.',
      };
    }
    if (s.warn > 0) {
      return {
        fg: palette.warningFg,
        bg: palette.warningBg,
        Icon: AlertTriangle,
        headline: `${s.warn} app-level warning${s.warn === 1 ? '' : 's'}`,
        sub: 'Worth reviewing before your next submission.',
      };
    }
    if (s.unknown > 0) {
      return {
        fg: palette.infoFg,
        bg: palette.infoBg,
        Icon: HelpCircle,
        headline: `${s.unknown} to verify manually`,
        sub: "We couldn't read some of your app-level settings — please check in ASC.",
      };
    }
    // Everything clean — celebrate the live app, hide the rule list.
    return {
      fg: palette.successFg,
      bg: palette.successBg,
      Icon: Rocket,
      headline: 'Live on the App Store',
      sub: 'No pending update. Tap "Open in ASC" when you\'re ready to ship.',
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
