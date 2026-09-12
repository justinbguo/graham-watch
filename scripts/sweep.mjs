/**
 * Retire listings the dealer has since sold.
 *
 *   npm run sweep -- https://www.craftandtailored.com
 *   npm run sweep                                        (every approved dealer)
 *
 * An import only ever adds. Without this the deck keeps offering watches that
 * sold months ago, and the first a buyer hears of it is the dealer's reply.
 * Cheap enough to run daily: one feed read per shop, no extraction.
 */

import { runSweep } from './_import.mjs';
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

for (const url of urls) {
  try {
    const result = await runSweep({ sourceUrl: url, token: operator.token });
    retired += result.sold;
    console.log(`${url}\n  checked ${result.checked}, retired ${result.sold}`);
  } catch (error) {
    console.log(`${url}\n  skipped: ${error.message}`);
  }
}

console.log(`\n${retired} listing(s) retired.`);
