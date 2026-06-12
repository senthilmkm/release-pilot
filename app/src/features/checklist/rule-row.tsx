import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  HelpCircle,
  MinusCircle,
  XCircle,
} from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';
import type { RuleResult, RuleSeverity } from '@/lib/domain/checklist-rules';

type Props = {
  rule: RuleResult;
};

/**
 * One rule in the checklist list. Tappable to expand → shows message,
 * remediation, and an "Open in App Store Connect" deep-link button.
 *
 * Visual hierarchy:
 *   icon (severity-colored) + title + chevron
 *   expanded: one-line message + remediation paragraph + ASC button
 */
export function RuleRow({ rule }: Props) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];
  const [open, setOpen] = useState(false);

  const tone = SEVERITY_TONE[rule.severity](palette);
  const Icon = SEVERITY_ICON[rule.severity];
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <View style={[styles.card, { backgroundColor: palette.backgroundElevated }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${rule.title}, ${SEVERITY_LABEL[rule.severity]}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={styles.headerRow}
      >
        <View style={[styles.iconWrap, { backgroundColor: tone.bg }]}>
          <Icon size={16} color={tone.fg} strokeWidth={2.4} />
        </View>
        <View style={styles.titleCol}>
          <ThemedText style={[TypeScale.bodyEmph, { color: palette.text }]} numberOfLines={open ? undefined : 1}>
            {rule.title}
          </ThemedText>
          <ThemedText
            style={[TypeScale.caption, { color: tone.fg }]}
            numberOfLines={1}
          >
            {SEVERITY_LABEL[rule.severity]}
          </ThemedText>
        </View>
        <Chevron size={18} color={palette.textTertiary} strokeWidth={2} />
      </Pressable>

      {open && (
        <View style={styles.body}>
          <ThemedText style={[TypeScale.subhead, { color: palette.text }]}>
            {rule.message}
          </ThemedText>
          {rule.remediation && (
            <ThemedText style={[TypeScale.footnote, { color: palette.textSecondary }]}>
              {rule.remediation}
            </ThemedText>
          )}
          {rule.ascDeepLink && (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Open in App Store Connect"
              onPress={() => WebBrowser.openBrowserAsync(rule.ascDeepLink!)}
              style={({ pressed }) => [
                styles.linkBtn,
                {
                  backgroundColor: palette.background,
                  borderColor: palette.border,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <ExternalLink size={14} color={palette.accent} strokeWidth={2.2} />
              <ThemedText style={[TypeScale.subhead, { color: palette.accent }]}>
                Fix in App Store Connect
              </ThemedText>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Severity → visual tokens
// ---------------------------------------------------------------------------

const SEVERITY_LABEL: Record<RuleSeverity, string> = {
  pass:    'Passing',
  warn:    'Warning',
  fail:    'Will be rejected',
  unknown: 'Check manually',
  na:      'Not applicable',
};

const SEVERITY_ICON: Record<RuleSeverity, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  pass:    CheckCircle2,
  warn:    AlertTriangle,
  fail:    XCircle,
  unknown: HelpCircle,
  na:      MinusCircle,
};

type Palette = typeof Colors.light | typeof Colors.dark;
const SEVERITY_TONE: Record<RuleSeverity, (p: Palette) => { fg: string; bg: string }> = {
  pass:    (p) => ({ fg: p.successFg, bg: p.successBg }),
  warn:    (p) => ({ fg: p.warningFg, bg: p.warningBg }),
  fail:    (p) => ({ fg: p.destructive, bg: p.destructiveMuted }),
  unknown: (p) => ({ fg: p.infoFg,    bg: p.infoBg }),
  na:      (p) => ({ fg: p.textTertiary, bg: p.backgroundSelected }),
};

const styles = StyleSheet.create({
  card: {
    borderRadius: Radii.md,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: Radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleCol: {
    flex: 1,
    gap: 2,
  },
  body: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
    gap: Spacing.two,
  },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
