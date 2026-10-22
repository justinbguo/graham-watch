import { useMemo } from 'react';

import { useConversations, type ConversationSummary } from '@/data/messages';
import { useSession } from '@/providers/session';

/** Threads where the caller is answering as this shop, not as a collector. */
export function shopThreads(
  conversations: ConversationSummary[],
  dealerId: string,
): ConversationSummary[] {
  return conversations.filter((row) => row.threadDealerId === dealerId);
}

export function shopUnreadCount(conversations: ConversationSummary[], dealerId: string): number {
  return shopThreads(conversations, dealerId).filter((row) => row.unread > 0).length;
}

export function useShopInbox(dealerId: string | null) {
  const { userId } = useSession();
  const list = useConversations(userId);
  const threads = useMemo(
    () => (dealerId ? shopThreads(list.data ?? [], dealerId) : []),
    [dealerId, list.data],
  );

  return {
    threads,
    isPending: list.isPending,
    error: list.error,
    refetch: list.refetch,
  };
}

export function useShopUnreadCount(dealerId: string | null): number {
  const { userId } = useSession();
  const { data } = useConversations(userId);
  if (!dealerId) return 0;
  return shopUnreadCount(data ?? [], dealerId);
}
