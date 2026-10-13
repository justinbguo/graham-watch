import { Text } from 'react-native';

import { type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/**
 * The name on sign-in. The deck's title is `Graham` in `display`, the same
 * size as the other headers, so this lockup stays on the sign-in screen.
 */
export function Wordmark() {
  const styles = useThemedStyles(wordmarkStyles);

  return <Text style={styles.mark}>GRAHAM</Text>;
}

const wordmarkStyles = (theme: Theme) => ({
  mark: {
    ...type.wordmark,
    flexShrink: 1,
    color: theme.color.text,
  },
});
