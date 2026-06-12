import React from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Check, ClipboardPaste } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';

export type TextFieldProps = TextInputProps & {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  /**
   * Validation message:
   *   - null = field is valid (or empty — show neutral hint instead)
   *   - string = show error
   * Pair with `hint` below — `hint` shows when valid, `error` when not.
   */
  error?: string | null;
  hint?: string;
  /** When non-empty AND valid, render a green check at the right. */
  valid?: boolean;
  /** Show a "Paste" button that pulls from clipboard. */
  showPasteButton?: boolean;
  /** Render as multi-line (for the p8 PEM field). */
  multiline?: boolean;
};

/**
 * Industry-standard form input with:
 *  - Inline label above
 *  - Live validation hint below
 *  - Optional "Paste" button on the right of the input
 *  - Optional green-check when valid + non-empty
 *  - Multi-line mode for PEM-style fields
 *
 * Accessibility: label is the field's accessibilityLabel, validation
 * messages are accessibilityHints.
 */
export function TextField({
  label,
  value,
  onChangeText,
  error,
  hint,
  valid,
  showPasteButton,
  multiline,
  style,
  ...rest
}: TextFieldProps) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  const borderColor = error
    ? palette.destructive
    : valid && value.length > 0
      ? '#34C759'
      : palette.border;

  const handlePaste = async () => {
    const clipboard = await Clipboard.getStringAsync();
    if (clipboard) onChangeText(clipboard);
  };

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <ThemedText style={[TypeScale.subhead, { color: palette.textSecondary }]}>
          {label}
        </ThemedText>
        {valid && value.length > 0 && (
          <View style={styles.validIcon}>
            <Check size={14} color="#34C759" strokeWidth={3} />
          </View>
        )}
      </View>

      <View
        style={[
          styles.inputWrap,
          {
            backgroundColor: palette.backgroundElevated,
            borderColor,
          },
          multiline && styles.inputWrapMulti,
        ]}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          accessibilityLabel={label}
          placeholderTextColor={palette.textTertiary}
          autoCorrect={false}
          autoCapitalize="none"
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
          style={[
            styles.input,
            {
              color: palette.text,
              fontFamily: undefined,
            },
            multiline && styles.inputMulti,
            style,
          ]}
          {...rest}
        />
        {showPasteButton && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Paste into ${label}`}
            onPress={handlePaste}
            hitSlop={8}
            style={({ pressed }) => [
              styles.pasteButton,
              { backgroundColor: palette.backgroundSelected, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <ClipboardPaste size={14} color={palette.textSecondary} strokeWidth={2.2} />
            <ThemedText
              style={[TypeScale.captionEmph, { color: palette.textSecondary }]}
            >
              Paste
            </ThemedText>
          </Pressable>
        )}
      </View>

      {(error || hint) && (
        <ThemedText
          style={[
            TypeScale.caption,
            { color: error ? palette.destructive : palette.textTertiary },
          ]}
          accessibilityHint={error ?? hint}
        >
          {error ?? hint}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.one },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  validIcon: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#E0F8E4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: Radii.md,
  },
  inputWrapMulti: {
    alignItems: 'flex-start',
    paddingVertical: Spacing.two,
    minHeight: 120,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: Spacing.two,
  },
  inputMulti: {
    minHeight: 100,
  },
  pasteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Radii.sm,
    marginLeft: Spacing.two,
  },
});
