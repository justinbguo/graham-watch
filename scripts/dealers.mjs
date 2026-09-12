/**
 * Add and permission dealers from the terminal.
 *
 *   npm run dealers                       list every dealer
 *   npm run dealers -- add <domain>       find, preview, import and approve
 *   npm run dealers -- approve <id|host>  publish their listings
 *   npm run dealers -- revoke  <id|host>  pull them back
 *
 * Approval is deliberately impossible from the app: RLS blocks a user from
 * approving a dealer they created, so nobody can publish a shop's inventory by
 * importing it. That makes approving an operator action, and this is the tool.
 */

import { createInterface } from 'node:readline/promises';

import { formatPrice, preview, runImport } from './_import.mjs';
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

  console.log(`\n  ${name}`);
  console.log(`  ${found.platform} · ${catalogUrl}`);
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

  if (!(await confirm(`\nImport ${limit} listings from ${name} and publish them?`))) {
    console.log('Nothing imported.');
    return;
  }

  const job = await runImport({
    sourceUrl: catalogUrl,
    limit,
    dealerName: name,
    token: operator.token,
    onProgress: (current) => process.stdout.write(`\r  ${current.status}…    `),
  });

  process.stdout.write('\r');
  console.log(`Imported ${job.listings_created} listing(s) via ${job.provider}.`);
  if (job.error) console.log(job.error);

  await setPermission('approved', new URL(catalogUrl).hostname.replace(/^www\./, ''));
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
  case 'approve':
    await setPermission('approved');
    break;
  case 'revoke':
    await setPermission('revoked');
    break;
  default:
    console.error(`Unknown command "${command}". Try: list, add, approve, revoke.`);
    process.exit(1);
}
