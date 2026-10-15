import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, type PropsWithChildren, type ReactNode, type Ref } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  HIT_TARGET,
  inset,
  layout,
  motion,
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
 *
 * `back` is the arrow at the top left, on its own row above the title, where
 * iOS and the onboarding slides put it. The trailing slot is for controls that
 * act on the screen; leaving it is not one of those.
 */
export function Screen({
  title,
  titleSize = 'display',
  titleExtra,
  subtitle,
  back,
  leading,
  subhead,
  action,
  width = 'reading',
  inTabs = false,
  inSheet = false,
  children,
}: PropsWithChildren<{
  title?: string;
  /** `title` is the step under `display`, for a name that shares its line with a control. */
  titleSize?: 'display' | 'title';
  /** A control on the title's line. Wraps under the title when the line is full. */
  titleExtra?: ReactNode;
  /**
   * Under the title. A string is the quiet line. A node is a mark that has
   * to sit on that same line, such as the unclaimed-shop badge.
   */
  subtitle?: ReactNode;
  /** Return to where you came from. `label` is spoken; it names the place. */
  back?: { label: string; onPress: () => void };
  /** A control at the start of the title's line. Search's close. */
  leading?: ReactNode;
  /**
   * A row that belongs to the title, drawn under it. The title's own bottom
   * padding would put a page of air between them, and a negative margin would
   * paint this row over the header, where the header keeps the taps.
   */
  subhead?: ReactNode;
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
        {back ? (
          <View style={styles.backRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={back.label}
              hitSlop={space.sm}
              onPress={back.onPress}
              style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
              <MaterialCommunityIcons name="arrow-left" size={size.icon} color={theme.color.text} />
            </Pressable>
          </View>
        ) : null}
        {title || action || leading || subhead ? (
          <View style={subhead ? styles.headed : undefined}>
            <View style={[styles.header, subhead ? styles.headerFlush : null]}>
              {leading ? <View style={styles.leading}>{leading}</View> : null}
              <View style={[styles.heading, titleExtra || leading ? styles.headingShare : null]}>
                <View style={[styles.titleRow, titleExtra ? styles.titleRowWrap : null]}>
                  {title ? (
                    <Text style={titleSize === 'title' ? styles.titleQuiet : styles.title}>{title}</Text>
                  ) : null}
                  {titleExtra}
                </View>
                {typeof subtitle === 'string' ? (
                  <Text style={styles.subtitle}>{subtitle}</Text>
                ) : (
                  subtitle
                )}
              </View>
              {action ? <View style={styles.actionSlot}>{action}</View> : null}
            </View>
            {subhead}
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

/**
 * A choice settles rather than snapping. The brass rule grows in from the
 * row's middle, and the fill and the label shift with it, `motion.fast` on
 * the UI thread. In a list that takes one answer, the mark leaves one row as
 * it arrives on the next, which reads as the rule moving. Each row animates
 * its own mark because the row is also a checkbox in the filters, where
 * several are on at once and there is nothing to travel from.
 *
 * Starts at rest. A row that mounts already chosen is simply chosen.
 */
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
  const { color } = useTheme();

  // 0 at rest, 1 chosen.
  const chosen = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    chosen.value = withTiming(selected ? 1 : 0, { duration: motion.fast });
  }, [chosen, selected]);

  const rowStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(chosen.value, [0, 1], [color.surface, color.surfaceSunken]),
  }));
  const ruleStyle = useAnimatedStyle(() => ({
    opacity: chosen.value,
    transform: [{ scaleY: chosen.value }],
  }));
  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(chosen.value, [0, 1], [color.ink, color.brass]),
  }));

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.press, pressed && styles.pressed]}>
      <Animated.View style={[styles.row, rowStyle]}>
        <Animated.View pointerEvents="none" style={[styles.rule, ruleStyle]} />
        <Animated.Text style={[styles.label, labelStyle]}>{label}</Animated.Text>
        {count !== undefined ? <Text style={styles.count}>{count}</Text> : null}
      </Animated.View>
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

export function CloseButton({
  onPress,
  edge = 'end',
}: {
  onPress: () => void;
  /** `start` puts the glyph on the left gutter. Search leaves that way. */
  edge?: 'start' | 'end';
}) {
  const styles = useThemedStyles(closeStyles);
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Close"
      hitSlop={space.sm}
      onPress={onPress}
      style={({ pressed }) => [styles.close, edge === 'start' && styles.closeStart, pressed && styles.pressed]}>
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
  backRow: {
    paddingHorizontal: inset.screen,
  },
  // The glyph's left edge sits on the gutter, under nothing and over the title.
  back: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    alignItems: 'flex-start' as const,
    justifyContent: 'center' as const,
  },
  leading: {
    flexShrink: 0,
  },
  pressed: {
    opacity: 0.72,
  },
  // The title and its subhead are one group. `space.sm` between them, and the
  // page gap, `space.lg`, after the group rather than between its parts.
  headed: {
    gap: space.sm,
    paddingBottom: space.lg,
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
  headerFlush: {
    paddingBottom: 0,
  },
  heading: {
    flexShrink: 1,
    minWidth: 0,
  },
  // The title shares the row with a control, so the heading has to be a
  // measured width. Without one, the row is as wide as its contents and the
  // control never wraps under the title.
  headingShare: {
    flex: 1,
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
  titleRowWrap: {
    flexWrap: 'wrap' as const,
  },
  title: {
    ...type.display,
    color: theme.color.text,
    maxWidth: '100%' as const,
  },
  titleQuiet: {
    ...type.title,
    color: theme.color.text,
    maxWidth: '100%' as const,
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
  press: {
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: space.md,
    // The rule's width stays reserved, so the label does not move when the
    // rule is drawn over it.
    paddingLeft: inset.controlX + size.rule,
    paddingRight: inset.controlX,
    paddingVertical: inset.controlY,
    minHeight: HIT_TARGET,
  },
  // The chosen row's brass mark, on the left edge, scaled in from the middle.
  rule: {
    position: 'absolute' as const,
    left: 0,
    top: 0,
    bottom: 0,
    width: size.rule,
    backgroundColor: theme.color.brass,
  },
  pressed: {
    opacity: 0.72,
  },
  label: {
    ...type.labelStrong,
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
  closeStart: {
    alignItems: 'flex-start' as const,
    // The spare hit area sits past the glyph. Pull it back so the title
    // does not start a full target away from the X.
    marginRight: -(HIT_TARGET - size.icon),
  },
  pressed: {
    opacity: 0.72,
  },
});
