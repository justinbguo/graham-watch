import { useSaved } from '@/data/listings';
import { useSession } from '@/providers/session';

/**
 * How many watches are filed away, for the count on the Saved tab. It lives
 * here rather than in the tabs layout so the layout calls one hook and knows
 * nothing about sessions or queries.
 *
 * It reads the same cached list the Saved screen renders, so the number and
 * the screen behind it can never disagree, and a save updates both at once.
 */
export function useSavedCount(): number {
  const { userId } = useSession();
  const { data } = useSaved(userId);
  return data?.length ?? 0;
}
