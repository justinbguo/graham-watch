import { HeaderIcon } from '@/components/HeaderIcon';

import { useUnreadCount } from './count';

function unreadLabel(unread: number) {
  if (unread === 0) return 'Messages';
  return `Messages, ${unread} unread`;
}

/** The speech bubble that opens Messages. The dot is threads waiting, not a count. */
export function MessagesButton({ onPress }: { onPress: () => void }) {
  const unread = useUnreadCount();
  return (
    <HeaderIcon
      label={unreadLabel(unread)}
      name="chat-outline"
      marked={unread > 0}
      onPress={onPress}
    />
  );
}
