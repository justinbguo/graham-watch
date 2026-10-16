import { GuestGate } from '@/features/auth/GuestGate';
import { MessagesScreen } from '@/features/messages/MessagesScreen';
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

  return <MessagesScreen userId={userId!} />;
}
