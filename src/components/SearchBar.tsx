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
  type,
  type Theme,
} from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

const PLACEHOLDER = 'Search';

/** iOS placeholders sit a hair high next to a centred glyph. */
const INPUT_IOS_NUDGE = Platform.OS === 'ios' ? 1 : 0;

type GlyphName = keyof typeof MaterialCommunityIcons.glyphMap;

export type SearchBarVariant = 'default' | 'header';

/**
 * Capsule search chrome: magnify, then words. The deck door, the Messages
 * field, and the morph between them share this shell.
 */
export function SearchBarShell({
  children,
  variant = 'default',
}: {
  children: React.ReactNode;
  variant?: SearchBarVariant;
}) {
  const styles = useThemedStyles(searchStyles);
  const header = variant === 'header';
  return (
    <View style={[styles.bar, header && styles.barHeader]}>
      <SearchGlyph compact={header} />
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
  inbox = false,
  ...props
}: Omit<TextInputProps, 'style'> & {
  ref?: Ref<TextInput>;
  icon: GlyphName;
  placeholder: string;
  compact?: boolean;
  /** Messages inbox: smaller type in the search capsule. */
  inbox?: boolean;
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
        style={[styles.input, inbox && styles.inputInbox, compact && styles.inputCompact]}
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
  inbox = false,
  ...props
}: Omit<TextInputProps, 'style'> & {
  ref?: Ref<TextInput>;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
  inbox?: boolean;
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
        inbox={inbox}
        {...props}
      />
    </View>
  );
}

/** A bar you press rather than type in. Typing here would be lost when the screen changed. */
export function SearchDoor({
  onPress,
  accessibilityLabel = PLACEHOLDER,
  variant = 'default',
}: {
  onPress: () => void;
  accessibilityLabel?: string;
  variant?: SearchBarVariant;
}) {
  const styles = useThemedStyles(searchStyles);
  const header = variant === 'header';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        header && styles.doorHeader,
        pressed && styles.pressed,
      ]}>
      <SearchBarShell variant={variant}>
        <Text
          style={[styles.label, header && styles.labelHeader]}
          numberOfLines={1}>
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
  inputInbox: {
    fontFamily: type.control.fontFamily,
    fontSize: type.control.fontSize,
    lineHeight: type.control.fontSize,
  },
  bar: {
    height: HIT_TARGET,
    alignSelf: 'stretch' as const,
    width: '100%' as const,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.searchFill,
    paddingHorizontal: space.sm,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  barHeader: {
    height: size.searchBar,
    paddingHorizontal: space.md,
    gap: space.xs,
  },
  doorHeader: {
    minHeight: HIT_TARGET,
    width: '100%' as const,
    justifyContent: 'center' as const,
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
  labelHeader: {
    paddingTop: 0,
    ...Platform.select({
      web: { lineHeight: size.searchBar - 2 },
      default: { paddingTop: INPUT_IOS_NUDGE },
    }),
  },
  pressed: {
    opacity: 0.72,
  },
});
