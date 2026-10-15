import { HeaderIcon } from '@/components/HeaderIcon';
import { Screen } from '@/components/ui';
import { useOpenStack } from '@/lib/openStack';

import { ConversationList } from './ConversationList';

/** The Messages tab. The plus opens New message as a sheet over it. */
export function MessagesScreen({ userId }: { userId: string }) {
  const open = useOpenStack();

  return (
    <Screen
      title="Messages"
      inTabs
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
