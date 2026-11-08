import { assertEquals } from 'jsr:@std/assert@1';

import { newDealerRow } from './live.ts';

Deno.test('a new bot shop stores the enriched logo', () => {
  assertEquals(
    newDealerRow({
      name: 'Cool Vintage Watches',
      website: 'https://coolvintagewatches.com',
      email: null,
      logoUrl: 'https://images.squarespace-cdn.com/content/v1/shop/clogo22.png',
    }),
    {
      name: 'Cool Vintage Watches',
      website: 'https://coolvintagewatches.com',
      contact_email: null,
      logo_url: 'https://images.squarespace-cdn.com/content/v1/shop/clogo22.png',
      permission: 'pending',
      created_by: null,
    },
  );
});
