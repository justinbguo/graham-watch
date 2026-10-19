import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Field } from '@/components/ui';
import {
  controlText,
  controlTextNudge,
  HIT_TARGET,
  inset,
  radius,
  size,
  space,
  type as typeScale,
  type Theme,
} from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

/** One line of body, centred in the capsule (same math as search). */
const MESSAGE_PAD = (HIT_TARGET - typeScale.body.fontSize) / 2;
/** Four lines, then the field scrolls. Taller and the thread is gone. */
const MESSAGE_MAX = typeScale.body.lineHeight * 4 + MESSAGE_PAD * 2;

/**
 * One line at the foot of a thread, shaped like the deck's search capsule: the
 * same fill, height, and gutter, with no rule above it. Send is the glyph at
 * the capsule's trailing edge. The exchange's comments and a conversation are the
 * same act — say one thing to whoever is already on this screen — so they are
 * the same control.
 *
 * It does not lift itself. The screen it sits in pads its own bottom by
 * `useKeyboardLift`, because how much room the keyboard leaves depends on
 * whether the screen is inside the tabs.
 */
export function SendBar({
  placeholder,
  value,
  onChangeText,
  onSend,
  busy = false,
  /** Above the field: who you are answering, or what went wrong. */
  note,
  /** What the glyph does, for a screen reader, when it is not a message. */
  sendLabel = 'Send',
  /** A photo is enough to send, so the words are not the only way. */
  canSend,
  /** Left of the field. Camera, and similar. */
  leading,
  /** Right of the field. Seller deal affordances sit here. */
  trailing,
  /**
   * A long message wraps and the field grows. A comment stays one line:
   * that bar is a sentence, and return still sends.
   */
  multiline = false,
}: {
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  onSend: () => void;
  busy?: boolean;
  note?: ReactNode;
  sendLabel?: string;
  canSend?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  multiline?: boolean;
}) {
  const styles = useThemedStyles(sendStyles);
  const theme = useTheme();
  const sendable = (canSend ?? value.trim().length > 0) && !busy;
  const [grown, setGrown] = useState(HIT_TARGET);
  // Clearing the field has to collapse it even if the size event is late.
  const height = multiline
    ? Math.min(MESSAGE_MAX, Math.max(HIT_TARGET, value ? grown : HIT_TARGET))
    : HIT_TARGET;
  const tall = multiline && height > HIT_TARGET;
  const singleLine = !tall;

  return (
    <View style={styles.bar}>
      {note}
      <View style={[leading || trailing ? styles.compose : undefined, tall ? styles.composeTall : styles.composeCenter]}>
        {leading ? <View style={styles.side}>{leading}</View> : null}
        <View style={leading || trailing ? styles.field : undefined}>
          <Field
            placeholder={placeholder}
            value={value}
            onChangeText={onChangeText}
            autoCapitalize="sentences"
            autoCorrect
            maxLength={2000}
            multiline={multiline}
            submitBehavior={multiline ? 'submit' : undefined}
            returnKeyType="send"
            onSubmitEditing={() => sendable && onSend()}
            onContentSizeChange={
              multiline
                ? (event) => setGrown(event.nativeEvent.contentSize.height)
                : undefined
            }
            scrollEnabled={!multiline || height >= MESSAGE_MAX}
            style={[
              styles.input,
              singleLine ? controlText.body : styles.inputParagraph,
              singleLine ? controlTextNudge : undefined,
              multiline && {
                height,
                minHeight: HIT_TARGET,
                maxHeight: MESSAGE_MAX,
                backgroundColor: theme.color.surface,
                paddingTop: singleLine ? MESSAGE_PAD : space.sm,
                paddingBottom: singleLine ? MESSAGE_PAD : space.sm,
                textAlignVertical: singleLine ? ('center' as const) : ('top' as const),
              },
            ]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={sendLabel}
            accessibilityState={{ disabled: !sendable, busy }}
            disabled={!sendable}
            onPress={onSend}
            style={({ pressed }) => [styles.send, pressed && styles.pressed]}>
            <MaterialCommunityIcons
              name="send-outline"
              size={size.icon}
              color={sendable ? theme.color.ink : theme.color.inkFaint}
            />
          </Pressable>
        </View>
        {trailing ? <View style={styles.side}>{trailing}</View> : null}
      </View>
    </View>
  );
}

const sendStyles = (theme: Theme) => ({
  bar: {
    paddingHorizontal: inset.screen,
    paddingTop: space.sm,
    paddingBottom: space.md,
    gap: space.sm,
    backgroundColor: theme.color.background,
  },
  compose: {
    flexDirection: 'row' as const,
    gap: space.xs,
  },
  composeCenter: {
    alignItems: 'center' as const,
  },
  composeTall: {
    alignItems: 'flex-end' as const,
  },
  side: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: HIT_TARGET,
    minWidth: HIT_TARGET,
  },
  field: {
    flex: 1,
    minWidth: 0,
  },
  input: {
    height: HIT_TARGET,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surface,
    paddingLeft: space.md,
    paddingRight: HIT_TARGET,
  },
  inputParagraph: {
    fontFamily: typeScale.body.fontFamily,
    fontSize: typeScale.body.fontSize,
    lineHeight: typeScale.body.lineHeight,
    includeFontPadding: false,
  },
  send: {
    position: 'absolute' as const,
    bottom: 0,
    right: space.xs,
    width: HIT_TARGET,
    height: HIT_TARGET,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  pressed: {
    opacity: 0.72,
  },
});
