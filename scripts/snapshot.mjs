#!/usr/bin/env node
/**
 * Rewrites supabase/seed.sql from a real project's inventory.
 *
 * `npm run db:reset` used to leave a schema and no app: seed.sql was empty on
 * the grounds that invented fixtures — placeholder photos, made-up references —
 * sat in the deck beside real watches and made every judgement about how the
 * app looked untrustworthy. That reasoning holds. The cost of it was that the
 * documented way to get a usable deck back was to re-scrape a shop and pay
 * OpenAI to re-extract every watch, so in practice nobody reset.
 *
 * A snapshot is the third option: real references, real prices, real
 * photographs, captured once. Regenerate it when the shape of the data
 * changes, not on a schedule.
 *
 *   npm run snapshot          # always from hosted; the seed is real inventory
 *
 * Two details make the output work offline and keep it honest:
 *
 * 1. `storage_path` is dropped. A photo row with one resolves against the
 *    current project's Storage, and those objects do not exist locally, so the
 *    deck would be a wall of broken images. Null falls back to `source_url` —
 *    the shop's own photograph — which loads anywhere. See src/data/listings.ts.
 *
 * 2. The shop is owned by a seed account, never by you. The deck hides a shop
 *    from the account that claimed it. Importing the rows does not. The seed
 *    shop is unclaimed, so the account that fetched it still sees the watches.
 */
import { writeFileSync } from 'node:fs';
import { config, describeTarget, serviceKey } from './_supabase.mjs';

// Fixed so a reset does not invalidate rows that reference it.
const SEED_OWNER = '5eed0000-0000-4000-8000-000000000001';
const SEED_EMAIL = 'seed-shop@graham.test';

// Enough of a queue for the import screen to have something to show without
// carrying a megabyte of scraped payloads into version control.
const UNPUBLISHED_SOURCE_ITEMS = 25;

const JSONB_COLUMNS = new Set(['raw', 'extracted']);
const ENUM_ARRAY_COLUMNS = new Map([['complications', 'complication[]']]);

const { url } = config();
const key = serviceKey();

async function read(path) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!response.ok) {
    throw new Error(`${path} → ${response.status} ${await response.text()}`);
  }
  return response.json();
}

function literal(column, value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);

  if (JSONB_COLUMNS.has(column)) {
    return `${quote(JSON.stringify(value))}::jsonb`;
  }

  if (Array.isArray(value)) {
    const inner = value.map((entry) => quote(String(entry))).join(', ');
    const cast = ENUM_ARRAY_COLUMNS.get(column) ?? 'text[]';
    return value.length ? `array[${inner}]::${cast}` : `'{}'::${cast}`;
  }

  return quote(String(value));
}

// standard_conforming_strings is on, so a doubled quote is the whole escape.
function quote(text) {
  return `'${text.replaceAll("'", "''")}'`;
}

function insert(table, rows, { conflict = 'id' } = {}) {
  if (!rows.length) return `-- no rows for ${table}\n`;

  const columns = Object.keys(rows[0]);
  const values = rows
    .map((row) => `  (${columns.map((column) => literal(column, row[column])).join(', ')})`)
    .join(',\n');

  return [
    `insert into ${table} (${columns.join(', ')}) values`,
    values,
    `on conflict (${conflict}) do nothing;`,
    '',
  ].join('\n');
}

const dealers = await read('dealers?permission=eq.approved&select=*');
if (!dealers.length) {
  console.error(`\n  No approved shops on ${describeTarget()}. Nothing to snapshot.\n`);
  process.exit(1);
}

const dealerIds = dealers.map((dealer) => dealer.id);
const inList = `(${dealerIds.join(',')})`;

const listings = await read(
  `listings?dealer_id=in.${inList}&status=eq.active&sold_at=is.null&select=*`
);
const listingIds = listings.map((listing) => listing.id);

const photos = listingIds.length
  ? await read(`listing_photos?listing_id=in.(${listingIds.join(',')})&select=*&order=position`)
  : [];

// The published rows keep the workspace honest; a slice of the rest gives the
// import screen a queue to publish from.
const published = listingIds.length
  ? await read(`source_items?listing_id=in.(${listingIds.join(',')})&select=*`)
  : [];
const queued = await read(
  `source_items?dealer_id=in.${inList}&listing_id=is.null&available=is.true&select=*&limit=${UNPUBLISHED_SOURCE_ITEMS}`
);

// Everything points at the seed account rather than whoever ran this, and the
// address is a .test domain: a local inquiry must not be able to reach a real
// dealer's inbox, and their address does not belong in version control.
const scrubbedDealers = dealers.map((dealer) => ({
  ...dealer,
  contact_email: dealer.website
    ? `sales@${new URL(dealer.website).hostname.replace(/^www\./, '')}.test`
    : `sales@${dealer.id}.test`,
  created_by: SEED_OWNER,
  claimed_by: dealer.claimed_by ? SEED_OWNER : null,
}));

const scrubbedListings = listings.map((listing) => ({
  ...listing,
  imported_by: SEED_OWNER,
  import_job_id: null,
}));

const scrubbedPhotos = photos.map((photo) => ({ ...photo, storage_path: null }));

const sourceItems = [...published, ...queued];

const header = `-- Generated by \`npm run snapshot\`. Do not edit by hand.
--
-- A snapshot of real inventory, not fixtures: real references, real prices, and
-- photographs served from the shop's own site. Captured from a live project so
-- the deck looks like the deck, without a scrape or an OpenAI call per reset.
--
-- Regenerate when the shape of the data changes:
--
--   npm run snapshot
--
-- The shop belongs to a seed account (${SEED_EMAIL}), never to you.
-- The deck hides a shop from the account that claimed it. Importing the rows
-- does not. This seed shop is unclaimed, so the account that fetched it still
-- sees the watches.
--
-- \`storage_path\` is null on every photo on purpose. It resolves against the
-- current project's Storage, which is empty locally; null falls back to the
-- shop's own URL. See src/data/listings.ts.
--
-- For a backend with no network at all, run \`npm run demo\` instead, which uses
-- the fixtures in src/lib/demo.ts.

`;

const body = [
  '-- The account the seeded shop belongs to. The profile arrives by trigger.',
  `insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  ${quote(SEED_OWNER)},
  'authenticated',
  'authenticated',
  ${quote(SEED_EMAIL)},
  '',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
) on conflict (id) do nothing;
`,
  insert('public.dealers', scrubbedDealers),
  insert('public.listings', scrubbedListings),
  insert('public.listing_photos', scrubbedPhotos),
  insert('public.source_items', sourceItems),
].join('\n');

writeFileSync('supabase/seed.sql', `${header}${body}`);

const kb = (Buffer.byteLength(`${header}${body}`) / 1024).toFixed(0);
console.log(`\n  from ${describeTarget()}`);
console.log(`  ${scrubbedDealers.length} shop(s), ${scrubbedListings.length} listing(s), ${scrubbedPhotos.length} photo(s), ${sourceItems.length} source item(s)`);
console.log(`  wrote supabase/seed.sql (${kb} KB)\n`);
