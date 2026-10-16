import type { ConversationWith, GroupMember } from '@/data/messages';

/** The name at the top of a thread, and on its row in the list. */
export function partyName(who: ConversationWith): string {
  if (who.kind === 'dealer') return who.name;
  if (who.kind === 'group') return who.title;
  if (who.name) return who.name;
  return who.handle ? `@${who.handle}` : 'A collector';
}

/**
 * The line under that name. A person is placed by their handle and their
 * number. A claimed shop is a shop. One that has not claimed gets the claim
 * badge under the name instead of this line.
 */
export function partyLine(who: ConversationWith): string | null {
  if (who.kind === 'group') {
    return who.count === 1 ? '1 person' : `${who.count} people`;
  }
  if (who.kind === 'dealer') {
    return who.byEmail ? null : 'Shop';
  }
  const collector = who.number ? `Collector #${who.number}` : null;
  // The name is already the heading, so the handle only repeats it when
  // there is no name to show.
  const handle = who.name && who.handle ? `@${who.handle}` : null;
  return [handle, collector].filter(Boolean).join(' · ') || null;
}

/** The short name above someone else's bubble in a group. */
export function memberLabel(members: GroupMember[], userId: string): string {
  const member = members.find((person) => person.userId === userId);
  if (!member) return 'Someone';
  const first = member.name?.trim().split(/\s+/)[0];
  if (first) return first;
  return member.handle ? `@${member.handle}` : 'Someone';
}
