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
 *   npm run dealers -- applications       shops asking to be listed
 *   npm run dealers -- accept  <app-id>   turn one into a shop they own
 *   npm run dealers -- decline <app-id>   say no, with --note
 *   npm run dealers -- operator [email]   let an account approve shops,
 *                                         with --password to set one
 *
 * Approval is deliberately impossible from the app: RLS blocks a user from
 * approving a dealer they created, so nobody can publish a shop's inventory by
 * importing it. That makes approving an operator action, and this is the tool.
 *
 * `accept` and `approve` are different gates. Accepting hands a shop to the
 * dealer who applied for it; approving is what puts listings in the deck.
 */

import { createInterface } from 'node:readline/promises';

import { choose, formatPrice, preview, publishAll, syncCatalog } from './_import.mjs';
import { config, describeTarget, request, serviceKey, signInOperator } from './_supabase.mjs';
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

/**
 * Makes the operator type the shop's name before an irreversible change to a
 * live project.
 *
 * `--yes` exists to repeat a local reset without ceremony, and it sits one
 * character away from a command that deletes a real shop and every listing
 * under it. So the flag is honoured on local and ignored on production, where
 * the only thing that counts as consent is naming what is about to go.
 */
async function confirmByName(name) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`Type the shop's name to confirm on PRODUCTION — ${name}: `);
    return answer.trim() === name;
  } finally {
    rl.close();
  }
}

/**
 * A preview is the shop's own words, not a typed watch.
 *
 * It reads the catalogue and stops, so there is no brand, model or year to
 * print — those come from the model at publish time. Asking for them anyway
 * printed a column of blank names and `????`, which is the opposite of what a
 * preview is for.
 */
function printSample(listings) {
  for (const listing of listings) {
    console.log(`  ${listing.title || listing.source_url}`);
    console.log(
      `        ${formatPrice(listing.price_cents, listing.currency)} · ${listing.photo_count} photos`
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

  const agreed = config().isLocal
    ? flags.yes === true || (await confirm('Delete permanently?'))
    : await confirmByName(dealer.name);

  if (!agreed) {
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

/**
 * Goes through set_dealer_permission rather than patching the column, so this
 * and the operator UI share one implementation of "make a shop live".
 */
async function setPermission(permission, explicitTarget) {
  const subject = explicitTarget ?? target;
  if (!subject) {
    console.error(`Usage: npm run dealers -- ${permission === 'approved' ? 'approve' : 'revoke'} <id|host>`);
    process.exit(1);
  }

  const dealer = await findDealer(subject);

  // Both directions are buyer-visible: approve puts stock in front of real
  // people, revoke takes a working shop out of the deck. Neither asked before.
  if (!config().isLocal) {
    const verb = permission === 'approved' ? 'Publish' : 'Hide';
    if (!(await confirm(`${verb} ${dealer.name} on PRODUCTION?`))) {
      console.log('Nothing changed.');
      return;
    }
  }

  const { body, ok, status } = await request('/rest/v1/rpc/set_dealer_permission', {
    token: key,
    method: 'POST',
    body: { p_dealer_id: dealer.id, p_permission: permission },
  });

  if (!ok) {
    console.error(`Failed (${status}): ${body?.message ?? ''}`);
    process.exit(1);
  }
  console.log(`${dealer.name} → ${body}`);
}

/**
 * Grants operator access. The one action that still needs the service key,
 * because it is what bootstraps every other operator identity.
 */
async function operator() {
  const email = target ?? process.env.GRAHAM_OPERATOR_EMAIL ?? 'operator@graham.local';
  const password = typeof flags.password === 'string' ? flags.password : null;
  let userId;

  // The UI signs in with a password, so this account can be reached by anyone
  // who guesses one — the auth endpoint is public and an operator decides which
  // shops are live. Twelve is the floor here; Supabase's own minimum is six.
  if (password !== null && password.length < 12) {
    console.error('That password is too short. Use at least 12 characters.');
    process.exit(1);
  }

  if (target) {
    const { body } = await request('/auth/v1/admin/users?per_page=1000', { token: key });
    const found = (body?.users ?? []).find(
      (user) => user.email?.toLowerCase() === email.toLowerCase()
    );

    if (found) {
      userId = found.id;

      if (password) {
        const set = await request(`/auth/v1/admin/users/${userId}`, {
          token: key,
          method: 'PUT',
          body: { password },
        });
        if (!set.ok) {
          console.error(`Could not set the password (${set.status}): ${set.body?.msg ?? ''}`);
          process.exit(1);
        }
        console.log(`Set a new password for ${email}.`);
      }
    } else {
      // Created here rather than refused. The operator UI turns signups off, so
      // an address with no account cannot make one by signing in, and telling
      // the operator to go and sign in first is a circle with no way out.
      // Confirmed on the way in: an unconfirmed address cannot claim a shop.
      const made = await request('/auth/v1/admin/users', {
        token: key,
        method: 'POST',
        body: { email, email_confirm: true, ...(password ? { password } : {}) },
      });

      if (!made.ok) {
        console.error(`Could not create an account for ${email} (${made.status}): ${made.body?.msg ?? made.body?.message ?? ''}`);
        process.exit(1);
      }
      userId = made.body.id;
      console.log(`Created an account for ${email}.`);
    }
  } else {
    // Creates the configured operator account if it does not exist yet, which
    // is what every other command in this file already relies on.
    userId = (await signInOperator()).id;
  }

  const { ok, status, body } = await request('/rest/v1/operators', {
    token: key,
    method: 'POST',
    body: { user_id: userId, note: typeof flags.note === 'string' ? flags.note : email },
    prefer: 'resolution=merge-duplicates,return=representation',
  });

  if (!ok) {
    console.error(`Failed (${status}): ${body?.message ?? ''}`);
    process.exit(1);
  }
  console.log(`${email} can approve shops now.`);
  console.log(`  ${userId}`);

  if (!password) {
    console.log(`\nThe operator UI signs in with a password. Set one with:`);
    console.log(`  npm run dealers -- operator ${email} --password "..."`);
  }
}

const VOLUME_LABELS = {
  under_10: 'under 10',
  '10_to_50': '10–50',
  '50_to_200': '50–200',
  over_200: '200+',
};

/**
 * Unverified applications are listed but marked, because an operator cannot act
 * on one: approve_dealer_application refuses until the mailbox is proved.
 */
async function applications() {
  const wanted = typeof flags.status === 'string' ? flags.status : 'pending';
  const { body } = await request(
    `/rest/v1/dealer_applications?status=eq.${wanted}&select=*&order=created_at.asc`,
    { token: key }
  );

  if (!Array.isArray(body) || body.length === 0) {
    console.log(`\nNo ${wanted} applications.\n`);
    return;
  }

  console.log('');
  for (const app of body) {
    const mark = app.verified_at ? '●' : '○';
    console.log(`  ${mark} ${app.shop_name}`);
    console.log(`    ${app.website}  ·  ${VOLUME_LABELS[app.volume] ?? app.volume} at a time`);
    console.log(`    ${app.brands?.length ? app.brands.join(' · ') : 'no brands given'}`);
    console.log(
      `    ${app.verified_email ?? '⚠ mailbox not proved yet — cannot be accepted'}`
    );
    console.log(`    ${app.id}`);
  }
  console.log('\n  ● mailbox proved   ○ waiting on the applicant\n');
}

async function accept() {
  if (!target) {
    console.error('Usage: npm run dealers -- accept <app-id> [--hold]');
    console.error('  --hold  create the shop but leave its listings unpublished');
    process.exit(1);
  }

  const operator = await signInOperator();
  const { ok, status, body } = await request('/rest/v1/rpc/approve_dealer_application', {
    token: key,
    method: 'POST',
    body: {
      p_application_id: target,
      p_permission: flags.hold === true ? 'pending' : 'approved',
      // A service-key call has no subject, so the new shop's created_by has to
      // be named. The operator UI omits this and is attributed from its session.
      p_created_by: operator.id,
    },
  });

  if (!ok) {
    console.error(`Failed (${status}): ${body?.message ?? ''}`);
    process.exit(1);
  }

  const dealer = await findDealer(body);
  console.log(`\n  ${dealer.name} → ${dealer.permission}`);
  console.log(`  ${dealer.website}`);
  console.log(`  claimed · ${dealer.contact_email ?? 'no contact address'}`);
  console.log(`  ${dealer.id}\n`);
  console.log('They can import their inventory from the app now.\n');
}

async function decline() {
  const note = typeof flags.note === 'string' ? flags.note : null;
  if (!target || !note) {
    console.error('Usage: npm run dealers -- decline <app-id> --note "why"');
    console.error('The note is required. The applicant reads it on their profile.');
    process.exit(1);
  }

  const operator = await signInOperator();
  const { ok, status, body } = await request('/rest/v1/rpc/decline_dealer_application', {
    token: key,
    method: 'POST',
    body: { p_application_id: target, p_note: note, p_reviewed_by: operator.id },
  });

  if (!ok) {
    console.error(`Failed (${status}): ${body?.message ?? ''}`);
    process.exit(1);
  }
  console.log(`Declined. They will read: "${note}"`);
}

console.log(describeTarget());

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
  case 'applications':
    await applications();
    break;
  case 'accept':
    await accept();
    break;
  case 'decline':
    await decline();
    break;
  case 'operator':
    await operator();
    break;
  default:
    console.error(
      `Unknown command "${command}". Try: list, add, set, stats, remove, approve, revoke, applications, accept, decline, operator.`
    );
    process.exit(1);
}
