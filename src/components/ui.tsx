import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { PropsWithChildren, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  action,
  width = 'reading',
  inTabs = false,
  inSheet = false,
  children,
}: PropsWithChildren<{
  title?: string;
  action?: ReactNode;
  width?: LayoutWidth;
  inTabs?: boolean;
  inSheet?: boolean;
}>) {
  const styles = useThemedStyles(screenStyles);
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
        {title || action ? (
          <View style={styles.header}>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {action}
          </View>
        ) : null}
        {children}
      </View>
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'outline',
  loading = false,
  disabled = false,
}: {
  label: string;
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
        <ActivityIndicator color={variant === 'solid' ? theme.color.onAccent : theme.color.text} />
      ) : (
        <Text style={[styles.label, variant === 'solid' && styles.labelSolid]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Field(props: TextInputProps) {
  const styles = useThemedStyles(fieldStyles);
  const theme = useTheme();
  return (
    <TextInput
      placeholderTextColor={theme.color.textFaint}
      autoCapitalize="none"
      autoCorrect={false}
      {...props}
      style={[styles.field, props.style]}
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
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: space.md,
    paddingHorizontal: inset.screen,
    paddingBottom: space.xl,
  },
  title: {
    ...type.display,
    color: theme.color.text,
  },
});

const buttonStyles = (theme: Theme) => ({
  base: {
    backgroundColor: 'transparent',
    borderRadius: radius.md,
    paddingVertical: inset.controlY,
    paddingHorizontal: inset.controlX,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: size.controlMin,
    borderWidth: 1,
    borderColor: theme.color.borderStrong,
  },
  solid: {
    backgroundColor: theme.color.accent,
    borderColor: theme.color.accent,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.4,
  },
  label: {
    ...type.label,
    color: theme.color.text,
  },
  labelSolid: {
    color: theme.color.onAccent,
  },
});

const fieldStyles = (theme: Theme) => ({
  field: {
    ...type.body,
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: radius.md,
    paddingHorizontal: inset.controlX,
    paddingVertical: inset.controlY,
    color: theme.color.text,
    minHeight: size.controlMin,
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
    ...type.label,
    color: theme.color.text,
  },
  labelSelected: {
    color: theme.color.brass,
  },
  count: {
    ...type.caption,
    color: theme.color.textFaint,
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
    alignItems: 'center' as const,
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
