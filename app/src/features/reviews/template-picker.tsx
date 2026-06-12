import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';
import { useAllTemplates, type CannedTemplate } from '@/lib/state/canned-templates';

type Props = {
  visible: boolean;
  onPick: (template: CannedTemplate) => void;
  onDismiss: () => void;
};

/**
 * Bottom-sheet for picking a canned template.
 *
 * Shows title + first ~120 chars of body. Tapping inserts the body into
 * the composer (replacing any current draft).
 */
export function TemplatePicker({ visible, onPick, onDismiss }: Props) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];
  const templates = useAllTemplates();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
      accessibilityViewIsModal
    >
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={onDismiss} style={styles.scrim}>
        <Pressable
          accessibilityRole="none"
          onPress={() => undefined}
          style={[styles.sheet, { backgroundColor: palette.background, borderColor: palette.border }]}
        >
          <SafeAreaView edges={['bottom']}>
            <View style={styles.header}>
              <ThemedText style={[TypeScale.title3, { color: palette.text }]}>
                Templates
              </ThemedText>
              <Pressable onPress={onDismiss} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
                <X size={20} color={palette.textSecondary} strokeWidth={2.2} />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
            >
              {templates.map((t) => (
                <Pressable
                  key={t.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Insert template ${t.title}`}
                  onPress={() => onPick(t)}
                  style={({ pressed }) => [
                    styles.item,
                    { backgroundColor: palette.backgroundElevated, opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  <ThemedText style={[TypeScale.bodyEmph, { color: palette.text }]}>
                    {t.title}
                  </ThemedText>
                  <ThemedText
                    style={[TypeScale.subhead, { color: palette.textSecondary }]}
                    numberOfLines={3}
                  >
                    {t.body}
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>
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
  sheet: {
    maxHeight: '85%',
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    paddingHorizontal: Spacing.four,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
  list: {
    gap: Spacing.two,
    paddingBottom: Spacing.three,
  },
  item: {
    padding: Spacing.three,
    borderRadius: Radii.md,
    gap: Spacing.one,
  },
});
