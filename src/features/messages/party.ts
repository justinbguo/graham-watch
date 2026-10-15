import type { ConversationWith } from '@/data/messages';

/** The name at the top of a thread, and on its row in the list. */
export function partyName(who: ConversationWith): string {
  if (who.kind === 'dealer') return who.name;
  if (who.name) return who.name;
  return who.handle ? `@${who.handle}` : 'A collector';
}

/**
 * The line under that name. A person is placed by their handle and their
 * number. A claimed shop is a shop. One that has not claimed gets the claim
 * badge under the name instead of this line.
 */
export function partyLine(who: ConversationWith): string | null {
  if (who.kind === 'dealer') {
    return who.byEmail ? null : 'Shop';
  }
  const collector = who.number ? `Collector #${who.number}` : null;
  // The name is already the heading, so the handle only repeats it when
  // there is no name to show.
  const handle = who.name && who.handle ? `@${who.handle}` : null;
  return [handle, collector].filter(Boolean).join(' · ') || null;
}
