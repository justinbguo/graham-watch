import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Field } from '@/components/ui';
import { HIT_TARGET, inset, radius, size, space, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

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
}: {
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  onSend: () => void;
  busy?: boolean;
  note?: ReactNode;
  sendLabel?: string;
}) {
  const styles = useThemedStyles(sendStyles);
  const theme = useTheme();
  const sendable = value.trim().length > 0 && !busy;

  return (
    <View style={styles.bar}>
      {note}
      <View>
        <Field
          placeholder={placeholder}
          value={value}
          onChangeText={onChangeText}
          autoCapitalize="sentences"
          autoCorrect
          maxLength={2000}
          returnKeyType="send"
          onSubmitEditing={() => sendable && onSend()}
          style={styles.input}
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
  // The deck's search capsule: `HIT_TARGET` tall, `fill`, the label inset by
  // half the height. Typing stops short of the glyph instead of running under it.
  input: {
    height: HIT_TARGET,
    borderRadius: radius.full,
    paddingLeft: HIT_TARGET / 2,
    paddingRight: HIT_TARGET,
  },
  // No fill behind it: the glyph is the control, and its colour is its state.
  send: {
    position: 'absolute' as const,
    top: 0,
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
