import { Text, View } from 'react-native';

import { inset, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

export function HubPlaceholder({ body }: { body: string }) {
  const styles = useThemedStyles(placeholderStyles);

  return (
    <View style={styles.root}>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const placeholderStyles = (theme: Theme) => ({
  root: {
    paddingVertical: space.sm,
    paddingHorizontal: inset.card,
  },
  body: {
    ...type.body,
    color: theme.color.textMuted,
  },
});
