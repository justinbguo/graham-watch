import { useQuery } from '@tanstack/react-query';

import { useDealerShop } from '@/data/dealers';
import { keys } from '@/data/keys';
import { fetchCounts } from '@/data/listings';
import { useNewListings } from '@/data/newListings';
import { useSearchCount } from '@/data/search';

import { matchesListing } from './match';
import { useFilters, type Surface } from './provider';

/** Live match count for the filter sheet footer and summary. */
export function useFilterMatchCount(surface: Surface, dealerId?: string) {
  const api = useFilters(surface, dealerId);
  const search = useSearchCount(api.filters);
  const shop = useDealerShop(surface === 'shop' ? (dealerId ?? '') : '');

  const deck = useQuery({
    queryKey: keys.filterMatch(api.filters),
    enabled: surface === 'deck',
    queryFn: () => fetchCounts(api.filters).then((row) => row.matched),
    placeholderData: (previous) => previous,
  });
  const newest = useNewListings({ enabled: surface === 'new', pageAll: surface === 'new' });

  if (surface === 'search') return search.data;
  if (surface === 'deck') return deck.data;
  if (surface === 'new') {
    if (newest.state === 'none') return 0;
    if (newest.state !== 'ready' || newest.hasNextPage) return undefined;
    return newest.cards.filter((card) => matchesListing(card, api.filters)).length;
  }
  if (surface === 'shop') {
    const listings = shop.data?.listings ?? [];
    return listings.filter((card) => matchesListing(card, api.filters)).length;
  }
  return undefined;
}
