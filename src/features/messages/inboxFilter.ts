import type { ConversationSummary } from '@/data/messages';

export type InboxFilter = 'all' | 'unread' | 'favorites' | 'groups';

export function passesInboxFilter(
  conversation: ConversationSummary,
  filter: InboxFilter,
  followedDealerIds: ReadonlySet<string>,
): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'unread':
      return conversation.unread > 0;
    case 'groups':
      return conversation.with.kind === 'group';
    case 'favorites':
      return (
        conversation.with.kind === 'dealer' && followedDealerIds.has(conversation.with.dealerId)
      );
    default:
      return true;
  }
}

export function inboxFilterEmptyMessage(filter: InboxFilter): string {
  switch (filter) {
    case 'unread':
      return 'No unread messages.';
    case 'favorites':
      return 'No messages with shops you follow.';
    case 'groups':
      return 'No group chats yet.';
    default:
      return 'No messages match.';
  }
}
