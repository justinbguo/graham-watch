import { useLocalSearchParams } from 'expo-router';

import { ConversationScreen } from '@/features/messages/ConversationScreen';

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ErrorState';

function oneParam(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] : value;
}

export default function ConversationRoute() {
  const params = useLocalSearchParams<{
    conversationId: string;
    listingId?: string | string[];
  }>();
  const conversationId = oneParam(params.conversationId);
  const listingId = oneParam(params.listingId);
  if (!conversationId) return null;
  return (
    <ConversationScreen
      key={`${conversationId}:${listingId ?? ''}`}
      conversationId={conversationId}
      listingId={listingId}
    />
  );
}
