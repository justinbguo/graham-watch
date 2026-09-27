import { Text } from 'react-native';

import { type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/**
 * The name. Sign-in and the deck title both render this, so the letters, the
 * cut, and the tracking cannot drift apart.
 *
 * `fit` is for a header that also holds a check and controls. The letters
 * shrink to stay on one line rather than wrapping. Sign-in has the room, so
 * it leaves the size at `type.wordmark`.
 */
export function Wordmark({ fit = false }: { fit?: boolean }) {
  const styles = useThemedStyles(wordmarkStyles);

  return (
    <Text
      style={styles.mark}
      numberOfLines={1}
      adjustsFontSizeToFit={fit}
      minimumFontScale={0.8}>
      GRAHAM
    </Text>
  );
}

const wordmarkStyles = (theme: Theme) => ({
  mark: {
    ...type.wordmark,
    flexShrink: 1,
    color: theme.color.text,
  },
});
