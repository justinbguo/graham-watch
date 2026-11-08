import { assertEquals } from 'jsr:@std/assert@1';

import { classifyCatalogueItem, type CatalogueFields, type HoldReason } from './nonwatch.ts';

function item(fields: Partial<CatalogueFields> & { title: string }): CatalogueFields {
  return {
    title: fields.title,
    text: fields.text ?? '',
    productType: fields.productType ?? null,
    tags: fields.tags ?? [],
    vendor: fields.vendor ?? null,
  };
}

function reason(fields: CatalogueFields): HoldReason | 'watch' {
  const decision = classifyCatalogueItem(fields);
  return decision.decision === 'hold' ? decision.reason : 'watch';
}

const JUNK: Array<{ reason: HoldReason; fields: CatalogueFields }> = [
  {
    reason: 'strap',
    fields: item({
      title: 'Rolex Oyster Bracelet - 20mm Two Tone.',
      productType: 'Watches',
      text: 'Jubilee-style replacement bracelet.',
    }),
  },
  {
    reason: 'strap',
    fields: item({
      title: 'Rolex Jubilee Bracelet 20mm',
      text: 'Loose bracelet for other Datejust references.',
    }),
  },
  {
    reason: 'strap',
    fields: item({
      title: 'Rolex President Bracelet 19mm',
      text: 'End links sold as a bracelet only.',
    }),
  },
  {
    reason: 'strap',
    fields: item({
      title: 'Black Shell Cordovan Strap',
      vendor: 'WIS STRAPS',
      productType: null,
    }),
  },
  {
    reason: 'strap',
    fields: item({
      title: 'The Tumbleweed',
      productType: '',
      text: 'Handmade leather strap. Lug length 115/75mm.',
    }),
  },
  {
    reason: 'strap',
    fields: item({ title: 'Black Saffiano Watch Strap', productType: null }),
  },
  {
    reason: 'strap',
    fields: item({ title: 'Rolex Explorer 1016', productType: 'Straps' }),
  },
  {
    reason: 'strap',
    fields: item({ title: 'Cap', productType: 'Nato' }),
  },
  {
    reason: 'strap',
    fields: item({ title: 'Cap', productType: 'Two Piece' }),
  },
  {
    reason: 'accessory',
    fields: item({ title: 'Exhibition Tray - Large', productType: null }),
  },
  {
    reason: 'accessory',
    fields: item({ title: 'Valet Tray', productType: 'Watch Tray' }),
  },
  {
    reason: 'accessory',
    fields: item({ title: 'Spring Bar Tool - Steel', productType: null }),
  },
  {
    reason: 'accessory',
    fields: item({ title: 'Bracelet Removal Tool', productType: null }),
  },
  {
    reason: 'accessory',
    fields: item({ title: 'Rolex Explorer 1016', productType: 'Watch Boxes' }),
  },
  {
    reason: 'accessory',
    fields: item({ title: 'Rolex Explorer 1016', productType: 'Watch Winder' }),
  },
  {
    reason: 'clock',
    fields: item({ title: 'Movado Travel Clock', productType: 'Watches' }),
  },
  {
    reason: 'clock',
    fields: item({ title: 'Cartier Clock Lighter', productType: null }),
  },
  {
    reason: 'clock',
    fields: item({ title: 'Accutron Spaceview Desk Clock', productType: null }),
  },
  {
    reason: 'clock',
    fields: item({
      title: 'Cartier Lapis Lazuli Minute Repeater Clock',
      productType: 'Vintage Watches',
      text: 'Complete with box and papers.',
    }),
  },
];

const WATCHES: CatalogueFields[] = [
  item({ title: 'Audemars Piguet Royal Oak 15202ST', text: 'On a bracelet.' }),
  item({ title: 'Audemars Piguet Royal Oak Jumbo 5402ST', text: 'Integrated bracelet.' }),
  item({
    title: 'Audemars Piguet Puzzle Bracelet 56059BA',
    text: 'The Puzzle Bracelet, reference 56059BA.',
  }),
  item({ title: 'Piaget Polo 861C701', text: 'Integrated bracelet in yellow gold.' }),
  item({ title: 'Aquadive Bathyscaphe 100 Box and Papers', vendor: 'Aquadive' }),
  item({
    title: 'Buben & Zorweg The One',
    text: 'A wristwatch. The maker also builds watch winders.',
    productType: 'Watch Winder',
  }),
  item({
    title: '1989 Rolex Datejust 16220',
    vendor: "Danny's Vintage Watches",
    text: 'On an oyster bracelet, with box and papers.',
    productType: 'Watches',
  }),
  item({ title: '2024 Omega Speedmaster', text: 'Current production. On bracelet.', productType: 'Modern' }),
  item({ title: 'Rolex Prince Pocket Watch', text: 'Silver pocket watch.' }),
  item({ title: 'Cartier Tank Art Deco', text: 'Wearable sculpture of a sort, with box and papers.' }),
  item({ title: 'Rolex Submariner 5513', tags: ['strap', 'bracelet'], text: 'Lug width 20mm.' }),
  item({ title: 'Heuer Autavia 1163', productType: 'DRESS', vendor: 'Heuer' }),
  item({ title: 'Rolex Explorer 1016', productType: '' }),
  item({ title: 'Rolex Explorer 1016', productType: 'Signature Pieces' }),
  item({ title: 'Rolex Explorer 1016', productType: 'Commercial' }),
  item({
    title: 'Rolex GMT-Master 1675',
    text: 'Priced at 400 dollars. The vendor is the shop.',
    vendor: 'Huntington Company',
  }),
  item({
    title: 'Audemars Piguet Royal Oak 15202ST',
    productType: 'Straps',
    text: 'On bracelet.',
  }),
];

Deno.test('holds the junk the shops actually listed', () => {
  const misses = JUNK.filter((example) => reason(example.fields) !== example.reason);
  assertEquals(
    misses.map((example) => `${example.fields.title} -> ${reason(example.fields)}`),
    []
  );
});

Deno.test('holds no real watch', () => {
  const held = WATCHES.filter((fields) => reason(fields) !== 'watch');
  assertEquals(
    held.map((fields) => fields.title),
    []
  );
  assertEquals(held.length, 0);
});

Deno.test('the same product decides the same way twice', () => {
  const fields = item({ title: 'Black Saffiano Watch Strap' });
  assertEquals(classifyCatalogueItem(fields), classifyCatalogueItem(fields));
});
