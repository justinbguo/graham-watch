import { Screen } from '@/components/ui';
import { GuestGate } from '@/features/auth/GuestGate';
import { ConversationList } from '@/features/messages/ConversationList';
import { useSession } from '@/providers/session';

export { TabErrorBoundary as ErrorBoundary } from '@/components/ErrorState';

export default function Messages() {
  const { userId, isSignedIn } = useSession();

  if (!isSignedIn) {
    return (
      <GuestGate
        title="Messages"
        message="Sign in to write dealers and keep your conversations."
      />
    );
  }

  return (
    <Screen title="Messages" inTabs>
      <ConversationList userId={userId!} />
    </Screen>
  );
}
