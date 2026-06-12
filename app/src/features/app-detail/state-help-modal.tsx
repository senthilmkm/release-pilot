import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';

import { StateBadge } from '@/components/state-badge';
import { ThemedText } from '@/components/themed-text';
import {
  Colors,
  Radii,
  Spacing,
  StateHelp,
  StateLabels,
  TypeScale,
  type SemanticState,
} from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';

type Props = {
  state: SemanticState | null;
  onDismiss: () => void;
};

/**
 * Tappable explainer for the 7 semantic states.
 *
 * Opens when the user taps the `?` icon next to a state badge in the
 * app detail header. Shows:
 *   - The friendly label (same as the badge)
 *   - Plain-English "what does this mean"
 *   - The raw ASC enums that map to it (for power users who know ASC vocab)
 *
 * Why bother: ASC's vocab is confusing ("Ready for Sale" = LIVE, not
 * "ready to release"). This is our chance to teach + remove ambiguity.
 */
export function StateHelpModal({ state, onDismiss }: Props) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];
  const visible = state !== null;
  const help = state ? StateHelp[state] : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      accessibilityViewIsModal
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        onPress={onDismiss}
        style={styles.scrim}
      >
        <Pressable
          accessibilityRole="none"
          // Stop bubbling so taps inside the card don't dismiss
          onPress={() => undefined}
          style={[
            styles.card,
            { backgroundColor: palette.background, borderColor: palette.border },
          ]}
        >
          <SafeAreaView edges={['top']}>
            <View style={styles.headerRow}>
              <ThemedText style={[TypeScale.title3, { color: palette.text }]}>
                {state ? StateLabels[state] : ''}
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={onDismiss}
                hitSlop={12}
                style={styles.closeBtn}
              >
                <X size={20} color={palette.textSecondary} strokeWidth={2.2} />
              </Pressable>
            </View>

            {state && (
              <View style={styles.badgeRow}>
                <StateBadge state={state} variant="full" />
              </View>
            )}

            {help && (
              <ThemedText
                style={[TypeScale.body, styles.body, { color: palette.text }]}
              >
                {help.what}
              </ThemedText>
            )}

            {help && (
              <View style={[styles.rawBlock, { backgroundColor: palette.backgroundElevated }]}>
                <ThemedText
                  style={[TypeScale.captionEmph, styles.rawLabel, { color: palette.textTertiary }]}
                >
                  RAW APP STORE CONNECT STATES
                </ThemedText>
                {help.ascRaw.map((raw) => (
                  <ThemedText
                    key={raw}
                    style={[TypeScale.footnote, styles.rawValue, { color: palette.textSecondary }]}
                  >
                    {raw}
                  </ThemedText>
                ))}
              </View>
            )}
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  card: {
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    paddingHorizontal: Spacing.five,
    paddingBottom: Spacing.five,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.three,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.three,
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
  },
  body: {
    lineHeight: 24,
  },
  rawBlock: {
    padding: Spacing.three,
    borderRadius: Radii.md,
    gap: Spacing.one,
  },
  rawLabel: {
    letterSpacing: 0.5,
    marginBottom: Spacing.one,
  },
  rawValue: {
    fontFamily: undefined,
  },
});
