import assert from 'node:assert/strict';
import test from 'node:test';

import { LISTING_PHOTO_WIDTH, boundDealerPhoto } from '../src/data/photoUrl.ts';

test('a squarespace cover asks for the card width', () => {
  const url = boundDealerPhoto(
    'https://images.squarespace-cdn.com/content/v1/abc/photo.jpg?format=2500w',
  );
  assert.equal(
    url,
    `https://images.squarespace-cdn.com/content/v1/abc/photo.jpg?format=${LISTING_PHOTO_WIDTH}w`,
  );
});

test('a shopify cover asks for the card width', () => {
  const url = boundDealerPhoto('https://cdn.shopify.com/s/files/1/2/3/files/watch.jpg?v=1');
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('width'), String(LISTING_PHOTO_WIDTH));
  assert.equal(parsed.searchParams.get('v'), '1');
});

test('a shopify file on the shop domain asks for the card width', () => {
  const url = boundDealerPhoto('https://shop.example/cdn/shop/files/watch.jpg?v=9');
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('width'), String(LISTING_PHOTO_WIDTH));
  assert.equal(parsed.searchParams.get('v'), '9');
});

test('an unknown dealer file is left untouched', () => {
  const url = 'https://dealer.example/watches/original.jpg';
  assert.equal(boundDealerPhoto(url), url);
});
