import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Ref } from 'react';
import { Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';

import { HIT_TARGET, radius, size, space, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

const PLACEHOLDER = 'Search';

/**
 * Every search bar in the app is this shape: a `surface` rounded square,
 * `HIT_TARGET` tall, the `magnify` glyph at `size.icon`, and the word
 * "Search". The field types; the door only opens a screen that has the field.
 * They share one look so the door reads as the field it opens.
 */
export function SearchField({
  ref,
  accessibilityLabel = PLACEHOLDER,
  ...props
}: Omit<TextInputProps, 'placeholder' | 'style'> & { ref?: Ref<TextInput> }) {
  const styles = useThemedStyles(searchStyles);
  const theme = useTheme();
  return (
    <View style={styles.bar}>
      <Glyph />
      <TextInput
        ref={ref}
        placeholder={PLACEHOLDER}
        placeholderTextColor={theme.color.inkMuted}
        accessibilityLabel={accessibilityLabel}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        {...props}
        style={styles.input}
      />
    </View>
  );
}

/** A bar you press rather than type in. Typing here would be lost when the screen changed. */
export function SearchDoor({
  onPress,
  accessibilityLabel = PLACEHOLDER,
}: {
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const styles = useThemedStyles(searchStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.bar, pressed && styles.pressed]}>
      <Glyph />
      <Text style={styles.label} numberOfLines={1}>
        {PLACEHOLDER}
      </Text>
    </Pressable>
  );
}

function Glyph() {
  const theme = useTheme();
  return <MaterialCommunityIcons name="magnify" size={size.icon} color={theme.color.inkMuted} />;
}

const searchStyles = (theme: Theme) => ({
  bar: {
    height: HIT_TARGET,
    borderRadius: radius.md,
    backgroundColor: theme.color.surface,
    paddingHorizontal: space.sm,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  input: {
    // Face and size only, as in `Field`: on iOS a single-line `lineHeight`
    // offsets the value and not the placeholder.
    fontFamily: type.body.fontFamily,
    fontSize: type.body.fontSize,
    flex: 1,
    // An <input> on web keeps an intrinsic ~20-character width otherwise.
    minWidth: 0,
    height: '100%' as const,
    padding: 0,
    color: theme.color.ink,
    textAlignVertical: 'center' as const,
    includeFontPadding: false,
  },
  // No line height and no bottom pad. `Field` pads its bottom to lift a face
  // that sits low in a taller box; here that lift put the word above the bar's
  // middle.
  label: {
    fontFamily: type.body.fontFamily,
    fontSize: type.body.fontSize,
    flexShrink: 1,
    color: theme.color.inkMuted,
    includeFontPadding: false,
  },
  pressed: {
    opacity: 0.72,
  },
});
