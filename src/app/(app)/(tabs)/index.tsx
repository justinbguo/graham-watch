import { CatalogueDeck } from '@/features/deck/CatalogueDeck';

// Claimed here rather than left to the layout so the tab bar stays mounted: a
// deck that cannot draw should not also strand the user away from the wishlist.
export { TabErrorBoundary as ErrorBoundary } from '@/components/ErrorState';

export default function Deck() {
  return <CatalogueDeck source="buy" />;
}
