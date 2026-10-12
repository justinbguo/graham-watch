import { Text, View } from 'react-native';

import { radius, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/**
 * A flair under a title. `plain` names what a post is — Selling, Buying,
 * Trading, Random. `money` is a stated price.
 *
 * Both are one shape: caption type in a capsule that hugs it, `space.sm` on
 * the sides. Only the fill differs, so a price and an intent read as the same
 * kind of mark under the name.
 */
export function Tag({ label, tone = 'plain' }: { label: string; tone?: 'plain' | 'money' }) {
  const styles = useThemedStyles(tagStyles);
  const money = tone === 'money';
  return (
    <View style={[styles.tag, money && styles.money]}>
      <Text style={[styles.label, money && styles.moneyLabel]}>{label}</Text>
    </View>
  );
}

const tagStyles = (theme: Theme) => ({
  tag: {
    paddingHorizontal: space.sm,
    borderRadius: radius.full,
    backgroundColor: theme.color.fill,
  },
  label: {
    ...type.caption,
    color: theme.color.ink,
  },
  money: {
    backgroundColor: theme.color.money,
  },
  moneyLabel: {
    color: theme.color.onMoney,
  },
});
