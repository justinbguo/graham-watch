import type { DeckCard } from '@/lib/models';

export type ShopFacet = { kind: string; value: string; label: string; count: number };

function tally(
  cards: DeckCard[],
  kind: string,
  pick: (card: DeckCard) => { value: string; label: string } | null,
): ShopFacet[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const card of cards) {
    const item = pick(card);
    if (!item) continue;
    const row = counts.get(item.value);
    if (row) row.count += 1;
    else counts.set(item.value, { label: item.label, count: 1 });
  }
  return [...counts.entries()]
    .map(([value, row]) => ({ kind, value, label: row.label, count: row.count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * The filter rows for one shop, counted from the watches already on screen.
 * Same shape as `listing_facets`, without a dealer row: you are already
 * inside that shop, so a dealer choice can only return everything.
 */
export function facetsOf(cards: DeckCard[]): ShopFacet[] {
  const complications = new Map<string, number>();
  for (const card of cards) {
    for (const item of card.complications) {
      complications.set(item, (complications.get(item) ?? 0) + 1);
    }
  }

  return [
    ...tally(cards, 'brand', (card) =>
      card.brand_key ? { value: card.brand_key, label: card.brand } : null,
    ),
    ...tally(cards, 'style', (card) =>
      card.style ? { value: card.style, label: card.style } : null,
    ),
    ...tally(cards, 'case_material', (card) =>
      card.case_material ? { value: card.case_material, label: card.case_material } : null,
    ),
    ...tally(cards, 'winding', (card) =>
      card.winding ? { value: card.winding, label: card.winding } : null,
    ),
    ...[...complications.entries()]
      .map(([value, count]) => ({ kind: 'complication', value, label: value, count }))
      .sort((a, b) => b.count - a.count),
  ];
}
