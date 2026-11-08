import { assertEquals } from 'jsr:@std/assert@1';

import { squarespacePhotoUrls, squarespacePrice } from './squarespace.ts';

Deno.test('falls back to the available variant when the product price is zero', () => {
  assertEquals(
    squarespacePrice({
      structuredContent: {
        priceMoney: { currency: 'USD', value: '0.00' },
        variants: [
          {
            priceMoney: { currency: 'USD', value: '19950.00' },
            qtyInStock: 1,
          },
        ],
      },
    }),
    { priceCents: 1_995_000, currency: 'USD' }
  );
});

Deno.test('keeps a positive product price ahead of its variants', () => {
  assertEquals(
    squarespacePrice({
      structuredContent: {
        priceMoney: { currency: 'USD', value: '12500.00' },
        variants: [
          {
            priceMoney: { currency: 'USD', value: '13000.00' },
            qtyInStock: 1,
          },
        ],
      },
    }),
    { priceCents: 1_250_000, currency: 'USD' }
  );
});

const JEFFREY_GALLERY =
  'https://images.squarespace-cdn.com/content/v1/55e87a4ae4b0ef4233ddf7a9/1692129454145-2QTCLO97B929YLUO3RO6/IMG_3516.jpg';
const BUCHERER_ROOT =
  'https://images.squarespace-cdn.com/content/v1/55e87a4ae4b0ef4233ddf7a9/1686326001830-NM4Y9D9JJWDGPSXI929T/IMG_0969.jpg';
const BUCHERER_GALLERY =
  'https://images.squarespace-cdn.com/content/v1/55e87a4ae4b0ef4233ddf7a9/1686238210652-T632ELQ4DM7VRXBI1HQF/IMG_0970.jpg';

Deno.test('Hamilton Jeffrey drops the extensionless root and keeps the gallery', () => {
  assertEquals(
    squarespacePhotoUrls({
      assetUrl:
        'https://static1.squarespace.com/static/55e87a4ae4b0ef4233ddf7a9/55f19b7ce4b0d3922cc55308/64dbd85cadd6f456177582d3/1762439973819/',
      items: [{ assetUrl: JEFFREY_GALLERY }],
    }),
    [`${JEFFREY_GALLERY}?format=1500w`],
  );
});

Deno.test('a real Bucherer root follows the gallery and a duplicate root is kept once', () => {
  assertEquals(
    squarespacePhotoUrls({
      assetUrl: BUCHERER_ROOT,
      items: [{ assetUrl: BUCHERER_GALLERY }],
    }),
    [`${BUCHERER_GALLERY}?format=1500w`, `${BUCHERER_ROOT}?format=1500w`],
  );
  assertEquals(
    squarespacePhotoUrls({
      assetUrl: BUCHERER_GALLERY,
      items: [{ assetUrl: BUCHERER_GALLERY }],
    }),
    [`${BUCHERER_GALLERY}?format=1500w`],
  );
});

Deno.test('uses the sale price Squarespace displays', () => {
  assertEquals(
    squarespacePrice({
      structuredContent: {
        priceMoney: { currency: 'USD', value: '0.00' },
        variants: [
          {
            priceMoney: { currency: 'USD', value: '13000.00' },
            salePriceMoney: { currency: 'USD', value: '11950.00' },
            onSale: true,
            qtyInStock: 1,
          },
        ],
      },
    }),
    { priceCents: 1_195_000, currency: 'USD' }
  );
});
