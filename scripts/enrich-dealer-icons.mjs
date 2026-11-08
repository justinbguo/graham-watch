/**
 * Prints the dealer icon rows a write would change.
 *
 * Dry run unless --write. --write refuses any host other than 127.0.0.1 or
 * localhost, including the hosted project. The same decision is the
 * operator-bot action enrich-icons, which also defaults to a dry run and does
 * not import listings.
 *
 *   node --experimental-strip-types scripts/enrich-dealer-icons.mjs
 *   node --experimental-strip-types scripts/enrich-dealer-icons.mjs --write
 */

import { register } from 'node:module';

import { headersForHost } from '../supabase/functions/_shared/outbound.mjs';
import { config, describeTarget } from './_supabase.mjs';

register(new URL('./ts-resolve-hook.mjs', import.meta.url));

const { chooseDealerIcon } = await import(
  new URL('../supabase/functions/import-listings/icons.ts', import.meta.url).href,
);

const HOSTED_REF = 'hbxgxtbtefpyutyqafoi';

function loopback(url) {
  try {
    const host = new URL(url).hostname;
    return (host === '127.0.0.1' || host === 'localhost') && !url.includes(HOSTED_REF);
  } catch {
    return false;
  }
}

async function dealers(url, key, from) {
  const response = await fetch(
    `${url}/rest/v1/dealers?select=id,name,website,logo_url&website=not.is.null&order=id.asc`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Range: `${from}-${from + 19}`,
      },
    },
  );
  if (!response.ok) {
    throw new Error(`Dealer read failed (${response.status}). ${await response.text()}`);
  }
  return response.json();
}

const write = process.argv.includes('--write');
const { url, serviceKey } = config();
if (!serviceKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing.');
}
if (write && !loopback(url)) {
  throw new Error(
    `Refusing to write dealer icons on ${describeTarget()}. --write accepts only 127.0.0.1 or localhost.`,
  );
}

const planned = [];
for (let from = 0; ; from += 20) {
  const shops = await dealers(url, serviceKey, from);
  for (const shop of shops) {
    let html = '';
    try {
      const page = await fetch(shop.website, {
        headers: headersForHost(shop.website, null, {}),
        signal: AbortSignal.timeout(20_000),
      });
      html = page.ok ? await page.text() : '';
    } catch {
      html = '';
    }
    const origin = new URL(shop.website).origin;
    const to = await chooseDealerIcon({ html, origin, currentUrl: shop.logo_url });
    if (!to || to === shop.logo_url) continue;
    planned.push({ dealerId: shop.id, name: shop.name, website: shop.website, from: shop.logo_url, to });
    if (!write) continue;
    const updated = await fetch(`${url}/rest/v1/dealers?id=eq.${shop.id}`, {
      method: 'PATCH',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ logo_url: to }),
    });
    if (!updated.ok) {
      throw new Error(`Icon update failed (${updated.status}). ${await updated.text()}`);
    }
  }
  if (shops.length < 20) break;
}

console.log(JSON.stringify({ dryRun: !write, target: describeTarget(), planned }, null, 2));
