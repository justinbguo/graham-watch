import { HeaderIcon } from '@/components/HeaderIcon';
import { Screen } from '@/components/ui';
import { useOpenStack } from '@/lib/openStack';

import { ConversationList } from './ConversationList';

type MessagesScreenProps = {
  userId: string;
  back?: { label: string; onPress: () => void };
};

/** The Messages tab, or the same list pushed from Seller Hub. */
export function MessagesScreen({ userId, back }: MessagesScreenProps) {
  const open = useOpenStack();

  return (
    <Screen
      title="Messages"
      inTabs={!back}
      back={back}
      action={
        <HeaderIcon
          label="New message"
          name="plus"
          onPress={() => open('new-message', undefined, '/new-message')}
        />
      }>
      <ConversationList userId={userId} />
    </Screen>
  );
}
