import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import type { ExchangeAuthor } from '@/data/exchange';
import { formatRelativeTime } from '@/lib/format';
import { size, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { Tag } from './Tag';

/**
 * The byline. One line: a face, a name, the collector badge, and when — the
 * order a board is read in, and the order that decides whether a stranger's
 * post is worth the next ten seconds.
 *
 * It replaced a two-line block that stacked the name over the handle. The
 * handle is the smaller fact of the two and it was taking a whole line above
 * the title; it stays in the accessibility label and on the profile.
 */
export function PostHeader({
  author,
  at,
  /** The post's own control: the three dots on yours, nothing on anyone else's. */
  trailing,
}: {
  author: ExchangeAuthor;
  at: string;
  trailing?: ReactNode;
}) {
  const styles = useThemedStyles(headerStyles);
  const name = author.name ?? (author.handle ? `@${author.handle}` : 'A collector');

  return (
    <View style={styles.row}>
      <Avatar url={author.avatar_url} px={size.avatarSmall} />
      <Text style={styles.name} numberOfLines={1}>
        {name}
      </Text>
      {author.number ? <Tag label={`Collector #${author.number}`} tone="quiet" /> : null}
      <Text style={styles.when} numberOfLines={1}>
        {`· ${formatRelativeTime(at)}`}
      </Text>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );
}

const headerStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    // The menu hangs out of this line. Without a stacking order of its own,
    // the photograph below paints over it when it opens.
    zIndex: 1,
  },
  name: {
    ...type.labelStrong,
    color: theme.color.text,
    flexShrink: 1,
  },
  when: {
    ...type.caption,
    color: theme.color.textFaint,
    flexShrink: 0,
  },
  // Pushed to the far edge, so the byline reads left to right and the control
  // is where a control is on every other row in the app.
  trailing: {
    marginLeft: 'auto' as const,
  },
});
