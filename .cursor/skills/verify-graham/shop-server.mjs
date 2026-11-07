/**
 * A one-watch Shopify catalogue plus the chat-completion shape publish expects.
 *
 * The edge runtime reaches this container by name. Hosted import still calls
 * the shop's own feed and api.openai.com. This stand-in exists so a local
 * proof can run that same path without a fixture body.
 */

import { createServer } from 'node:http';

const PHOTO_URL =
  'https://images.squarespace-cdn.com/content/v1/64d53a504f5aee6d2b32ee14/19e5672c-8f2f-4bc3-ac40-a2c141dc78c7/B0004038.jpg?format=750w';

const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGf/9k=',
  'base64',
);

let photo = TINY_JPEG;

try {
  const response = await fetch(PHOTO_URL, { signal: AbortSignal.timeout(8000) });
  if (response.ok) {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 100 && bytes.length < 2_000_000) photo = bytes;
  }
} catch {
  photo = TINY_JPEG;
}

const listing = {
  brand: 'Catalog Proof',
  model: 'Live Door',
  reference: 'CAT-1',
  year: 1968,
  caliber: null,
  winding: 'manual',
  case_size_mm: 36,
  case_material: 'yellow_gold',
  dial_color: 'black',
  style: 'dress',
  complications: [],
  condition: null,
  has_box: null,
  has_papers: null,
  price_cents: 100000,
  currency: 'USD',
  description: 'A proof watch published through the catalogue path.',
};

const products = {
  products: [
    {
      id: 9001,
      title: 'Live Door',
      handle: 'live-door',
      vendor: 'Catalog Proof',
      product_type: 'Watch',
      body_html: '<p>A 1968 proof watch with three photographs.</p>',
      published_at: '2026-11-07T00:00:00Z',
      variants: [{ price: '1000.00', available: true, sku: 'CAT-1' }],
      images: [1, 2, 3].map((position) => ({
        src: `http://graham-catalog-shop:8799/photos/${position}.jpg`,
      })),
    },
  ],
};

function send(response, status, type, body) {
  response.writeHead(status, { 'content-type': type });
  response.end(body);
}

createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://graham-catalog-shop:8799');
  if (url.pathname === '/robots.txt') {
    send(response, 200, 'text/plain', 'User-agent: *\nAllow: /\n');
    return;
  }
  if (url.pathname === '/products.json') {
    send(response, 200, 'application/json', JSON.stringify(products));
    return;
  }
  if (url.pathname === '/meta.json') {
    send(response, 200, 'application/json', JSON.stringify({ currency: 'USD', name: 'Catalog Proof' }));
    return;
  }
  if (url.pathname.startsWith('/photos/')) {
    send(response, 200, 'image/jpeg', photo);
    return;
  }
  if (url.pathname === '/v1/chat/completions' && request.method === 'POST') {
    send(
      response,
      200,
      'application/json',
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(listing) } }] }),
    );
    return;
  }
  send(response, 404, 'text/plain', 'missing');
}).listen(8799);
