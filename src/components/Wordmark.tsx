import { Image } from 'expo-image';
import { View } from 'react-native';

import { radius, size, space, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

const LOGO = require('../../assets/logo.png');

/**
 * Brand lockup on sign-in. Buy uses the search bar; this is the gold G mark.
 */
export function Wordmark() {
  const styles = useThemedStyles(wordmarkStyles);

  return (
    <View style={styles.frame}>
      <Image source={LOGO} style={styles.logo} contentFit="contain" accessible accessibilityLabel="Graham" />
    </View>
  );
}

const wordmarkStyles = (_theme: Theme) => ({
  frame: {
    alignSelf: 'flex-start' as const,
  },
  logo: {
    width: size.wordmarkLogo,
    height: size.wordmarkLogo,
    borderRadius: radius.md,
    overflow: 'hidden' as const,
  },
});
