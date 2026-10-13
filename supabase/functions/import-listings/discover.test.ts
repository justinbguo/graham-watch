import { assertEquals } from 'jsr:@std/assert@1';

import { declaredIcon, descriptionIn, instagramIn } from './discover.ts';

/* ------------------------------------------------------------- description */

Deno.test('reads the meta description', () => {
  assertEquals(
    descriptionIn(
      `<meta name="description" content="Craft + Tailored is a recognized world leading expert and destination for classic vintage Rolex.">`
    ),
    'Craft + Tailored is a recognized world leading expert and destination for classic vintage Rolex.'
  );
});

Deno.test('reads a meta tag whose content comes before its name', () => {
  assertEquals(
    descriptionIn(
      `<meta content="We specialise in the trade of the worlds finest watches from Rolex and Patek." name="description">`
    ),
    'We specialise in the trade of the worlds finest watches from Rolex and Patek.'
  );
});

Deno.test('falls back to og:description', () => {
  assertEquals(
    descriptionIn(
      `<meta property="og:description" content="Rare and distinctive vintage wristwatches and their affinities.">`
    ),
    'Rare and distinctive vintage wristwatches and their affinities.'
  );
});

Deno.test('decodes entities and collapses the whitespace of a wrapped tag', () => {
  assertEquals(
    descriptionIn(
      `<meta name="description" content="Vintage Rolex, Patek Philippe &amp;\n   Audemars Piguet, bought and sold since forever.">`
    ),
    'Vintage Rolex, Patek Philippe & Audemars Piguet, bought and sold since forever.'
  );
});

// A blank is better than a label. "Watches" under a shop's name reads as a
// description the shop wrote, and it is really the page's <title>.
Deno.test('refuses a description too short to be a sentence about a business', () => {
  assertEquals(descriptionIn(`<meta name="description" content="Watches">`), null);
  assertEquals(descriptionIn(`<meta name="description" content="Home page">`), null);
  assertEquals(descriptionIn(`<meta name="description" content="">`), null);
  assertEquals(descriptionIn('<html><body>no meta at all</body></html>'), null);
});

// Watch Steez really do describe themselves in 35 characters. A floor set to
// reject page labels must not reject a short shop.
Deno.test('keeps a short but real description', () => {
  assertEquals(
    descriptionIn(`<meta name="description" content="rare and affordable vintage watches">`),
    'rare and affordable vintage watches'
  );
});

Deno.test('truncates an overlong description on a character, not a byte', () => {
  const long = `<meta name="description" content="${'watches and clocks '.repeat(40)}">`;
  const text = descriptionIn(long)!;

  assertEquals(text.length <= 400, true);
  assertEquals(text.endsWith('…'), true);
});

/* --------------------------------------------------------------- instagram */

Deno.test('finds a handle from a profile link', () => {
  assertEquals(
    instagramIn(`<a href="https://www.instagram.com/craftandtailored/">Instagram</a>`),
    'craftandtailored'
  );
});

Deno.test('accepts a protocol-relative link', () => {
  assertEquals(instagramIn(`<a href="//instagram.com/analogshift">IG</a>`), 'analogshift');
});

// The trap this exists for: a share button on every product page would
// otherwise make every shop on the platform @p.
Deno.test('ignores share widgets and Instagram own sections', () => {
  assertEquals(
    instagramIn(`<a href="https://instagram.com/p/CxYz123/">share this watch</a>`),
    null
  );
  assertEquals(instagramIn(`<a href="https://www.instagram.com/explore/tags/rolex">#rolex</a>`), null);
  assertEquals(instagramIn(`<a href="https://instagram.com/accounts/login">log in</a>`), null);
});

Deno.test('takes the real handle when a share link appears first', () => {
  assertEquals(
    instagramIn(`
      <a href="https://instagram.com/p/CxYz123/">share</a>
      <a href="https://www.instagram.com/wind.vintage">follow us</a>
    `),
    'wind.vintage'
  );
});

Deno.test('drops a trailing dot left by a sentence', () => {
  assertEquals(instagramIn(`Follow https://instagram.com/watchsteez.`), 'watchsteez');
});

/* -------------------------------------------------------------------- icon */

Deno.test('prefers apple-touch-icon over a 16px shortcut icon', () => {
  assertEquals(
    declaredIcon(
      `<link rel="shortcut icon" href="/favicon-16.png" sizes="16x16">
       <link rel="apple-touch-icon" href="/apple-touch-icon.png">`,
      'https://shop.com'
    ),
    'https://shop.com/apple-touch-icon.png'
  );
});

Deno.test('prefers the largest declared size when none is an apple icon', () => {
  assertEquals(
    declaredIcon(
      `<link rel="icon" href="/small.png" sizes="32x32">
       <link rel="icon" href="/big.png" sizes="192x192">`,
      'https://shop.com'
    ),
    'https://shop.com/big.png'
  );
});

Deno.test('resolves a protocol-relative CDN href', () => {
  assertEquals(
    declaredIcon(
      `<link rel="icon" href="//cdn.shopify.com/s/files/1/icon.png?v=2">`,
      'https://shop.com'
    ),
    'https://cdn.shopify.com/s/files/1/icon.png?v=2'
  );
});

Deno.test('decodes an href built by a template', () => {
  assertEquals(
    declaredIcon(
      `<link rel="icon" href="/cdn/shop/files/icon.png?v=1&amp;width=180">`,
      'https://shop.com'
    ),
    'https://shop.com/cdn/shop/files/icon.png?v=1&width=180'
  );
});

// The phone refuses plain http under App Transport Security, so an http icon
// is a blank frame rather than a mark.
Deno.test('refuses a non-https or private icon', () => {
  assertEquals(declaredIcon(`<link rel="icon" href="http://shop.com/i.png">`, 'http://shop.com'), null);
  assertEquals(
    declaredIcon(`<link rel="icon" href="https://localhost/i.png">`, 'https://shop.com'),
    null
  );
});

Deno.test('skips an inline data icon and takes the next', () => {
  assertEquals(
    declaredIcon(
      `<link rel="icon" href="data:image/png;base64,iVBORw0KGgo=">
       <link rel="apple-touch-icon" href="/mark.png">`,
      'https://shop.com'
    ),
    'https://shop.com/mark.png'
  );
});

Deno.test('finds nothing when the page declares no icon', () => {
  assertEquals(declaredIcon('<html><head><title>Shop</title></head></html>', 'https://shop.com'), null);
});
