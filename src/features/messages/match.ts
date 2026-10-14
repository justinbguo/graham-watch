import type { ConversationSummary } from '@/data/messages';

import { partyName } from './party';

/**
 * Whether this thread should stay on screen for what was typed. The latest
 * line is here; older lines arrive as conversation ids from the database.
 */
export function conversationMatches(conversation: ConversationSummary, query: string): boolean {
  const term = query.trim().toLowerCase();
  if (!term) return true;
  const bare = term.replace(/^@/, '');
  const who = conversation.with;
  const name = partyName(who).toLowerCase();
  const handle = who.kind === 'person' ? (who.handle ?? '').toLowerCase() : '';
  const last = conversation.last?.body.toLowerCase() ?? '';
  const named =
    name.includes(term) ||
    (bare.length > 0 && name.includes(bare)) ||
    (handle.length > 0 && (handle.includes(bare) || `@${handle}`.includes(term)));
  return named || last.includes(term);
}

export function visibleConversations(
  conversations: ConversationSummary[],
  query: string,
  bodyIds: ReadonlySet<string>,
): ConversationSummary[] {
  const term = query.trim();
  if (!term) return conversations;
  return conversations.filter(
    (conversation) => conversationMatches(conversation, term) || bodyIds.has(conversation.id),
  );
}

/** True when a thread with this exact username is already in the list. */
export function hasHandle(conversations: ConversationSummary[], handle: string): boolean {
  const bare = handle.toLowerCase();
  return conversations.some(
    (conversation) =>
      conversation.with.kind === 'person' && conversation.with.handle?.toLowerCase() === bare,
  );
}
