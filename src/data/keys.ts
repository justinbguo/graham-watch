/**
 * Every cached query is identified by one of these keys. Keeping them in one
 * place is what makes invalidation safe — a mutation can look up exactly which
 * caches it invalidates instead of guessing at a string.
 */
export const keys = {
  // The deck is cached per filter set: changing a filter is a different deck,
  // not a stale one.
  deck: (filters: unknown = null) => ['deck', filters] as const,
  search: (filters: unknown) => ['search', filters] as const,
  facets: ['facets'] as const,
  saved: (userId: string) => ['saved', userId] as const,
  listing: (listingId: string) => ['listing', listingId] as const,
  inquiries: (userId: string) => ['inquiries', userId] as const,
};
