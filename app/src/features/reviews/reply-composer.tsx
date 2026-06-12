import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { LayoutTemplate, Send } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-resolved-scheme';
import {
  REPLY_BODY_MAX_CHARS,
  validateReplyBody,
} from '@/lib/domain/review-feed';

import { TemplatePicker } from './template-picker';

type Props = {
  initialBody?: string;
  isSending?: boolean;
  /** Called when user taps Send. Returns nothing — parent decides what to do next. */
  onSubmit: (body: string) => void;
  /** Optional placeholder text override. */
  placeholder?: string;
};

/**
 * Multi-line reply composer with:
 *   - char count
 *   - Templates button → opens TemplatePicker
 *   - Send button (disabled while empty/invalid/sending)
 *
 * Validation matches `validateReplyBody`: rejects empty / whitespace-only
 * / over-limit. Error message renders inline below the textarea.
 */
export function ReplyComposer({
  initialBody = '',
  isSending,
  onSubmit,
  placeholder = 'Write a thoughtful response…',
}: Props) {
  const scheme = useResolvedScheme();
  const palette = Colors[scheme];

  const [body, setBody] = useState(initialBody);
  const [pickerOpen, setPickerOpen] = useState(false);

  const validationError = body.length === 0 ? null : validateReplyBody(body);
  const canSend = !isSending && validateReplyBody(body) === null;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.wrapper, { backgroundColor: palette.background, borderTopColor: palette.border }]}
    >
      <TextInput
        accessibilityLabel="Reply body"
        accessibilityHint="Type your response to this review"
        multiline
        value={body}
        onChangeText={setBody}
        placeholder={placeholder}
        placeholderTextColor={palette.textTertiary}
        style={[
          styles.input,
          TypeScale.body,
          { color: palette.text, backgroundColor: palette.backgroundElevated },
        ]}
        editable={!isSending}
      />

      <View style={styles.metaRow}>
        <ThemedText
          style={[
            TypeScale.caption,
            { color: validationError === 'too_long' ? palette.destructive : palette.textTertiary },
          ]}
        >
          {body.length}/{REPLY_BODY_MAX_CHARS}
          {validationError === 'whitespace_only' && ' · Add some text'}
          {validationError === 'too_long' && ' · Too long'}
        </ThemedText>
      </View>

      <View style={styles.actionRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Insert template"
          onPress={() => setPickerOpen(true)}
          disabled={isSending}
          style={({ pressed }) => [
            styles.templateBtn,
            { backgroundColor: palette.backgroundElevated, opacity: pressed || isSending ? 0.6 : 1 },
          ]}
        >
          <LayoutTemplate size={16} color={palette.text} strokeWidth={2.2} />
          <ThemedText style={[TypeScale.subhead, { color: palette.text }]}>
            Templates
          </ThemedText>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send reply"
          onPress={() => canSend && onSubmit(body)}
          disabled={!canSend}
          style={({ pressed }) => [
            styles.sendBtn,
            {
              backgroundColor: canSend ? palette.accent : palette.backgroundElevated,
              opacity: pressed && canSend ? 0.85 : 1,
            },
          ]}
        >
          {isSending ? (
            <ActivityIndicator size="small" color={canSend ? palette.textInverse : palette.textTertiary} />
          ) : (
            <Send
              size={16}
              color={canSend ? palette.textInverse : palette.textTertiary}
              strokeWidth={2.4}
            />
          )}
          <ThemedText
            style={[
              TypeScale.bodyEmph,
              { color: canSend ? palette.textInverse : palette.textTertiary },
            ]}
          >
            {isSending ? 'Sending…' : 'Send'}
          </ThemedText>
        </Pressable>
      </View>

      <TemplatePicker
        visible={pickerOpen}
        onPick={(t) => {
          setBody(t.body);
          setPickerOpen(false);
        }}
        onDismiss={() => setPickerOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    padding: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
  },
  input: {
    minHeight: 100,
    maxHeight: 240,
    padding: Spacing.three,
    borderRadius: Radii.md,
    textAlignVertical: 'top',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  templateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radii.pill,
    minHeight: 44,
  },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Radii.pill,
    minWidth: 110,
    minHeight: 44,
    justifyContent: 'center',
  },
});
