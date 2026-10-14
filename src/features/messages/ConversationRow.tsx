import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import type { ConversationSummary } from '@/data/messages';
import { dealerPicture } from '@/features/dealers/picture';
import { formatRelativeTime } from '@/lib/format';
import { radius, size, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { partyName } from './party';

/**
 * One thread in the list: who it is with, the last thing said, and when.
 *
 * Unread is a dot at the end of the line, not a count. The number of messages
 * waiting does not change what you do about them, and a badge on every row
 * turns the list into a scoreboard.
 */
export function ConversationRow({
  conversation,
  onPress,
  detail,
  label,
  busy = false,
}: {
  conversation: ConversationSummary;
  onPress: () => void;
  /** Replaces the last-line preview. A row that is not a thread yet. */
  detail?: string;
  label?: string;
  busy?: boolean;
}) {
  const styles = useThemedStyles(rowStyles);
  const who = conversation.with;
  const name = partyName(who);
  const unread = !detail && conversation.unread > 0;
  const preview =
    detail ??
    (conversation.last
      ? `${conversation.last.mine ? 'You: ' : ''}${conversation.last.body}`
      : 'No messages yet');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? (unread ? `${name}, unread` : name)}
      accessibilityState={{ disabled: busy, busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && !busy && styles.pressed,
        busy && styles.busy,
      ]}>
      <Avatar
        url={who.kind === 'person' ? who.avatar_url : who.logoUrl}
        glyph={who.kind === 'person' ? 'account-outline' : undefined}
        fallback={who.kind === 'dealer' ? dealerPicture : undefined}
        fit={who.kind === 'dealer' ? 'contain' : 'cover'}
      />
      <View style={styles.copy}>
        <View style={styles.line}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          {!detail && conversation.last ? (
            <Text style={styles.when}>{formatRelativeTime(conversation.last.at)}</Text>
          ) : null}
        </View>
        <View style={styles.line}>
          <Text style={[styles.preview, unread && styles.unreadPreview]} numberOfLines={1}>
            {preview}
          </Text>
          {unread ? <View style={styles.dot} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

const rowStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingVertical: space.md,
  },
  pressed: {
    opacity: 0.72,
  },
  busy: {
    opacity: 0.4,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: stack.tight,
  },
  line: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  name: {
    ...type.labelStrong,
    color: theme.color.text,
    flexShrink: 1,
  },
  when: {
    ...type.caption,
    color: theme.color.textFaint,
    marginLeft: 'auto' as const,
  },
  preview: {
    ...type.caption,
    color: theme.color.textMuted,
    flexShrink: 1,
  },
  unreadPreview: {
    color: theme.color.text,
  },
  dot: {
    width: size.unread,
    height: size.unread,
    borderRadius: radius.full,
    marginLeft: 'auto' as const,
    backgroundColor: theme.color.brass,
  },
});
