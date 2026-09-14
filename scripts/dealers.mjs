/**
 * Add and permission dealers from the terminal.
 *
 *   npm run dealers                       list every dealer
 *   npm run dealers -- add <domain>       find, preview, import and approve
 *   npm run dealers -- set <id|host>      change --email or --name
 *   npm run dealers -- stats <id|host>    saves and inquiries per watch
 *   npm run dealers -- remove <id|host>   delete them, their listings and photos
 *   npm run dealers -- approve <id|host>  publish their listings
 *   npm run dealers -- revoke  <id|host>  pull them back
 *
 * Approval is deliberately impossible from the app: RLS blocks a user from
 * approving a dealer they created, so nobody can publish a shop's inventory by
 * importing it. That makes approving an operator action, and this is the tool.
 */

import { createInterface } from 'node:readline/promises';

import { choose, formatPrice, preview, publishAll, syncCatalog } from './_import.mjs';
import { config, request, serviceKey, signInOperator } from './_supabase.mjs';
import { discover } from './discover.mjs';

function parseArgs(argv) {
  const positional = [];
  const flags = {};

  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) {
      positional.push(argv[i]);
      continue;
    }
    const name = argv[i].slice(2);
    const next = argv[i + 1];
    flags[name] = next && !next.startsWith('--') ? argv[(i += 1)] : true;
  }

  return { positional, flags };
}

const { positional, flags } = parseArgs(process.argv.slice(2));
const [command, target] = positional;
const key = serviceKey();

async function list() {
  const { body } = await request('/rest/v1/dealers?select=*,listings(count)&order=created_at.desc', {
    token: key,
  });

  if (!Array.isArray(body) || body.length === 0) {
    console.log('No dealers yet. Run `npm run import -- <url>` first.');
    return;
  }

  console.log('');
  for (const dealer of body) {
    const count = dealer.listings?.[0]?.count ?? 0;
    const mark = dealer.permission === 'approved' ? '●' : '○';
    console.log(`  ${mark} ${dealer.permission.padEnd(9)} ${String(count).padStart(3)} listings  ${dealer.name}`);
    console.log(`    ${dealer.website ?? 'no website'}  ${dealer.id}`);
    console.log(`    ${dealer.contact_email ?? '⚠ no contact address — inquiries cannot send'}`);
  }
  console.log('\n  ● live in the deck   ○ hidden from everyone but the importer\n');
}

const SAMPLE_SIZE = 3;
const DEFAULT_LIMIT = 10;

async function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${question} [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

function printSample(listings) {
  for (const listing of listings) {
    const name = [listing.brand, listing.model].filter(Boolean).join(' ');
    const facts = [
      listing.reference && `ref. ${listing.reference}`,
      listing.case_size_mm && `${listing.case_size_mm}mm`,
      listing.movement,
    ].filter(Boolean);

    console.log(`  ${String(listing.year ?? '????')}  ${name}`);
    console.log(
      `        ${formatPrice(listing.price_cents, listing.currency)} · ${listing.photo_count} photos${
        facts.length ? ` · ${facts.join(' · ')}` : ''
      }`
    );
  }
}

/**
 * One command from a bare domain to watches in the deck. The preview exists so
 * a bad guess at the catalog costs a few seconds rather than a table of junk
 * that has to be deleted by hand.
 */
async function add() {
  if (!target) {
    console.error('Usage: npm run dealers -- add <domain> [--limit 10] [--url <catalog>] [--name "Shop"]');
    process.exit(1);
  }

  const limit = Number(flags.limit ?? DEFAULT_LIMIT);
  if (!Number.isInteger(limit) || limit < 1) {
    console.error('--limit must be a whole number.');
    process.exit(1);
  }

  console.log(`\nLooking at ${target}…`);
  const found = await discover(target);

  const name = typeof flags.name === 'string' ? flags.name : found.name;
  const catalogUrl = typeof flags.url === 'string' ? flags.url : found.catalogUrl;
  const email = typeof flags.email === 'string' ? flags.email : found.email;

  console.log(`\n  ${name}`);
  console.log(`  ${found.platform} · ${catalogUrl}`);
  console.log(`  ${email ?? 'no contact address found — set one with --email'}`);
  if (found.productCount) console.log(`  about ${found.productCount} products listed in their sitemap`);
  if (!found.sawSitemap) console.log('  no sitemap, so the catalog URL is a guess — pass --url to set it');
  if (found.platform === 'generic') {
    console.log('  unknown shop software: falls back to scraping, which is slower and less exact');
  }

  const operator = await signInOperator();

  console.log(`\nReading ${SAMPLE_SIZE} of them…`);
  const sample = await preview({
    sourceUrl: catalogUrl,
    limit: SAMPLE_SIZE,
    token: operator.token,
  });

  if (!sample.listings?.length) {
    console.error('\nNothing came back. Try a different catalog URL with --url.');
    process.exit(1);
  }

  console.log('');
  printSample(sample.listings);

  if (flags.yes !== true && !(await confirm(`\nImport ${limit} listings from ${name} and publish them?`))) {
    console.log('Nothing imported.');
    return;
  }

  const synced = await syncCatalog({
    sourceUrl: catalogUrl,
    dealerName: name,
    dealerEmail: email ?? undefined,
    token: operator.token,
  });

  console.log(
    `\nRead ${synced.found} watches via ${synced.provider}: ${synced.added} new, ${synced.changed} changed, ${synced.retired} retired.`
  );

  const picked = await choose({ dealerId: synced.dealerId, limit, token: operator.token });
  console.log(`Queued ${picked}. Typing them now…`);

  const totals = await publishAll({
    dealerId: synced.dealerId,
    token: operator.token,
    onProgress: (current) =>
      process.stdout.write(`\r  ${current.published} published, ${current.pending} left…    `),
  });

  process.stdout.write('\r');
  console.log(
    `Published ${totals.published} listing(s). ${totals.skipped} skipped, ${totals.failed} failed.`
  );

  await setPermission('approved', new URL(catalogUrl).hostname.replace(/^www\./, ''));
}

async function findDealer(subject) {
  const isUuid = /^[0-9a-f-]{36}$/i.test(subject);
  const filter = isUuid ? `id=eq.${subject}` : `website=ilike.*${subject}*`;
  const { body } = await request(`/rest/v1/dealers?${filter}&select=*`, { token: key });

  if (!body?.length) {
    console.error(`No dealer matched "${subject}".`);
    process.exit(1);
  }
  if (body.length > 1) {
    console.error(`"${subject}" matched ${body.length} dealers. Use an id.`);
    for (const dealer of body) console.error(`  ${dealer.id}  ${dealer.name}`);
    process.exit(1);
  }
  return body[0];
}

/**
 * Deleting the dealer row cascades to listings and photo rows, but storage knows
 * nothing about foreign keys. Without this the images stay, paid for and
 * unreachable.
 */
async function deletePhotos(listingIds) {
  let removed = 0;

  for (const listingId of listingIds) {
    const listed = await request('/storage/v1/object/list/listing-photos', {
      token: key,
      method: 'POST',
      body: { prefix: `${listingId}/`, limit: 100 },
    });
    const paths = (listed.body ?? []).map((object) => `${listingId}/${object.name}`);
    if (!paths.length) continue;

    await request('/storage/v1/object/listing-photos', {
      token: key,
      method: 'DELETE',
      body: { prefixes: paths },
    });
    removed += paths.length;
  }

  return removed;
}

async function remove() {
  if (!target) {
    console.error('Usage: npm run dealers -- remove <id|host> [--yes]');
    process.exit(1);
  }

  const dealer = await findDealer(target);
  const { body: listings } = await request(
    `/rest/v1/listings?dealer_id=eq.${dealer.id}&select=id`,
    { token: key }
  );
  const ids = (listings ?? []).map((listing) => listing.id);

  console.log(`\n  ${dealer.name}`);
  console.log(`  ${dealer.website ?? 'no website'}`);
  console.log(`  ${ids.length} listing(s) and their photos will be deleted.\n`);

  if (flags.yes !== true && !(await confirm('Delete permanently?'))) {
    console.log('Nothing deleted.');
    return;
  }

  const photos = await deletePhotos(ids);
  const { ok, status, body } = await request(`/rest/v1/dealers?id=eq.${dealer.id}`, {
    token: key,
    method: 'DELETE',
  });

  if (!ok) {
    console.error(`Failed (${status}): ${body?.message ?? ''}`);
    process.exit(1);
  }
  console.log(`Deleted ${dealer.name}: ${ids.length} listing(s), ${photos} photo(s).`);
}

async function set() {
  if (!target) {
    console.error('Usage: npm run dealers -- set <id|host> [--email <address>] [--name "Shop"]');
    console.error('With no flags, re-reads the name and contact address from their site.');
    process.exit(1);
  }

  const dealer = await findDealer(target);
  const patch = {};

  if (typeof flags.email === 'string') patch.contact_email = flags.email;
  if (typeof flags.name === 'string') patch.name = flags.name;

  if (!Object.keys(patch).length) {
    if (!dealer.website) {
      console.error(`${dealer.name} has no website to read. Pass --email or --name.`);
      process.exit(1);
    }
    console.log(`Reading ${dealer.website}…`);
    const found = await discover(dealer.website);
    if (found.email) patch.contact_email = found.email;
    if (found.name) patch.name = found.name;

    if (!Object.keys(patch).length) {
      console.log('Found nothing new.');
      return;
    }
  }

  const { ok, status, body } = await request(`/rest/v1/dealers?id=eq.${dealer.id}`, {
    token: key,
    method: 'PATCH',
    body: patch,
    prefer: 'return=representation',
  });

  if (!ok) {
    console.error(`Failed (${status}): ${body?.message ?? ''}`);
    process.exit(1);
  }
  const updated = body[0];
  console.log(`${updated.name} · ${updated.contact_email ?? 'no contact address'}`);
}

/**
 * The dealer-facing numbers, read from the operator's seat because dealers have
 * no account yet. Same function a dealer portal would call.
 */
async function stats() {
  if (!target) {
    console.error('Usage: npm run dealers -- stats <id|host>');
    process.exit(1);
  }

  const dealer = await findDealer(target);
  const operator = await signInOperator();

  const { ok, body, status } = await request('/rest/v1/rpc/dealer_stats', {
    token: operator.token,
    method: 'POST',
    body: { p_dealer_id: dealer.id },
  });

  if (!ok) {
    console.error(`Failed (${status}): ${body?.message ?? ''}`);
    process.exit(1);
  }

  const total = body.reduce(
    (sum, row) => ({
      saves: sum.saves + row.saves,
      passes: sum.passes + row.passes,
      inquiries: sum.inquiries + row.inquiries,
    }),
    { saves: 0, passes: 0, inquiries: 0 }
  );

  console.log(`\n  ${dealer.name} · ${dealer.contact_email ?? 'no contact address'}`);
  console.log(`  ${total.saves} saved · ${total.passes} passed · ${total.inquiries} inquired\n`);

  for (const row of body) {
    const name = [row.brand, row.model].filter(Boolean).join(' ');
    console.log(
      `  ${String(row.saves).padStart(3)} saved  ${String(row.inquiries).padStart(3)} asked   ` +
        `${name} · ${formatPrice(row.price_cents, 'USD')}`
    );
  }
  console.log('');
}

async function setPermission(permission, explicitTarget) {
  const subject = explicitTarget ?? target;
  if (!subject) {
    console.error(`Usage: npm run dealers -- ${permission === 'approved' ? 'approve' : 'revoke'} <id|host>`);
    process.exit(1);
  }

  const isUuid = /^[0-9a-f-]{36}$/i.test(subject);
  const filter = isUuid ? `id=eq.${subject}` : `website=ilike.*${subject}*`;

  const { body, ok, status } = await request(`/rest/v1/dealers?${filter}`, {
    token: key,
    method: 'PATCH',
    body: { permission },
    prefer: 'return=representation',
  });

  if (!ok) {
    console.error(`Failed (${status}): ${body?.message ?? ''}`);
    process.exit(1);
  }
  if (!body?.length) {
    console.error(`No dealer matched "${subject}".`);
    process.exit(1);
  }

  for (const dealer of body) {
    console.log(`${dealer.name} → ${dealer.permission}`);
  }
}

console.log(`${config().isLocal ? 'local' : config().url}`);

switch (command) {
  case undefined:
  case 'list':
    await list();
    break;
  case 'add':
    await add();
    break;
  case 'remove':
  case 'delete':
    await remove();
    break;
  case 'set':
    await set();
    break;
  case 'stats':
    await stats();
    break;
  case 'approve':
    await setPermission('approved');
    break;
  case 'revoke':
    await setPermission('revoked');
    break;
  default:
    console.error(`Unknown command "${command}". Try: list, add, set, stats, remove, approve, revoke.`);
    process.exit(1);
}
