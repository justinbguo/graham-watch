export type FacetKind = { kind: string };

/**
 * Shops the filter may offer.
 *
 * Deck and search pass through whatever `listing_facets_v2` returned. That
 * query already keeps a shop off the list unless it is approved and has a live
 * watch this person can see, so the panel does not invent a dealer the feed
 * cannot show. One shop is still listed: the row is how a buyer sees who is selling.
 * A shop page is already that one dealer, so it never offers the group.
 */
export function dealerChoices<T extends FacetKind>(
  facets: T[],
  surface: 'deck' | 'search' | 'shop',
): T[] {
  if (surface === 'shop') return [];
  return facets.filter((facet) => facet.kind === 'dealer');
}
