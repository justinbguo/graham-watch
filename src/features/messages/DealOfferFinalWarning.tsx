import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Text, View } from 'react-native';

import { inset, radius, size, space, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

const COPY =
  'This offer is final once you send it. The buyer can accept, decline, or counter.';

export function DealOfferFinalWarning() {
  const theme = useTheme();
  const styles = useThemedStyles(warningStyles);

  return (
    <View style={styles.box} accessibilityRole="text">
      <MaterialCommunityIcons
        name="alert-outline"
        size={size.icon}
        color={theme.color.onCaution}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <Text style={styles.copy}>{COPY}</Text>
    </View>
  );
}

const warningStyles = (theme: Theme) => ({
  box: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.sm,
    backgroundColor: theme.color.caution,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: inset.controlX,
  },
  copy: {
    ...type.body,
    flex: 1,
    color: theme.color.onCaution,
  },
});
