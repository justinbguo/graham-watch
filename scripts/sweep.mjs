/**
 * Re-read every shop's catalogue (sync only). Prefer `npm run refresh` for the
 * nightly path: that syncs, retires sold watches, and auto-publishes.
 *
 *   npm run sweep -- https://www.craftandtailored.com
 *   npm run sweep                                        (every dealer)
 *
 * This is a catalogue read and nothing else: no model call, so it costs HTTP
 * and is cheap enough to run by hand. It retires watches the shop has sold and
 * records anything new without publishing it — a new watch still waits for
 * someone to tick it, or for `npm run refresh`.
 */

import { syncCatalog } from './_import.mjs';
import { request, signInOperator } from './_supabase.mjs';

const operator = await signInOperator();
const requested = process.argv.slice(2).find((arg) => arg.startsWith('http'));

async function shops() {
  if (requested) return [requested];

  const { body } = await request('/rest/v1/dealers?select=name,website&order=name', {
    token: operator.token,
  });
  return (body ?? []).map((dealer) => dealer.website).filter(Boolean);
}

const urls = await shops();
if (!urls.length) {
  console.error('No dealers to sweep. Pass a shop URL, or import one first.');
  process.exit(1);
}

let retired = 0;
let changed = 0;

for (const url of urls) {
  try {
    const result = await syncCatalog({ sourceUrl: url, token: operator.token });
    retired += result.retired;
    changed += result.changed;
    console.log(
      `${url}\n  read ${result.found}, ${result.changed} changed, ${result.retired} retired${
        result.complete ? '' : ', stopped at the read limit'
      }`
    );
  } catch (error) {
    console.log(`${url}\n  skipped: ${error.message}`);
  }
}

console.log(`\n${retired} listing(s) retired, ${changed} changed on their shop's site.`);
console.log('Changed watches update in the deck on the next publish:');
console.log('  npm run import -- <shop url>');
