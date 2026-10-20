import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { radius, size, space, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

const LOGO = require('../../assets/logo.png');

type WordmarkSize = 'signIn' | 'header' | 'headerText';

/**
 * Brand lockup on sign-in. Desktop nav can show the word alone (`headerText`)
 * or the mark with the word (`header`).
 */
export function Wordmark({ variant = 'signIn' }: { variant?: WordmarkSize }) {
  const styles = useThemedStyles(wordmarkStyles);
  const theme = useTheme();
  const dim = variant === 'header' ? size.headerLogo : size.wordmarkLogo;
  const header = variant === 'header';
  const headerText = variant === 'headerText';

  if (headerText) {
    return (
      <Text
        style={[styles.name, styles.nameOnly, { color: theme.color.text }]}
        accessibilityRole="header"
        accessibilityLabel="Graham">
        GRAHAM
      </Text>
    );
  }

  return (
    <View
      style={[styles.frame, header && styles.lockup]}
      accessible
      accessibilityLabel="Graham">
      <Image
        source={LOGO}
        style={[styles.logo, { width: dim, height: dim }]}
        contentFit="contain"
        accessible={false}
      />
      {header ? (
        <Text style={[styles.name, { color: theme.color.text }]} accessible={false}>
          GRAHAM
        </Text>
      ) : null}
    </View>
  );
}

const wordmarkStyles = (_theme: Theme) => ({
  frame: {
    alignSelf: 'flex-start' as const,
  },
  lockup: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    alignSelf: 'center' as const,
    minHeight: size.headerLogo,
    gap: space.sm,
    flexShrink: 0,
  },
  logo: {
    borderRadius: radius.md,
    overflow: 'hidden' as const,
  },
  name: {
    ...type.wordmarkHeader,
    height: size.headerLogo,
    textAlignVertical: 'center' as const,
    // Caps sit low in the em box; one step up lines up with the mark and nav pills.
    marginTop: -space.xs / 2,
  },
  nameOnly: {
    flexShrink: 0,
  },
});
