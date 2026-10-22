import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { ConversationScreen } from '@/features/messages/ConversationScreen';
import { useIsDesktopWeb } from '@/lib/layout';

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ErrorState';

function oneParam(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] : value;
}

export default function ConversationRoute() {
  const isDesktopWeb = useIsDesktopWeb();
  const params = useLocalSearchParams<{
    conversationId: string;
    listingId?: string | string[];
  }>();
  const conversationId = oneParam(params.conversationId);
  const listingId = oneParam(params.listingId);

  useEffect(() => {
    if (!isDesktopWeb || !conversationId) return;
    router.replace({
      pathname: '/messages',
      params: {
        conversationId,
        ...(listingId ? { listingId } : {}),
      },
    });
  }, [conversationId, isDesktopWeb, listingId]);

  if (!conversationId) return null;
  if (isDesktopWeb) return null;

  return (
    <ConversationScreen
      key={`${conversationId}:${listingId ?? ''}`}
      conversationId={conversationId}
      listingId={listingId}
    />
  );
}
