import { GuestGate } from '@/features/auth/GuestGate';
import { MessagesScreen } from '@/features/messages/MessagesScreen';
import { useClaimedDealerShop } from '@/features/seller-hub/claimedShop';
import { SellerHubScreen } from '@/features/seller-hub/SellerHubScreen';
import { useSession } from '@/providers/session';

export { TabErrorBoundary as ErrorBoundary } from '@/components/ErrorState';

export default function Messages() {
  const { userId, isSignedIn } = useSession();
  const { shop, ready } = useClaimedDealerShop();

  if (!isSignedIn) {
    return (
      <GuestGate
        title="Messages"
        message="Sign in to write dealers and keep your conversations."
      />
    );
  }

  if (ready && shop) {
    return <SellerHubScreen shop={shop} />;
  }

  return <MessagesScreen userId={userId!} />;
}
