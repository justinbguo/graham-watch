import { Pressable, Text, View } from 'react-native';

import type { ConversationSummary } from '@/data/messages';
import { formatRelativeTime } from '@/lib/format';
import { radius, size, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { PartyAvatar } from './PartyAvatar';
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
  selected = false,
  desktop = false,
  onOpenParty,
}: {
  conversation: ConversationSummary;
  onPress: () => void;
  /** Replaces the last-line preview. A row that is not a thread yet. */
  detail?: string;
  label?: string;
  busy?: boolean;
  selected?: boolean;
  /** Desktop split: full-bleed rows with hairlines between them. */
  desktop?: boolean;
  onOpenParty?: () => void;
}) {
  const styles = useThemedStyles(rowStyles);
  const who = conversation.with;
  const name = partyName(who);
  const unread = !detail && conversation.unread > 0;
  const preview = detail ?? lastLine(conversation);

  const rowStyle = [
    styles.row,
    !desktop && selected && styles.selected,
    busy && styles.busy,
  ];

  const desktopShotStyle = [
    styles.desktopShot,
    selected && styles.selectedDesktop,
    busy && styles.busy,
  ];

  const copy = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? (unread ? `${name}, unread` : name)}
      accessibilityState={{ disabled: busy, busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [styles.rowPress, pressed && !busy && styles.pressed]}>
      <View style={styles.copy}>
        <View style={styles.line}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          {!detail && conversation.last ? (
            <Text style={[styles.when, unread && desktop && styles.whenUnread]}>
              {formatRelativeTime(conversation.last.at)}
            </Text>
          ) : null}
        </View>
        <View style={styles.line}>
          <Text style={[styles.preview, unread && styles.unreadPreview]} numberOfLines={1}>
            {preview}
          </Text>
          {unread ? <View style={[styles.dot, desktop && styles.dotDesktop]} /> : null}
        </View>
      </View>
    </Pressable>
  );

  if (desktop) {
    return (
      <View style={desktopShotStyle}>
        <View style={styles.rowDesktop}>
          <PartyAvatar who={who} px={size.avatarSmall} onPress={onOpenParty} />
          <View style={styles.copyDesktop}>{copy}</View>
        </View>
      </View>
    );
  }

  return (
    <View style={rowStyle}>
      <PartyAvatar who={who} onPress={onOpenParty} />
      {copy}
    </View>
  );
}

function lastLine(conversation: ConversationSummary) {
  if (!conversation.last) return 'No messages yet';
  const speaker = conversation.last.mine
    ? 'You: '
    : conversation.last.senderName
      ? `${conversation.last.senderName}: `
      : '';
  return `${speaker}${conversation.last.body}`;
}

const rowStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    marginHorizontal: -space.sm,
    borderRadius: radius.md,
  },
  desktopShot: {
    width: '100%' as const,
    marginBottom: space.sm,
    borderRadius: radius.md,
    overflow: 'hidden' as const,
  },
  rowDesktop: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  copyDesktop: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center' as const,
  },
  selected: {
    backgroundColor: theme.color.surfaceSunken,
  },
  selectedDesktop: {
    backgroundColor: theme.color.messageIncoming,
  },
  rowPress: {
    flex: 1,
    minWidth: 0,
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
    flexShrink: 0,
  },
  whenUnread: {
    color: theme.color.save,
  },
  preview: {
    ...type.caption,
    color: theme.color.textMuted,
    flexShrink: 1,
  },
  unreadPreview: {
    color: theme.color.text,
    fontFamily: type.labelStrong.fontFamily,
  },
  dot: {
    width: size.unread,
    height: size.unread,
    borderRadius: radius.full,
    marginLeft: 'auto' as const,
    backgroundColor: theme.color.brass,
  },
  dotDesktop: {
    backgroundColor: theme.color.save,
  },
});
