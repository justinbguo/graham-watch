import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import type { ExchangeAuthor } from '@/data/exchange';
import { formatRelativeTime } from '@/lib/format';
import { size, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { personMonogram } from '@/lib/avatarMonogram';

import { atHandle } from './copy';

/**
 * The byline and whatever is named under it — the post's title. They are one
 * fact, who then what, so the gap is `space.sm` and the left edge is the
 * face's. The rest of a post stays a step further apart.
 *
 * Stacks above the photograph. The author's menu hangs out of the byline, and
 * without its own layer the photograph paints over the open menu.
 */
export function PostLead({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(headerStyles);
  return <View style={styles.lead}>{children}</View>;
}

/**
 * The byline. One line: a face, a username, the collector number, and when.
 * The given name is the title of their profile, so the board does not say it
 * again on every post.
 *
 * The line is a button. The face and the username are the person, and tapping
 * them opens that person. It stays outside the post's own button: a button
 * inside a button is invalid on the web, and one tap would both open the
 * post and open the person.
 */
export function PostHeader({
  author,
  at,
  onPress,
  /** The post's own control: the three dots on yours, nothing on anyone else's. */
  trailing,
}: {
  author: ExchangeAuthor;
  at: string;
  onPress: () => void;
  trailing?: ReactNode;
}) {
  const styles = useThemedStyles(headerStyles);
  const name = atHandle(author.handle) ?? 'A collector';

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name}'s profile`}
        disabled={!author.id}
        onPress={onPress}
        hitSlop={space.sm}
        style={styles.person}>
        <Avatar
          url={author.avatar_url}
          px={size.avatarByline}
          monogram={personMonogram({
            userId: author.id,
            name: author.name,
            handle: author.handle,
          })}
        />
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {author.number ? (
          <Text style={styles.collector} numberOfLines={1}>{`Collector #${author.number}`}</Text>
        ) : null}
        <Text style={styles.when} numberOfLines={1}>
          {`· ${formatRelativeTime(at)}`}
        </Text>
      </Pressable>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );
}

const headerStyles = (theme: Theme) => ({
  lead: {
    gap: space.sm,
    zIndex: 1,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    // The menu hangs out of this line. Without a stacking order of its own,
    // the photograph below paints over it when it opens.
    zIndex: 1,
  },
  person: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    minWidth: 0,
  },
  name: {
    ...type.bodyStrong,
    color: theme.color.text,
    flexShrink: 1,
  },
  // Membership, in brass type rather than a capsule: a box around data reads
  // as a control.
  collector: {
    ...type.body,
    color: theme.color.brass,
    flexShrink: 0,
  },
  when: {
    ...type.body,
    color: theme.color.textFaint,
    flexShrink: 0,
  },
  // Pushed to the far edge, so the byline reads left to right and the control
  // is where a control is on every other row in the app.
  trailing: {
    marginLeft: 'auto' as const,
  },
});
