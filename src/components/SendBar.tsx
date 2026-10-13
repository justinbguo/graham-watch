import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Field } from '@/components/ui';
import { inset, radius, size, space, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

/**
 * One line and a round send button, at the foot of a thread. The exchange's
 * comments and a conversation are the same act — say one thing to whoever is
 * already on this screen — so they are the same control.
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
}: {
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  onSend: () => void;
  busy?: boolean;
  note?: ReactNode;
}) {
  const styles = useThemedStyles(sendStyles);
  const theme = useTheme();
  const sendable = value.trim().length > 0 && !busy;

  return (
    <View style={styles.bar}>
      {note}
      <View style={styles.row}>
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
          accessibilityLabel="Send"
          disabled={!sendable}
          onPress={onSend}
          style={({ pressed }) => [styles.send, !sendable && styles.off, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="send-outline" size={size.iconSmall} color={theme.color.onAccent} />
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
    borderTopWidth: 1,
    borderTopColor: theme.color.border,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  input: {
    flex: 1,
  },
  send: {
    width: size.controlMin,
    height: size.controlMin,
    borderRadius: radius.full,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.color.accent,
  },
  off: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.72,
  },
});
