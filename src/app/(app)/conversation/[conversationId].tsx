import { useLocalSearchParams } from 'expo-router';

import { ConversationScreen } from '@/features/messages/ConversationScreen';

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ErrorState';

export default function ConversationRoute() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  if (!conversationId) return null;
  return <ConversationScreen conversationId={conversationId} />;
}
