import { useConversations } from '@/data/messages';
import { useSession } from '@/providers/session';

/**
 * How many conversations have something unread in them, for the count on the
 * Messages tab. Threads, not messages: six replies in one thread is one thing
 * to go and read.
 *
 * It reads the same cached list the conversation list renders, so opening a
 * thread clears the mark without a second request.
 */
export function useUnreadCount(): number {
  const { userId } = useSession();
  const { data } = useConversations(userId);
  return (data ?? []).filter((conversation) => conversation.unread > 0).length;
}
