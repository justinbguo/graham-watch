import { PausedFrame } from '@/components/PausedBanner';
import { Screen } from '@/components/ui';
import { useIsDesktopWeb } from '@/lib/layout';
import { useOpenStack } from '@/lib/openStack';

import { ConversationList } from './ConversationList';
import { DesktopMessagesLayout } from './DesktopMessagesLayout';
import { NewMessageButton } from './NewMessageButton';

type MessagesScreenProps = {
  userId: string;
  back?: { label: string; onPress: () => void };
  conversationId?: string | null;
  listingId?: string | null;
};

/** The Messages tab, or the same list pushed from Seller Hub. */
export function MessagesScreen({
  userId,
  back,
  conversationId = null,
  listingId = null,
}: MessagesScreenProps) {
  const isDesktopWeb = useIsDesktopWeb();
  const open = useOpenStack();

  if (isDesktopWeb) {
    return (
      <PausedFrame>
        <DesktopMessagesLayout
          userId={userId}
          conversationId={conversationId}
          listingId={listingId}
          back={back}
        />
      </PausedFrame>
    );
  }

  return (
    <PausedFrame>
      <Screen
        title="Messages"
        inTabs={!back}
        back={back}
        action={<NewMessageButton onPress={() => open('new-message', undefined, '/new-message')} />}>
        <ConversationList userId={userId} selectedConversationId={conversationId} />
      </Screen>
    </PausedFrame>
  );
}
