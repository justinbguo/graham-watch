import * as Linking from 'expo-linking';
import { Pressable, Text, View } from 'react-native';

import { Message } from '@/components/ui';
import { inset, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

const SUPPORT_EMAIL = 'hello@graham.watch';

/** Dealer help: contact and policy pointers until in-app support is built. */
export function SellerSupportPanel() {
  const styles = useThemedStyles(panelStyles);

  const mail = () => {
    void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Seller%20support`);
  };

  return (
    <View style={styles.root}>
      <Message
        text="Questions about listings, deals, or your shop? We respond by email during business hours."
        tone="muted"
      />
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Email ${SUPPORT_EMAIL}`}
        onPress={mail}
        style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}>
        <Text style={styles.linkLabel}>Email support</Text>
        <Text style={styles.linkValue}>{SUPPORT_EMAIL}</Text>
      </Pressable>
    </View>
  );
}

const panelStyles = (theme: Theme) => ({
  root: {
    paddingVertical: space.sm,
    paddingHorizontal: inset.card,
    gap: stack.related,
  },
  linkRow: {
    gap: space.xs / 2,
  },
  linkLabel: {
    ...type.labelStrong,
    color: theme.color.text,
  },
  linkValue: {
    ...type.body,
    color: theme.color.brass,
  },
  pressed: {
    opacity: 0.72,
  },
});
