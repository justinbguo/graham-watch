import type { Href } from 'expo-router';

import { useOpenStack } from '@/lib/openStack';

import type { Surface } from './provider';

const HREF: Record<'deck' | 'search', Href> = {
  deck: '/filters/deck',
  search: '/filters/search',
};

/** The filter sheet is a screen on the stack above the tabs. */
export function useOpenFilters() {
  const open = useOpenStack();

  return (surface: Surface, dealerId?: string) => {
    if (surface === 'shop' && dealerId) {
      open(
        'filters/[surface]',
        { surface: 'shop', dealerId },
        `/filters/shop?dealerId=${encodeURIComponent(dealerId)}` as Href,
      );
      return;
    }
    const target = surface === 'search' ? 'search' : 'deck';
    open('filters/[surface]', { surface: target }, HREF[target]);
  };
}
