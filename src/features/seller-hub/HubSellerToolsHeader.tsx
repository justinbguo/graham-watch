import { Text, View } from 'react-native';

import { space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/** Labels the seller hub section rail and mobile tab bar. */
export function HubSellerToolsHeader() {
  const styles = useThemedStyles(headerStyles);

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Seller Tools</Text>
    </View>
  );
}

const headerStyles = (theme: Theme) => ({
  root: {
    alignSelf: 'stretch' as const,
    paddingBottom: space.xs,
  },
  title: {
    ...type.labelStrong,
    color: theme.color.text,
  },
});
