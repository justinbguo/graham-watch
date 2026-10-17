import { useQuery } from '@tanstack/react-query';

import { fetchCounts } from '@/data/listings';
import { useSearchCount } from '@/data/search';
import { useDealerShop } from '@/data/dealers';
import { matchesListing } from './match';
import { useFilters, type Surface } from './provider';

/** Live match count for the filter sheet footer and summary. */
export function useFilterMatchCount(surface: Surface, dealerId?: string) {
  const api = useFilters(surface, dealerId);
  const search = useSearchCount(api.filters);
  const shop = useDealerShop(surface === 'shop' ? (dealerId ?? '') : '');

  const deck = useQuery({
    queryKey: ['filter-match', 'deck', api.filters],
    enabled: surface === 'deck',
    queryFn: () => fetchCounts(api.filters).then((row) => row.matched),
    placeholderData: (previous) => previous,
  });

  if (surface === 'search') return search.data;
  if (surface === 'deck') return deck.data;
  if (surface === 'shop') {
    const listings = shop.data?.listings ?? [];
    return listings.filter((card) => matchesListing(card, api.filters)).length;
  }
  return undefined;
}
