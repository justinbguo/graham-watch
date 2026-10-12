import { useSaved } from '@/data/listings';
import { useListingThreads } from '@/data/messages';
import { useSession } from '@/providers/session';

/**
 * How many saved watches are still waiting for a first message, for the count
 * on the Wishlist tab. A watch already in a thread is not waiting, and neither
 * is one that can no longer be written about.
 *
 * It reads the same cached list and threads the wishlist screen renders, so
 * the number and the glowing marks behind it can never disagree.
 */
export function useSavedCount(): number {
  const { userId } = useSession();
  const { data } = useSaved(userId);
  const threads = useListingThreads(userId);
  if (!data || threads.isPending) return 0;

  const spoken = threads.data ?? {};
  return data.filter((card) => !spoken[card.id] && !card.sold_at && card.dealer).length;
}
