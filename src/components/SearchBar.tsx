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

import { dealerSocial } from '@/lib/design';
import {
  controlText,
  HIT_TARGET,
  inset,
  radius,
  size,
  space,
  type Theme,
} from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

const PLACEHOLDER = 'Search';

/** iOS placeholders sit a hair high next to a centred glyph. */
const INPUT_IOS_NUDGE = Platform.OS === 'ios' ? 1 : 0;

type GlyphName = keyof typeof MaterialCommunityIcons.glyphMap;

/**
 * Capsule search chrome: magnify, then words. The deck door, the Messages
 * field, and the morph between them share this shell.
 */
export function SearchBarShell({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(searchStyles);
  return (
    <View style={styles.bar}>
      <SearchGlyph compact={false} />
      {children}
    </View>
  );
}

export function IconBar({
  ref,
  icon,
  placeholder,
  accessibilityLabel,
  compact = false,
  ...props
}: Omit<TextInputProps, 'style'> & {
  ref?: Ref<TextInput>;
  icon: GlyphName;
  placeholder: string;
  compact?: boolean;
}) {
  const styles = useThemedStyles(searchStyles);
  const theme = useTheme();
  const glyph = compact ? size.iconSmall : size.icon;
  return (
    <View style={[styles.bar, compact && styles.barCompact]}>
      <View style={[styles.glyphSlot, compact && styles.glyphSlotCompact]}>
        <MaterialCommunityIcons name={icon} size={glyph} color={theme.color.inkMuted} />
      </View>
      <TextInput
        ref={ref}
        placeholder={placeholder}
        placeholderTextColor={theme.color.inkMuted}
        accessibilityLabel={accessibilityLabel ?? placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        {...props}
        style={[styles.input, compact && styles.inputCompact]}
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
  compact = false,
  ...props
}: Omit<TextInputProps, 'style'> & {
  ref?: Ref<TextInput>;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  return (
    <View style={style}>
      <IconBar
        ref={ref}
        icon="magnify"
        placeholder={placeholder}
        accessibilityLabel={accessibilityLabel}
        returnKeyType="search"
        compact={compact}
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

function SearchGlyph({ compact }: { compact: boolean }) {
  const styles = useThemedStyles(searchStyles);
  const theme = useTheme();
  const glyph = compact ? size.iconSmall : size.icon;
  return (
    <View style={[styles.glyphSlot, compact && styles.glyphSlotCompact]}>
      <MaterialCommunityIcons name="magnify" size={glyph} color={theme.color.inkMuted} />
    </View>
  );
}

/** Gutter for a search field under a `Screen` title. */
export const searchFieldInset = {
  paddingHorizontal: inset.screen,
  paddingBottom: space.md,
} as const;

const searchStyles = (theme: Theme) => ({
  barCompact: {
    height: dealerSocial.minHeight,
  },
  inputCompact: {
    paddingTop: INPUT_IOS_NUDGE,
  },
  bar: {
    height: HIT_TARGET,
    alignSelf: 'stretch' as const,
    width: '100%' as const,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surface,
    paddingHorizontal: space.sm,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  glyphSlot: {
    width: size.icon,
    height: size.icon,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  glyphSlotCompact: {
    width: size.iconSmall,
    height: size.iconSmall,
  },
  input: {
    ...controlText.body,
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 0,
    paddingTop: INPUT_IOS_NUDGE,
    paddingBottom: 0,
    margin: 0,
    color: theme.color.ink,
    textAlignVertical: 'center' as const,
  },
  label: {
    ...controlText.body,
    flex: 1,
    flexShrink: 1,
    paddingTop: INPUT_IOS_NUDGE,
    color: theme.color.inkMuted,
  },
  pressed: {
    opacity: 0.72,
  },
});
