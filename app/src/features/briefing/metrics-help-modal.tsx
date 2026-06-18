import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';

type Props = {
  visible: boolean;
  onDismiss: () => void;
};

/**
 * Bottom-sheet explainer for the revenue metrics on the Today tab.
 *
 * Why this exists: a user comparing the Today card against their
 * RevenueCat dashboard can see the same row labels but slightly
 * different numbers, with no obvious explanation. This modal answers
 * the three repeatable "why doesn't this match?" questions in one place
 * so we don't accumulate support emails.
 *
 * Mirrors the bottom-sheet shape + dismiss model of `StateHelpModal`
 * in `app-detail/` — same scrim, same SafeAreaView, same close button.
 */
export function MetricsHelpModal({ visible, onDismiss }: Props) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

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
          onPress={() => undefined}
          style={[
            styles.card,
            { backgroundColor: palette.background, borderColor: palette.border },
          ]}
        >
          <SafeAreaView edges={['bottom']}>
            <View style={styles.headerRow}>
              <ThemedText style={[TypeScale.title3, { color: palette.text }]}>
                About these revenue numbers
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

            <ThemedText
              style={[TypeScale.footnote, styles.intro, { color: palette.textSecondary }]}
            >
              These cards pull live from the RevenueCat REST API. A few
              metrics may not match your RC dashboard exactly — here&apos;s why.
            </ThemedText>

            <Section
              palette={palette}
              title="Active users (28d) ≠ Active Customers"
              body={
                'RevenueCat\'s public API doesn\'t expose the dashboard\'s "Active Customers" ' +
                'tile. Release Pilot shows `active_users` instead — customers who interacted ' +
                'with your app in the last 28 days. It\'s a related but distinct cohort, so ' +
                'the count may sit a few customers above or below the dashboard tile.'
              }
            />

            <Section
              palette={palette}
              title="MRR may differ by a few cents"
              body={
                'The /metrics/overview endpoint returns MRR truncated to whole units of the ' +
                'reporting currency (e.g. dollars, not cents). The dashboard rounds for display. ' +
                'For small revenue apps you may see a sub-dollar gap; the trend is identical.'
              }
            />

            <Section
              palette={palette}
              title="Numbers can lag by up to 5 minutes"
              body={
                'Release Pilot caches RevenueCat data for 5 minutes to stay well within RC\'s ' +
                '25 req/min rate limit across all your connected apps. Pull down on the Today ' +
                'tab to force a live re-read whenever you want to cross-check the dashboard.'
              }
            />
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Section({
  palette,
  title,
  body,
}: {
  palette: typeof Colors.light | typeof Colors.dark;
  title: string;
  body: string;
}) {
  return (
    <View style={styles.section}>
      <ThemedText style={[TypeScale.bodyEmph, { color: palette.text }]}>{title}</ThemedText>
      <ThemedText style={[TypeScale.body, styles.sectionBody, { color: palette.textSecondary }]}>
        {body}
      </ThemedText>
    </View>
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
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.three,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  intro: {
    lineHeight: 20,
  },
  section: {
    gap: Spacing.one,
  },
  sectionBody: {
    lineHeight: 22,
  },
});
