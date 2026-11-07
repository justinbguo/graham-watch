import { countsCacheKey, deckCacheKey, facetsQueryKey, filterCacheToken } from '@/features/filters/spec';

import { DECK_FAVORITES_FIRST, DECK_SORT, type DeckSort } from './deckPaging';

/**
 * Every cached query is identified by one of these keys. Keeping them in one
 * place is what makes invalidation safe — a mutation can look up exactly which
 * caches it invalidates instead of guessing at a string.
 */
export const keys = {
  // The deck is cached per filter, sort, and favorites-first setting. Changing
  // any of them is a different deck, not a stale cursor. The second entry is
  // the FilterSpec token — sorted, deduped, defaults omitted — so
  // Rolex-then-Tudor and a blank query share a pile with Tudor-then-Rolex.
  // Counts stay on that token alone; they do not change with the sort.
  deck: (
    filters: unknown = null,
    sort: DeckSort = DECK_SORT,
    favoritesFirst: boolean = DECK_FAVORITES_FIRST,
  ) => deckCacheKey(filters, sort, favoritesFirst),
  search: (filters: unknown) => ['search', filterCacheToken(filters)] as const,
  // Two numbers about the same filter set the deck is keyed on, but a separate
  // key: the deck is frozen while it is being swiped and these are not.
  counts: (filters: unknown) => countsCacheKey(filters),
  // Same function as the deck's counts, asked the way Search is: include the
  // caller's own imports, and do not drop watches they have already swiped.
  searchCount: (filters: unknown) => ['listing-counts', 'search', filterCacheToken(filters)] as const,
  /** Prefix. Invalidation matches every `facetsQuery`, whatever the token is. */
  facets: ['facets'] as const,
  facetsQuery: (excludeOwn: boolean, filters: unknown = null, excludeSwiped = false) =>
    facetsQueryKey(excludeOwn, filters, excludeSwiped),
  /** Match count in the filter sheet. Same deck predicate as `counts`, own cache. */
  filterMatch: (filters: unknown) => ['filter-match', 'deck', filterCacheToken(filters)] as const,
  profile: (userId: string) => ['profile', userId] as const,
  /** Saved ship-to and payment stand-in for deal checkout. */
  checkoutDefaults: (userId: string) => ['checkout-defaults', userId] as const,
  saved: (userId: string) => ['saved', userId] as const,
  passes: (userId: string) => ['passes', userId] as const,
  listing: (listingId: string) => ['listing', listingId] as const,
  inquiries: (userId: string) => ['inquiries', userId] as const,
  dealerAccounts: (userId: string) => ['dealer-accounts', userId] as const,
  myApplication: (userId: string) => ['my-application', userId] as const,
  claimableDealer: (website: string) => ['claimable-dealer', website] as const,
  dealerInventory: (dealerId: string) => ['dealer-inventory', dealerId] as const,
  dealerTopCustomers: (dealerId: string) => ['dealer-top-customers', dealerId] as const,
  dealerCatalog: (dealerId: string) => ['dealer-catalog', dealerId] as const,
  dealerReputation: (dealerId: string) => ['dealer-reputation', dealerId] as const,
  follows: (userId: string) => ['follows', userId] as const,
  /** Every approved shop, for the community follow list. Not per user. */
  dealerDirectory: ['dealer-directory'] as const,
  /** Unseen new watches per followed shop. */
  dropCounts: (userId: string) => ['drop-counts', userId] as const,
  dropFeed: (userId: string) => ['drop-feed', userId] as const,
  dealerShop: (dealerId: string) => ['dealer-shop', dealerId] as const,
  /** One live watch for emailing an unclaimed shop when the thread names none yet. */
  dealerInquiryListing: (dealerId: string) => ['dealer-inquiry-listing', dealerId] as const,
  dealerPreview: (dealerId: string) => ['dealer-preview', dealerId] as const,
  exchange: ['exchange'] as const,
  exchangePost: (postId: string) => ['exchange-post', postId] as const,
  collectorPosts: (userId: string) => ['collector-posts', userId] as const,
  collectorProfile: (userId: string) => ['collector-profile', userId] as const,
  conversations: ['conversations'] as const,
  /** Conversation ids whose messages contain this text. */
  messageSearch: (query: string) => ['message-search', query] as const,
  /** People whose username or name starts with this text. */
  people: (query: string) => ['people', query] as const,
  watchCatalog: (query: string, brand: string) => ['watch-catalog', query, brand] as const,
  /** Listing ids the buyer has already named in a message. */
  discussed: ['discussed-listings'] as const,
  conversation: (conversationId: string) => ['conversation', conversationId] as const,
  sourcing: ['sourcing'] as const,
  sourcingRequest: (requestId: string) => ['sourcing-request', requestId] as const,
  subscription: () => ['subscription'] as const,
  customerInfo: () => ['customer-info'] as const,
  offerings: () => ['offerings'] as const,
};
