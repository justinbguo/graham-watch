import { useLocalSearchParams } from 'expo-router';

import { GuestGate } from '@/features/auth/GuestGate';
import { MessagesScreen } from '@/features/messages/MessagesScreen';
import { useClaimedDealerShop } from '@/features/seller-hub/claimedShop';
import { SellerHubScreen } from '@/features/seller-hub/SellerHubScreen';
import { useSession } from '@/providers/session';

function oneParam(value: string | string[] | undefined): string | null {
  if (!value) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  return raw.length > 0 ? raw : null;
}

export { TabErrorBoundary as ErrorBoundary } from '@/components/ErrorState';

export default function Messages() {
  const { userId, isSignedIn } = useSession();
  const { shop, ready } = useClaimedDealerShop();
  const params = useLocalSearchParams<{ conversationId?: string; listingId?: string }>();
  const conversationId = oneParam(params.conversationId);
  const listingId = oneParam(params.listingId);

  if (!isSignedIn) {
    return (
      <GuestGate
        title="Messages"
        message="Sign in to write dealers and keep your conversations."
      />
    );
  }

  if (ready && shop) {
    return (
      <SellerHubScreen
        shop={shop}
        conversationId={conversationId}
        listingId={listingId}
      />
    );
  }

  return (
    <MessagesScreen
      userId={userId!}
      conversationId={conversationId}
      listingId={listingId}
    />
  );
}
