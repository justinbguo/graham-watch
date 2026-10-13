import { type Ref } from 'react';
import { TextInput, type TextInputProps } from 'react-native';

import { useTheme, useThemedStyles } from '@/providers/theme';

import { onboardingStyles } from './styles';

/**
 * A typed answer on a question slide. A hairline and title-size type, not the
 * filled `Field` used for search, sign-in, and the shop form.
 */
export function LineField({ ref, ...props }: TextInputProps & { ref?: Ref<TextInput> }) {
  const styles = useThemedStyles(onboardingStyles);
  const theme = useTheme();
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={theme.color.textMuted}
      autoCapitalize="none"
      autoCorrect={false}
      {...props}
      style={[styles.line, props.style]}
    />
  );
}
