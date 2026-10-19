import type { DealerInventoryItem } from '@/data/dealers';
import { formatTitle } from '@/lib/format';

export type ListingInventoryFilter = 'all' | 'live' | 'hidden' | 'sold';

export function filterDealerInventory(
  items: DealerInventoryItem[],
  status: ListingInventoryFilter,
  query: string,
): DealerInventoryItem[] {
  const term = query.trim().toLowerCase();
  return items.filter((item) => matchesStatus(item, status) && matchesQuery(item, term));
}

function matchesStatus(item: DealerInventoryItem, status: ListingInventoryFilter) {
  if (status === 'hidden') return item.status === 'hidden';
  if (status === 'sold') return Boolean(item.sold_at);
  if (status === 'live') return item.status === 'active' && !item.sold_at;
  return true;
}

function matchesQuery(item: DealerInventoryItem, term: string) {
  if (!term) return true;
  const haystack = [
    formatTitle(item),
    item.brand,
    item.model,
    item.reference,
    item.year?.toString(),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(term);
}
