import type { ConversationWith } from '@/data/messages';
import { useOpenStack } from '@/lib/openStack';

/** The profile behind a message avatar: a shop page or a collector page. */
export function useOpenParty() {
  const open = useOpenStack();

  return (who: ConversationWith) => {
    if (who.kind === 'dealer') {
      open('dealer/[dealerId]', { dealerId: who.dealerId }, `/dealer/${who.dealerId}`);
      return;
    }
    if (who.userId) {
      open('collector/[userId]', { userId: who.userId }, `/collector/${who.userId}`);
    }
  };
}
