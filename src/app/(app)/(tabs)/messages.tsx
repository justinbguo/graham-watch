import { Screen } from '@/components/ui';
import { ConversationList } from '@/features/messages/ConversationList';
import { useSession } from '@/providers/session';

export { TabErrorBoundary as ErrorBoundary } from '@/components/ErrorState';

export default function Messages() {
  const { userId } = useSession();

  return (
    <Screen title="Messages" inTabs>
      <ConversationList userId={userId!} />
    </Screen>
  );
}
