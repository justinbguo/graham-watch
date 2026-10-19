import { router } from 'expo-router';

import { MessagesScreen } from '@/features/messages/MessagesScreen';
import { useSession } from '@/providers/session';

export default function SellerMessagesRoute() {
  const { userId, isSignedIn } = useSession();

  if (!isSignedIn || !userId) {
    router.back();
    return null;
  }

  return (
    <MessagesScreen
      userId={userId}
      back={{ label: 'Your Shop', onPress: () => router.back() }}
    />
  );
}
