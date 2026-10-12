import { Text, View } from 'react-native';

import { intentLabel, type ExchangePost } from '@/data/exchange';
import { space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { hasPrice, priceLine } from './copy';
import { Tag } from './Tag';

/**
 * The watch, then what it costs, each on its own line. The price used to sit
 * at the right of the name, so a long name wrapped beside the chip and the
 * two read as one line. A sale's chip is the price. A request with a budget
 * is "Up to". A trade, a random post, or a request with none names the intent.
 */
export function PostTitle({
  title,
  post,
}: {
  title: string;
  post: Pick<ExchangePost, 'intent' | 'price_cents' | 'currency'>;
}) {
  const styles = useThemedStyles(titleStyles);
  const priced = hasPrice(post.intent) && post.price_cents != null;

  return (
    <View style={styles.block}>
      <Text style={styles.title}>{title}</Text>
      {priced ? (
        <Tag label={priceLine(post)} tone="money" />
      ) : (
        <Tag label={intentLabel(post.intent)} />
      )}
    </View>
  );
}

const titleStyles = (theme: Theme) => ({
  block: {
    alignItems: 'flex-start' as const,
    gap: space.sm,
  },
  title: {
    ...type.bodyStrong,
    color: theme.color.text,
  },
});
