import { router, type Href } from 'expo-router';

import { useIsDesktopWeb } from '@/lib/layout';
import { useOpenStack } from '@/lib/openStack';

type OpenParams = {
  conversationId: string;
  listingId?: string | null;
};

/**
 * On desktop web, threads open in the Messages split pane. On phone they stay
 * a full-screen sheet on the stack.
 */
export function useOpenConversation() {
  const isDesktopWeb = useIsDesktopWeb();
  const open = useOpenStack();

  return ({ conversationId, listingId }: OpenParams, options?: { replace?: boolean }) => {
    if (isDesktopWeb) {
      const go = options?.replace ? router.replace : router.navigate;
      go({
        pathname: '/messages',
        params: {
          conversationId,
          listingId: listingId ?? '',
        },
      });
      return;
    }

    const href = (
      listingId
        ? `/conversation/${conversationId}?listingId=${listingId}`
        : `/conversation/${conversationId}`
    ) as Href;
    if (options?.replace) {
      router.replace(href);
      return;
    }
    open(
      'conversation/[conversationId]',
      listingId ? { conversationId, listingId } : { conversationId },
      href,
    );
  };
}
