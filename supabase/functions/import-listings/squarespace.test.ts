import { assertEquals } from 'jsr:@std/assert@1';

import { squarespacePrice } from './squarespace.ts';

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
