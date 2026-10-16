import { useLocalSearchParams } from 'expo-router';

import { ConversationScreen } from '@/features/messages/ConversationScreen';

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ErrorState';

export default function ConversationRoute() {
  const { conversationId, listingId } = useLocalSearchParams<{
    conversationId: string;
    listingId?: string;
  }>();
  if (!conversationId) return null;
  return (
    <ConversationScreen
      key={`${conversationId}:${listingId ?? ''}`}
      conversationId={conversationId}
      listingId={listingId || null}
    />
  );
}
