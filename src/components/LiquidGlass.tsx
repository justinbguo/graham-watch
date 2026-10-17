import { BlurView } from 'expo-blur';
import { type PropsWithChildren } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';

import { glass, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

/**
 * Frosted material for chrome that floats over photographs or the page.
 * `expo-blur` samples what is behind on native; web uses a matched fallback.
 */
export function LiquidGlass({
  children,
  style,
  intensity = glass.intensity,
  tint,
}: PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  tint?: 'dark' | 'light' | 'default';
}>) {
  const theme = useTheme();
  const styles = useThemedStyles(glassStyles);
  const blurTint = tint ?? (theme.scheme === 'dark' ? 'dark' : 'light');

  if (Platform.OS === 'web') {
    return <View style={[styles.fallback, style]}>{children}</View>;
  }

  return (
    <BlurView intensity={intensity} tint={blurTint} style={[styles.blur, style]}>
      {children}
    </BlurView>
  );
}

const glassStyles = (theme: Theme) => ({
  blur: {
    overflow: 'hidden' as const,
    backgroundColor: theme.color.glassFill,
    borderWidth: 1,
    borderColor: theme.color.glassBorder,
  },
  fallback: {
    overflow: 'hidden' as const,
    backgroundColor: theme.color.glassFill,
    borderWidth: 1,
    borderColor: theme.color.glassBorder,
    ...(Platform.OS === 'web'
      ? ({ backdropFilter: `blur(${glass.blurPx}px)` } as ViewStyle)
      : null),
  },
});
