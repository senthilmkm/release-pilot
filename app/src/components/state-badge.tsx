import React from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Calendar,
  CheckCircle,
  CheckCircle2,
  Eye,
  Pencil,
  Send,
  XOctagon,
} from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import {
  Radii,
  Spacing,
  StateColors,
  StateLabels,
  StateShortLabels,
  type SemanticState,
} from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';

type Props = {
  state: SemanticState;
  variant?: 'full' | 'compact';
  /**
   * When true, a `state: 'live'` row was once on the App Store but has
   * been replaced by a newer release. Renders as "Released" with a
   * neutral palette so users don't read "Live" for every old version
   * in the history timeline. No effect on non-live states.
   */
  superseded?: boolean;
};

const ICONS = {
  drafting: Pencil,
  submitted: Send,
  in_review: Eye,
  approved_waiting: CheckCircle,
  approved_scheduled: Calendar,
  live: CheckCircle2,
  rejected: XOctagon,
} as const;

/**
 * Single source of truth for showing a release state.
 *
 * Used in: app list rows, app detail header, timeline, widget previews,
 * notification rich content. Never reach for the StateColors map directly —
 * always use this component.
 */
export function StateBadge({ state, variant = 'full', superseded = false }: Props) {
  const scheme = useResolvedScheme();
  const isSupersededLive = superseded && state === 'live';

  // Superseded live → reuse the neutral `drafting` palette (gray) and
  // override the label to "Released". Keeps the check-circle icon so the
  // affordance still reads "this version was approved" — just past-tense.
  const palette = isSupersededLive
    ? StateColors[scheme].drafting
    : StateColors[scheme][state];
  const Icon = ICONS[state];
  const label = isSupersededLive
    ? variant === 'full'
      ? 'Released'
      : 'Past'
    : variant === 'full'
      ? StateLabels[state]
      : StateShortLabels[state];
  const a11yLabel = isSupersededLive
    ? 'Released (replaced by newer version)'
    : `${StateLabels[state]} status`;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: palette.bg },
        variant === 'compact' && styles.compact,
      ]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={a11yLabel}
    >
      <Icon size={variant === 'compact' ? 12 : 14} color={palette.fg} strokeWidth={2.2} />
      <ThemedText
        style={[
          styles.label,
          { color: palette.fg },
          variant === 'compact' && styles.labelCompact,
        ]}
      >
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radii.pill,
    alignSelf: 'flex-start',
  },
  compact: {
    paddingHorizontal: Spacing.one + 2,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 16,
  },
  labelCompact: {
    fontSize: 11,
    lineHeight: 14,
  },
});
