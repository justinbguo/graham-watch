import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { type PropsWithChildren, type ReactNode, type Ref } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Wordmark } from '@/components/Wordmark';
import {
  HIT_TARGET,
  inset,
  layout,
  radius,
  size,
  space,
  stack,
  type,
  type LayoutWidth,
  type Theme,
} from '@/lib/theme';
import { useIsWide } from '@/lib/layout';
import { useTheme, useThemedStyles } from '@/providers/theme';

/**
 * Every screen is a centred column with a ceiling on its width. The header sits
 * inside that column so a title lines up with the content under it rather than
 * drifting off to a far corner of a desktop window.
 *
 * Insets are padded on from `useSafeAreaInsets`, not by `SafeAreaView`. The
 * native view resolves its own position on screen, and inside a
 * `fullScreenModal` it resolves the top to nothing — which drew the listing
 * detail's title under the Dynamic Island. The hook reports the window, which
 * is what a screen covering the window needs.
 *
 * Each inset has exactly one owner, so a screen says when it is not the one
 * paying:
 *
 * - `inTabs` — the tab bar already stands in the home-indicator strip, so a
 *   screen inside `(tabs)` that pads the bottom too leaves a dead band above
 *   the bar. On a wide window the rail is on the left and the screen owns the
 *   bottom again.
 * - `inSheet` — a sheet is presented below the status bar, so a top inset
 *   inside one is a dead band under nothing.
 */
export function Screen({
  title,
  wordmark = false,
  subtitle,
  verified = false,
  action,
  width = 'reading',
  inTabs = false,
  inSheet = false,
  children,
}: PropsWithChildren<{
  title?: string;
  /** The app's name, in place of `title`. The deck is the only screen that wears it. */
  wordmark?: boolean;
  /** A line under the title: what the screen is holding right now. */
  subtitle?: string;
  /** The blue check after the title. The app's own name only. */
  verified?: boolean;
  action?: ReactNode;
  width?: LayoutWidth;
  inTabs?: boolean;
  inSheet?: boolean;
}>) {
  const styles = useThemedStyles(screenStyles);
  const theme = useTheme();
  const isWide = useIsWide();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.screen,
        {
          paddingTop: inSheet ? 0 : insets.top,
          paddingBottom: inTabs && !isWide ? 0 : insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}>
      <View style={[styles.column, { maxWidth: layout[width] }]}>
        {title || wordmark || action ? (
          <View style={styles.header}>
            <View style={styles.heading}>
              <View style={styles.titleRow}>
                {wordmark ? <Wordmark fit /> : title ? <Text style={styles.title}>{title}</Text> : null}
                {/* Spoken, unlike most glyphs beside a word: the check is a
                    claim about the marketplace, not a picture of the word. */}
                {verified ? (
                  <MaterialCommunityIcons
                    name="check-decagram"
                    size={size.icon}
                    color={theme.color.verified}
                    accessibilityLabel="Verified"
                  />
                ) : null}
              </View>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            {action ? <View style={styles.actionSlot}>{action}</View> : null}
          </View>
        ) : null}
        {children}
      </View>
    </View>
  );
}

export function Button({
  label,
  icon,
  onPress,
  variant = 'outline',
  loading = false,
  disabled = false,
}: {
  label: string;
  /** A glyph that names the same act as the label. Silent: the label is spoken. */
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
  variant?: 'outline' | 'solid' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
}) {
  const styles = useThemedStyles(buttonStyles);
  const theme = useTheme();
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variant === 'solid' && styles.solid,
        variant === 'ghost' && styles.ghost,
        pressed && styles.pressed,
        isDisabled && styles.disabled,
      ]}>
      {loading ? (
        <ActivityIndicator color={labelColour(theme, variant)} />
      ) : (
        <View style={styles.row}>
          {icon ? (
            <MaterialCommunityIcons
              name={icon}
              size={size.iconSmall}
              color={labelColour(theme, variant)}
              accessible={false}
            />
          ) : null}
          <Text
            style={[
              styles.label,
              variant === 'solid' && styles.labelSolid,
              variant === 'ghost' && styles.labelGhost,
            ]}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/**
 * A ghost button has no fill, so its spinner belongs to the page and takes
 * `text`. A filled button is `accent`, so the spinner takes `onAccent`.
 */
function labelColour(theme: Theme, variant: 'outline' | 'solid' | 'ghost') {
  if (variant === 'ghost') return theme.color.text;
  return theme.color.onAccent;
}

export function Field({ ref, ...props }: TextInputProps & { ref?: Ref<TextInput> }) {
  const styles = useThemedStyles(fieldStyles);
  const theme = useTheme();
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={theme.color.inkFaint}
      autoCapitalize="none"
      autoCorrect={false}
      {...props}
      style={[props.multiline ? styles.multiline : styles.field, props.style]}
    />
  );
}

export function ChoiceRow({
  label,
  selected,
  count,
  onPress,
}: {
  label: string;
  selected: boolean;
  count?: number;
  onPress: () => void;
}) {
  const styles = useThemedStyles(choiceStyles);
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        selected && styles.selected,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
      {count !== undefined ? <Text style={styles.count}>{count}</Text> : null}
    </Pressable>
  );
}

export function Message({ text, tone = 'muted' }: { text: string; tone?: 'muted' | 'error' }) {
  const styles = useThemedStyles(messageStyles);
  return <Text style={tone === 'error' ? styles.error : styles.muted}>{text}</Text>;
}

export function Eyebrow({ children }: PropsWithChildren) {
  const styles = useThemedStyles(messageStyles);
  return <Text style={styles.eyebrow}>{children}</Text>;
}

export function Heading({ children }: PropsWithChildren) {
  const styles = useThemedStyles(messageStyles);
  return <Text style={styles.heading}>{children}</Text>;
}

export function Divider() {
  const styles = useThemedStyles(messageStyles);
  return <View style={styles.divider} />;
}

export function Centered({ children }: PropsWithChildren) {
  const styles = useThemedStyles(messageStyles);
  return <View style={styles.centered}>{children}</View>;
}

export function Spinner() {
  return (
    <Centered>
      <ActivityIndicator />
    </Centered>
  );
}

export function CloseButton({ onPress }: { onPress: () => void }) {
  const styles = useThemedStyles(closeStyles);
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Close"
      hitSlop={space.sm}
      onPress={onPress}
      style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
      <MaterialCommunityIcons name="close" size={size.icon} color={theme.color.text} />
    </Pressable>
  );
}

const screenStyles = (theme: Theme) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.color.background,
  },
  // The top gap lives here, not on the header, so a screen without a title
  // still clears the notch instead of starting flush against it.
  column: {
    flex: 1,
    width: '100%' as const,
    alignSelf: 'center' as const,
    paddingTop: space.md,
  },
  header: {
    flexDirection: 'row' as const,
    // On the title's line, not the block's centre: a subtitle under the title
    // would otherwise drag the controls half a line down with it.
    alignItems: 'flex-start' as const,
    justifyContent: 'space-between' as const,
    gap: space.md,
    paddingHorizontal: inset.screen,
    paddingBottom: space.lg,
  },
  heading: {
    flexShrink: 1,
    minWidth: 0,
  },
  // The title is display size. Without this it keeps its width and pushes the
  // control — the settings cog, the filters — off the trailing edge.
  actionSlot: {
    flexShrink: 0,
    zIndex: 1,
  },
  titleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    flexShrink: 1,
    minWidth: 0,
  },
  title: {
    ...type.display,
    color: theme.color.text,
  },
  subtitle: {
    ...type.caption,
    color: theme.color.textMuted,
  },
});

const buttonStyles = (theme: Theme) => ({
  base: {
    backgroundColor: theme.color.accent,
    borderRadius: radius.full,
    paddingVertical: inset.controlY,
    // Half the height: the rounded end of a capsule covers anything closer
    // than that, and iOS clips to the curve.
    paddingHorizontal: size.controlMin / 2,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: size.controlMin,
  },
  solid: {
    backgroundColor: theme.color.accent,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.4,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.sm,
  },
  label: {
    ...type.labelStrong,
    flexShrink: 1,
    maxWidth: '100%' as const,
    textAlign: 'center' as const,
    color: theme.color.onAccent,
  },
  labelSolid: {
    color: theme.color.onAccent,
  },
  labelGhost: {
    color: theme.color.text,
  },
});

const fieldStyles = (theme: Theme) => ({
  field: {
    // Face and size only. `type.body`'s line height is a paragraph measure;
    // on a single line iOS applies it as a baseline offset to the value and
    // not the placeholder, so the two do not share a line.
    fontFamily: type.body.fontFamily,
    fontSize: type.body.fontSize,
    // A field stays `fill`. A button is `accent`, and a black field would
    // read as a second button.
    backgroundColor: theme.color.fill,
    // An <input> on web carries an intrinsic width of about 20 characters, and
    // `min-width: auto` makes a flex row refuse to shrink past it. Two fields
    // side by side then run off the screen edge.
    minWidth: 0,
    height: size.controlMin,
    borderRadius: radius.md,
    paddingHorizontal: inset.controlX,
    // This face's x-height sits about 2px low in its box. Padding on the
    // bottom only moves the centred line up by half of `space.xs`.
    paddingTop: 0,
    paddingBottom: space.xs,
    color: theme.color.ink,
    textAlignVertical: 'center' as const,
    // Android adds the font's extra ascent above the letters.
    includeFontPadding: false,
  },
  multiline: {
    ...type.body,
    backgroundColor: theme.color.fill,
    minWidth: 0,
    borderRadius: radius.md,
    paddingHorizontal: inset.controlX,
    paddingVertical: inset.controlY,
    color: theme.color.ink,
    minHeight: size.fieldMultiline,
    textAlignVertical: 'top' as const,
    includeFontPadding: false,
  },
});

const choiceStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: space.md,
    paddingHorizontal: inset.controlX,
    paddingVertical: inset.controlY,
    minHeight: HIT_TARGET,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
    borderLeftWidth: 2,
    borderLeftColor: 'transparent',
    backgroundColor: theme.color.surface,
  },
  selected: {
    backgroundColor: theme.color.surfaceSunken,
    borderLeftColor: theme.color.brass,
  },
  pressed: {
    opacity: 0.72,
  },
  label: {
    ...type.labelStrong,
    color: theme.color.ink,
  },
  labelSelected: {
    color: theme.color.brass,
  },
  count: {
    ...type.caption,
    color: theme.color.inkFaint,
  },
});

const messageStyles = (theme: Theme) => ({
  muted: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  error: {
    ...type.caption,
    color: theme.color.danger,
  },
  eyebrow: {
    ...type.eyebrow,
    color: theme.color.textMuted,
  },
  heading: {
    ...type.title,
    color: theme.color.text,
  },
  divider: {
    height: 1,
    backgroundColor: theme.color.border,
  },
  centered: {
    flex: 1,
    alignItems: 'flex-start' as const,
    justifyContent: 'center' as const,
    padding: space.xxl,
    gap: stack.related,
  },
});

const closeStyles = (_theme: Theme) => ({
  close: {
    minWidth: HIT_TARGET,
    minHeight: HIT_TARGET,
    alignItems: 'flex-end' as const,
    justifyContent: 'center' as const,
  },
  pressed: {
    opacity: 0.72,
  },
});
