import { assertEquals } from 'jsr:@std/assert@1';

import { mapProduct } from './shopify.ts';

const ORIGIN = 'https://shop.com';

function product(fields: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: 'Rolex Explorer 1016',
    handle: 'rolex-explorer-1016',
    vendor: 'Rolex',
    images: [{ src: 'https://cdn.shop.com/1.jpg' }],
    variants: [{ available: true, price: '19950.00', sku: 'CC-1016' }],
    ...fields,
  };
}

function kept(fields: Record<string, unknown> = {}) {
  const mapped = mapProduct(product(fields), ORIGIN, 'USD');
  return 'item' in mapped ? mapped.item : null;
}

function refused(fields: Record<string, unknown> = {}) {
  const mapped = mapProduct(product(fields), ORIGIN, 'USD');
  return 'skipped' in mapped ? mapped.skipped : null;
}

/* --------------------------------------------------------- product_type */

// The regression this exists for. Collectors Corner NY type their watches
// DRESS, SPORT, DIVER and MILITARY/FIELD. A filter demanding the word "watch"
// kept 3 of their 87 available watches and dropped the other 84 in silence.
Deno.test('keeps a watch typed with the shop own taxonomy', () => {
  for (const type of ['DRESS', 'SPORT', 'DIVER', 'MILITARY/FIELD', 'PILOTS', 'FUNKY/RETRO']) {
    assertEquals(kept({ product_type: type })?.title, 'Rolex Explorer 1016', type);
  }
});

Deno.test('keeps an untyped product, because a blank field states nothing', () => {
  assertEquals(kept({ product_type: '' })?.title, 'Rolex Explorer 1016');
  assertEquals(kept({ product_type: null })?.title, 'Rolex Explorer 1016');
});

Deno.test('refuses what the shop itself says is not a watch', () => {
  assertEquals(refused({ product_type: 'Straps' })?.reason, 'product type "Straps" is not a watch');
  assertEquals(refused({ product_type: 'SIGN' }) !== null, true);
  assertEquals(refused({ product_type: 'Sunglasses' }) !== null, true);
});

// The word "watch" earns a type nothing. These are the three most common
// non-watch types a watch dealer has, and all three contain it.
Deno.test('refuses a watch strap, a watch box and a watch winder', () => {
  assertEquals(refused({ product_type: 'Watch Straps' }) !== null, true);
  assertEquals(refused({ product_type: 'Watch Boxes' }) !== null, true);
  assertEquals(refused({ product_type: 'Watch Winder' }) !== null, true);
});

// "Signature" is not "sign", and "showcase" is not "case".
Deno.test('matches a whole word, not a prefix of one', () => {
  assertEquals(kept({ product_type: 'Signature Pieces' })?.title, 'Rolex Explorer 1016');
  assertEquals(kept({ product_type: 'Showcase' })?.title, 'Rolex Explorer 1016');
});

/* ------------------------------------------------------------- discards */

Deno.test('a discard carries the shop fields, so the operator sees why', () => {
  const skipped = refused({ product_type: 'Straps', vendor: 'Hirsch' });

  assertEquals(skipped?.sourceUrl, 'https://shop.com/products/rolex-explorer-1016');
  assertEquals(skipped?.meta?.vendor, 'Hirsch');
  assertEquals(skipped?.meta?.productType, 'Straps');
  assertEquals(skipped?.meta?.photoCount, 1);
});

Deno.test('a product with no photograph is refused rather than dropped', () => {
  assertEquals(refused({ images: [] })?.reason, 'no photograph');
});

/* ---------------------------------------------------------------- stock */

// Sold watches stay in the catalogue. They are what a dealer page is mostly
// made of, and retiring them is how the deck learns a watch is gone.
Deno.test('keeps a sold watch and marks it unavailable', () => {
  const item = kept({ variants: [{ available: false, price: '19950.00' }] });

  assertEquals(item?.available, false);
  assertEquals(item?.priceCents, 1_995_000);
});

Deno.test('reads stock as available when the shop states nothing', () => {
  assertEquals(kept({ variants: [{ price: '19950.00' }] })?.available, true);
});

Deno.test('carries the SKU and the brand through as metadata', () => {
  const item = kept({ product_type: 'DRESS', published_at: '2024-03-11T00:00:00-04:00' });

  assertEquals(item?.meta?.sku, 'CC-1016');
  assertEquals(item?.meta?.vendor, 'Rolex');
  assertEquals(item?.meta?.productType, 'DRESS');
  assertEquals(item?.meta?.publishedAt, '2024-03-11T00:00:00-04:00');
});
