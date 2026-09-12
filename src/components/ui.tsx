import type { PropsWithChildren } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/lib/theme';

export function Screen({ title, children }: PropsWithChildren<{ title?: string }>) {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      {title ? <Text style={styles.screenTitle}>{title}</Text> : null}
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
  variant?: 'primary' | 'secondary';
  loading?: boolean;
  disabled?: boolean;
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' && styles.buttonSecondary,
        (pressed || isDisabled) && styles.buttonDimmed,
      ]}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? theme.color.surface : theme.color.text} />
      ) : (
        <Text style={[styles.buttonLabel, variant === 'secondary' && styles.buttonLabelSecondary]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Field(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={theme.color.muted}
      autoCapitalize="none"
      autoCorrect={false}
      {...props}
      style={[styles.field, props.style]}
    />
  );
}

export function Message({ text, tone = 'muted' }: { text: string; tone?: 'muted' | 'error' }) {
  return <Text style={tone === 'error' ? styles.error : styles.muted}>{text}</Text>;
}

export function Centered({ children }: PropsWithChildren) {
  return <View style={styles.centered}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.color.bg,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.color.text,
    paddingHorizontal: theme.space(2),
    paddingTop: theme.space(1),
    paddingBottom: theme.space(2),
  },
  button: {
    backgroundColor: theme.color.accent,
    borderRadius: theme.radius,
    paddingVertical: theme.space(1.75),
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  buttonDimmed: {
    opacity: 0.6,
  },
  buttonLabel: {
    color: theme.color.surface,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonLabelSecondary: {
    color: theme.color.text,
  },
  field: {
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius,
    paddingHorizontal: theme.space(2),
    paddingVertical: theme.space(1.75),
    fontSize: 16,
    color: theme.color.text,
  },
  muted: {
    color: theme.color.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  error: {
    color: theme.color.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.space(3),
    gap: theme.space(1),
  },
});
