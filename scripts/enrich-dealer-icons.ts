/**
 * Plans dealer icon updates without importing listings.
 *
 * Dry run unless --write. --write refuses any host that is not this machine.
 * The same decision is available as operator-bot action enrich-icons, which
 * also defaults to a dry run.
 *
 *   deno run --config supabase/functions/deno.ci.json --allow-net --allow-read --allow-env scripts/enrich-dealer-icons.ts
 *   deno run --config supabase/functions/deno.ci.json --allow-net --allow-read --allow-env scripts/enrich-dealer-icons.ts --write
 */

import { chooseDealerIcon } from '../supabase/functions/import-listings/icons.ts';

const HOSTED_REF = 'hbxgxtbtefpyutyqafoi';
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '10.0.2.2']);

function readEnv(path: string): Record<string, string> {
  let raw = '';
  try {
    raw = Deno.readTextFileSync(path);
  } catch {
    return {};
  }
  const values: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
  return values;
}

function stack() {
  const url = Deno.env.get('SUPABASE_URL') ?? readEnv('.env.local').SUPABASE_URL;
  const key =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? readEnv('.env.local').SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are missing. Point them at a local stack.');
  }
  return { url, key };
}

function localHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return LOCAL_HOSTS.has(host) && !host.includes(HOSTED_REF) && !url.includes(HOSTED_REF);
  } catch {
    return false;
  }
}

async function dealers(url: string, key: string) {
  const response = await fetch(
    `${url}/rest/v1/dealers?select=id,name,website,logo_url&website=not.is.null&order=name.asc&limit=20`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!response.ok) throw new Error(`Dealer read failed (${response.status}). ${await response.text()}`);
  return (await response.json()) as {
    id: string;
    name: string;
    website: string;
    logo_url: string | null;
  }[];
}

const write = Deno.args.includes('--write');
const { url, key } = stack();
if (write && !localHost(url)) {
  throw new Error(`Refusing to write dealer icons on ${url}. Production needs Justin's approval.`);
}

const rows = [];
for (const shop of await dealers(url, key)) {
  let html = '';
  try {
    const page = await fetch(shop.website, { signal: AbortSignal.timeout(20_000) });
    html = page.ok ? await page.text() : '';
  } catch {
    html = '';
  }
  const to = html
    ? await chooseDealerIcon({ html, origin: new URL(shop.website).origin, currentUrl: shop.logo_url })
    : shop.logo_url;
  const change = Boolean(to && to !== shop.logo_url);
  if (write && change) {
    const updated = await fetch(`${url}/rest/v1/dealers?id=eq.${shop.id}`, {
      method: 'PATCH',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ logo_url: to }),
    });
    if (!updated.ok) throw new Error(`Icon update failed (${updated.status}). ${await updated.text()}`);
  }
  rows.push({ dealerId: shop.id, name: shop.name, website: shop.website, from: shop.logo_url, to, write: change });
}

console.log(JSON.stringify({ dryRun: !write, shops: rows }, null, 2));
