import { GuestGate } from '@/features/auth/GuestGate';
import { CommunityScreen } from '@/features/exchange/CommunityScreen';
import { useSession } from '@/providers/session';

export { TabErrorBoundary as ErrorBoundary } from '@/components/ErrorState';

export default function Community() {
  const { isSignedIn } = useSession();

  if (!isSignedIn) {
    return (
      <GuestGate
        title="Community"
        message="Sign in to read the exchange and post watches you are hunting or selling."
      />
    );
  }

  return <CommunityScreen />;
}
