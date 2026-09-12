import type { PropsWithChildren, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { inset, radius, size, space, stack, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

export function Screen({
  title,
  action,
  children,
}: PropsWithChildren<{ title?: string; action?: ReactNode }>) {
  const styles = useThemedStyles(screenStyles);
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      {title || action ? (
        <View style={styles.header}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {action}
        </View>
      ) : null}
      {children}
    </SafeAreaView>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
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
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        pressed && styles.pressed,
        isDisabled && styles.disabled,
      ]}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? theme.color.onAccent : theme.color.text} />
      ) : (
        <Text style={[styles.label, variant !== 'primary' && styles.labelQuiet]}>{label}</Text>
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

const screenStyles = (theme: Theme) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.color.background,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: space.md,
    paddingHorizontal: inset.screen,
    paddingTop: space.md,
    paddingBottom: space.xl,
  },
  title: {
    ...type.display,
    color: theme.color.text,
  },
});

const buttonStyles = (theme: Theme) => ({
  base: {
    backgroundColor: theme.color.accent,
    borderRadius: radius.md,
    paddingVertical: inset.controlY,
    paddingHorizontal: inset.controlX,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: size.controlMin,
    borderWidth: 1,
    borderColor: theme.color.accent,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderColor: theme.color.borderStrong,
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
    color: theme.color.onAccent,
  },
  labelQuiet: {
    color: theme.color.text,
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
