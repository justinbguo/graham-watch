import { Text, View } from 'react-native';

import { intentLabel, type ExchangePost } from '@/data/exchange';
import { space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { priceLine } from './copy';
import { Tag } from './Tag';

/**
 * The watch, and the two facts that say whether the post is for you. They
 * share the title's line when the title is short, and wrap under it when
 * the title takes the width. A line of their own under one word spent a
 * row on two capsules.
 */
export function PostTitle({
  title,
  post,
  lines,
  variant = 'card',
}: {
  title: string;
  post: Pick<ExchangePost, 'intent' | 'price_cents' | 'currency'>;
  lines?: number;
  variant?: 'card' | 'thread';
}) {
  const styles = useThemedStyles(titleStyles);

  return (
    <View style={styles.row}>
      <Text
        style={variant === 'thread' ? styles.thread : styles.card}
        numberOfLines={lines}>
        {title}
      </Text>
      <Tag label={intentLabel(post.intent)} />
      <Tag label={priceLine(post)} />
    </View>
  );
}

const titleStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  card: {
    ...type.titleSmall,
    color: theme.color.text,
    flexShrink: 1,
    maxWidth: '100%' as const,
  },
  thread: {
    ...type.title,
    color: theme.color.text,
    flexShrink: 1,
    maxWidth: '100%' as const,
  },
});
