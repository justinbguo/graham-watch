import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Ref } from 'react';
import type React from 'react';
import {
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { HIT_TARGET, inset, radius, size, space, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

const PLACEHOLDER = 'Search';

/** Single-line in `HIT_TARGET`. Not `type.body.lineHeight` — that misaligns placeholders on iOS. */
const SEARCH_LINE = type.body.fontSize;

type GlyphName = keyof typeof MaterialCommunityIcons.glyphMap;

/**
 * The bar under a title: `surface`, `HIT_TARGET` tall, `radius.md`, a glyph
 * at `size.icon`, then the words. Search uses it with a magnifying glass.
 * The group name uses it with a pencil, so the two rows on New group chat
 * are the same height and the words start at the same place.
 */
/** Shared chrome for the door, the field, and the launch morph. */
export function SearchBarShell({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(searchStyles);
  return (
    <View style={styles.bar}>
      <Glyph />
      {children}
    </View>
  );
}

export function IconBar({
  ref,
  icon,
  placeholder,
  accessibilityLabel,
  ...props
}: Omit<TextInputProps, 'style'> & {
  ref?: Ref<TextInput>;
  icon: GlyphName;
  placeholder: string;
}) {
  const styles = useThemedStyles(searchStyles);
  const theme = useTheme();
  return (
    <View style={styles.bar}>
      <MaterialCommunityIcons name={icon} size={size.icon} color={theme.color.inkMuted} />
      <TextInput
        ref={ref}
        placeholder={placeholder}
        placeholderTextColor={theme.color.inkMuted}
        accessibilityLabel={accessibilityLabel ?? placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        {...props}
        style={styles.input}
      />
    </View>
  );
}

/**
 * Every search bar in the app is an `IconBar` with `magnify` and the word
 * "Search". The field types; the door only opens a screen that has the field.
 * They share one look so the door reads as the field it opens.
 */
export function SearchField({
  ref,
  accessibilityLabel = PLACEHOLDER,
  placeholder = PLACEHOLDER,
  style,
  ...props
}: Omit<TextInputProps, 'style'> & {
  ref?: Ref<TextInput>;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={style}>
      <IconBar
        ref={ref}
        icon="magnify"
        placeholder={placeholder}
        accessibilityLabel={accessibilityLabel}
        returnKeyType="search"
        {...props}
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
      style={({ pressed }) => [pressed && styles.pressed]}>
      <SearchBarShell>
        <Text style={styles.label} numberOfLines={1}>
          {PLACEHOLDER}
        </Text>
      </SearchBarShell>
    </Pressable>
  );
}

function Glyph() {
  const theme = useTheme();
  return <MaterialCommunityIcons name="magnify" size={size.icon} color={theme.color.inkMuted} />;
}

/** Gutter for a search field under a `Screen` title. */
export const searchFieldInset = {
  paddingHorizontal: inset.screen,
  paddingBottom: space.md,
} as const;

const searchStyles = (theme: Theme) => ({
  bar: {
    height: HIT_TARGET,
    // A door in a header row otherwise stays as wide as the word "Search".
    alignSelf: 'stretch' as const,
    width: '100%' as const,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surface,
    paddingHorizontal: space.sm,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  input: {
    fontFamily: type.body.fontFamily,
    fontSize: SEARCH_LINE,
    lineHeight: SEARCH_LINE,
    flex: 1,
    minWidth: 0,
    height: HIT_TARGET,
    paddingHorizontal: 0,
    paddingTop: 0,
    // Same nudge as `Field`: this face sits slightly low in its box.
    paddingBottom: Platform.OS === 'ios' ? space.xs / 2 : 0,
    margin: 0,
    color: theme.color.ink,
    textAlignVertical: 'center' as const,
    includeFontPadding: false,
  },
  label: {
    fontFamily: type.body.fontFamily,
    fontSize: SEARCH_LINE,
    lineHeight: SEARCH_LINE,
    flexShrink: 1,
    color: theme.color.inkMuted,
    includeFontPadding: false,
  },
  pressed: {
    opacity: 0.72,
  },
});
