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
  // Two numbers about the same filter set the deck is keyed on, but a separate
  // key: the deck is frozen while it is being swiped and these are not.
  counts: (filters: unknown) => ['listing-counts', filters] as const,
  // Same function as the deck's counts, asked the way Search is: include the
  // caller's own imports, and do not drop watches they have already swiped.
  searchCount: (filters: unknown) => ['listing-counts', 'search', filters] as const,
  facets: ['facets'] as const,
  profile: (userId: string) => ['profile', userId] as const,
  saved: (userId: string) => ['saved', userId] as const,
  passes: (userId: string) => ['passes', userId] as const,
  listing: (listingId: string) => ['listing', listingId] as const,
  inquiries: (userId: string) => ['inquiries', userId] as const,
  dealerAccounts: (userId: string) => ['dealer-accounts', userId] as const,
  myApplication: (userId: string) => ['my-application', userId] as const,
  claimableDealer: (website: string) => ['claimable-dealer', website] as const,
  dealerInventory: (dealerId: string) => ['dealer-inventory', dealerId] as const,
  dealerCatalog: (dealerId: string) => ['dealer-catalog', dealerId] as const,
  dealerReputation: (dealerId: string) => ['dealer-reputation', dealerId] as const,
  follows: (userId: string) => ['follows', userId] as const,
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
