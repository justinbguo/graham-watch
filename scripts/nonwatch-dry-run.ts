import { writeFileSync } from 'node:fs';

import { config, describeTarget } from './_supabase.mjs';
import { classifyCatalogueItem, type CatalogueFields } from '../supabase/functions/import-listings/nonwatch.ts';

type Raw = {
  title?: unknown;
  text?: unknown;
  meta?: { productType?: unknown; tags?: unknown; vendor?: unknown };
};

type Row = {
  id: string;
  dealer_id: string;
  available: boolean;
  listing_id: string | null;
  raw: Raw | null;
  dealers: { name: string } | { name: string }[] | null;
};

function fieldsOf(raw: Raw | null): CatalogueFields {
  const meta = raw?.meta ?? {};
  const tags = Array.isArray(meta.tags) ? meta.tags.filter((tag): tag is string => typeof tag === 'string') : [];
  return {
    title: typeof raw?.title === 'string' ? raw.title : '',
    text: typeof raw?.text === 'string' ? raw.text : '',
    productType: typeof meta.productType === 'string' ? meta.productType : null,
    tags,
    vendor: typeof meta.vendor === 'string' ? meta.vendor : null,
  };
}

function shopName(row: Row): string {
  const dealer = row.dealers;
  if (Array.isArray(dealer)) return dealer[0]?.name ?? row.dealer_id;
  return dealer?.name ?? row.dealer_id;
}

async function readPage(url: string, key: string, from: number): Promise<{ rows: Row[]; total: number | null }> {
  const response = await fetch(
    `${url}/rest/v1/source_items?select=id,dealer_id,available,listing_id,raw,dealers(name)&order=id.asc`,
    {
      method: 'GET',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Range: `${from}-${from + 999}`,
        Prefer: 'count=exact',
      },
    }
  );
  if (!response.ok) {
    throw new Error(`Catalogue read failed (${response.status}). ${await response.text()}`);
  }
  const totalHeader = response.headers.get('content-range');
  const total = totalHeader && totalHeader.includes('/') ? Number(totalHeader.split('/')[1]) : null;
  const rows = (await response.json()) as Row[];
  return { rows, total: Number.isFinite(total) ? total : null };
}

const outFlag = process.argv.indexOf('--out');
const outPath = outFlag === -1 ? null : process.argv[outFlag + 1];
if (outFlag !== -1 && !outPath) {
  console.error('Usage: node --experimental-strip-types scripts/nonwatch-dry-run.ts [--out report.json]');
  process.exit(1);
}

const { url, serviceKey } = config();
if (!serviceKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing. The report only reads.');
}

const target = describeTarget();
const rows: Row[] = [];
let total: number | null = null;
for (let from = 0; ; from += 1000) {
  const page = await readPage(url, serviceKey, from);
  if (total == null) total = page.total;
  rows.push(...page.rows);
  if (page.rows.length < 1000) break;
}

const held = [];
const byReason = { strap: 0, accessory: 0, clock: 0 };
const byShop = new Map<string, { strap: number; accessory: number; clock: number; live: number }>();

for (const row of rows) {
  const decision = classifyCatalogueItem(fieldsOf(row.raw));
  if (decision.decision !== 'hold') continue;
  byReason[decision.reason] += 1;
  const name = shopName(row);
  const shop = byShop.get(name) ?? { strap: 0, accessory: 0, clock: 0, live: 0 };
  shop[decision.reason] += 1;
  if (row.listing_id) shop.live += 1;
  byShop.set(name, shop);
  held.push({
    id: row.id,
    dealerId: row.dealer_id,
    dealer: name,
    title: fieldsOf(row.raw).title,
    reason: decision.reason,
    rule: decision.rule,
    listingId: row.listing_id,
    available: row.available,
  });
}

const report = {
  readOnly: true,
  target,
  scanned: rows.length,
  held: held.length,
  watches: rows.length - held.length,
  byReason,
  alreadyLive: held.filter((row) => row.listingId).length,
  byShop: [...byShop.entries()]
    .map(([dealer, counts]) => ({ dealer, ...counts, held: counts.strap + counts.accessory + counts.clock }))
    .sort((a, b) => b.held - a.held),
  rows: held,
};

const json = JSON.stringify(report, null, 2);
if (outPath) writeFileSync(outPath, json);
console.log(
  `${target}: scanned ${report.scanned}, would hold ${report.held} ` +
    `(strap ${byReason.strap}, accessory ${byReason.accessory}, clock ${byReason.clock}). ` +
    `${report.watches} left as watches. ${report.alreadyLive} of the holds already have a listing, left untouched.`
);
if (!outPath) console.log(json);
