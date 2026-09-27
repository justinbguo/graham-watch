import type { Href } from 'expo-router';

import { useOpenStack } from '@/lib/openStack';

import type { Surface } from './provider';

const HREF: Record<Surface, Href> = {
  deck: '/filters/deck',
  search: '/filters/search',
};

/** The filter sheet is a screen on the stack above the tabs. */
export function useOpenFilters() {
  const open = useOpenStack();

  return (surface: Surface) => open('filters/[surface]', { surface }, HREF[surface]);
}
