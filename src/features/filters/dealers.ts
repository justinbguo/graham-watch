export type FacetKind = { kind: string };

/** The label when no real shop name is known. Never a shop id. */
export const DEALER_NAME_PLACEHOLDER = 'Dealer';

/**
 * The name a buyer can read for a selected shop.
 * A blank, or a name that is the id itself, is not a name.
 */
export function dealerDisplayName(
  id: string,
  known: readonly { id: string; name: string | null | undefined }[],
): string | null {
  for (const row of known) {
    if (row.id !== id) continue;
    const name = row.name?.trim();
    if (name && name !== id) return name;
  }
  return null;
}

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
  surface: 'deck' | 'search' | 'shop' | 'new',
): T[] {
  if (surface === 'shop') return [];
  return facets.filter((facet) => facet.kind === 'dealer');
}
