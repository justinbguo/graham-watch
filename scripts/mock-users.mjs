/**
 * Fixture accounts for manual testing (@graham.test).
 *
 * Local: codes auto-fill from Mailpit. `npm run db:reset` drops users; run again.
 * Hosted: requires service role in scripts/.env.operator.local and `--yes`.
 *   Sign in with `npm run mock:signin -- gold@graham.test` (no Mailpit).
 *
 * Goldfinger's is claimed by gold@graham.test. Mock Desk is a second shop.
 *
 *   npm run mock:users
 *   npm run mock:users -- --yes              # hosted (all fixtures)
 *   npm run mock:users -- --yes --gold-only  # hosted (gold + claim only)
 */

import { config, describeTarget, serviceKey } from './_supabase.mjs';

const args = process.argv.slice(2);
const confirmed = args.includes('--yes');
const goldOnly = args.includes('--gold-only');

if (!config().isLocal && !confirmed) {
  console.error(
    `\n  Fixture users would be written to ${describeTarget()}.\n\n` +
      '  Local: npm run mock:users\n' +
      '  Hosted: npm run mock:users -- --yes\n' +
      '  Hosted (gold only): npm run mock:users -- --yes --gold-only\n'
  );
  process.exit(1);
}

const URL = config().url;
const ANON = config().anonKey;
const SERVICE = serviceKey();

/** Seeded in supabase/seed.sql — Goldfinger's Vintage inventory. */
const GOLDFINGER_DEALER_ID = 'ad0d7d71-741a-4b65-9465-641ed9cc0199';

const SHOP = {
  name: 'Mock Desk',
  website: 'https://mock-desk.graham.test',
  contact_email: 'dealer@graham.test',
};

const WATCH = {
  brand: 'Fixture',
  model: 'Message Test',
  reference: 'MOCK-1',
  year: 1968,
  price_cents: 100000,
  description: 'A local fixture so a buyer can message Mock Desk about a watch.',
};

const PEOPLE = [
  {
    email: 'ada@graham.test',
    first_name: 'Ada',
    last_name: 'Byron',
    handle: 'ada',
    account_type: 'buyer',
    role: 'buyer — messages Bea and Mock Desk',
  },
  {
    email: 'bea@graham.test',
    first_name: 'Bea',
    last_name: 'Cole',
    handle: 'bea',
    account_type: 'buyer',
    role: 'buyer — the other person',
  },
  {
    email: 'dealer@graham.test',
    first_name: 'Dana',
    last_name: 'Hart',
    handle: 'desk',
    account_type: 'dealer',
    role: 'dealer — owns Mock Desk',
  },
  {
    email: 'gold@graham.test',
    first_name: 'Max',
    last_name: 'Goldfinger',
    handle: 'goldfinger',
    account_type: 'dealer',
    role: "dealer — owns Goldfinger's Vintage (52 watches)",
  },
];

const adminHeaders = {
  apikey: SERVICE,
  Authorization: `Bearer ${SERVICE}`,
  'Content-Type': 'application/json',
};

async function admin(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${URL}${path}`, {
    method,
    headers: adminHeaders,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed };
}

async function ensureUser(person) {
  const created = await admin('/auth/v1/admin/users', {
    method: 'POST',
    body: { email: person.email, email_confirm: true },
  });
  if (created.body?.id) return created.body;

  // Listing every user 500s on this stack: a seed row has empty token columns
  // GoTrue cannot scan. A magic link for one address still returns that user.
  const already =
    created.status === 422 || /already.*(registered|exists)/i.test(JSON.stringify(created.body));
  if (!already) {
    throw new Error(`could not create ${person.email}: ${created.status} ${JSON.stringify(created.body)}`);
  }

  const link = await admin('/auth/v1/admin/generate_link', {
    method: 'POST',
    body: { type: 'magiclink', email: person.email },
  });
  if (!link.body?.id && !link.body?.user?.id) {
    throw new Error(`could not find ${person.email}: ${link.status} ${JSON.stringify(link.body)}`);
  }
  return link.body.user ?? link.body;
}

async function finishProfile(person, userId) {
  const response = await fetch(`${URL}/rest/v1/profiles?id=eq.${userId}`, {
    method: 'PATCH',
    headers: { ...adminHeaders, Prefer: 'return=representation' },
    body: JSON.stringify({
      first_name: person.first_name,
      last_name: person.last_name,
      handle: person.handle,
      date_of_birth: '1990-05-01',
      account_type: person.account_type,
      onboarded_at: new Date().toISOString(),
    }),
  });
  const text = await response.text();
  if (response.status >= 400) {
    throw new Error(`could not finish ${person.email}: ${response.status} ${text}`);
  }
  const rows = text ? JSON.parse(text) : [];
  if (!rows[0]?.onboarded_at || rows[0].handle !== person.handle) {
    throw new Error(`profile for ${person.email} did not save: ${text}`);
  }
}

async function ensureShop(dealerId) {
  const listed = await admin(
    `/rest/v1/dealers?website=eq.${encodeURIComponent(SHOP.website)}&select=id,claimed_by`
  );
  if (listed.status >= 400) {
    throw new Error(`could not read Mock Desk: ${listed.status} ${JSON.stringify(listed.body)}`);
  }

  let shopId = listed.body?.[0]?.id;
  if (!shopId) {
    const created = await fetch(`${URL}/rest/v1/dealers?select=id`, {
      method: 'POST',
      headers: { ...adminHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({
        ...SHOP,
        permission: 'approved',
        created_by: dealerId,
        claimed_by: dealerId,
      }),
    });
    const rows = await created.json();
    if (created.status >= 400 || !rows?.[0]?.id) {
      throw new Error(`could not create Mock Desk: ${created.status} ${JSON.stringify(rows)}`);
    }
    shopId = rows[0].id;
  } else if (listed.body[0].claimed_by !== dealerId) {
    const claimed = await admin(`/rest/v1/dealers?id=eq.${shopId}`, {
      method: 'PATCH',
      body: { claimed_by: dealerId, permission: 'approved' },
    });
    if (claimed.status >= 400) {
      throw new Error(`could not claim Mock Desk: ${claimed.status} ${JSON.stringify(claimed.body)}`);
    }
  }

  const watches = await admin(
    `/rest/v1/listings?dealer_id=eq.${shopId}&reference=eq.${WATCH.reference}&select=id`
  );
  if (!watches.body?.length) {
    const created = await fetch(`${URL}/rest/v1/listings?select=id`, {
      method: 'POST',
      headers: { ...adminHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({
        dealer_id: shopId,
        imported_by: dealerId,
        ...WATCH,
      }),
    });
    const rows = await created.json();
    if (created.status >= 400 || !rows?.[0]?.id) {
      throw new Error(`could not add the fixture watch: ${created.status} ${JSON.stringify(rows)}`);
    }
  }

  return shopId;
}

async function resolveGoldfingerDealerId() {
  const byId = await admin(
    `/rest/v1/dealers?id=eq.${GOLDFINGER_DEALER_ID}&select=id,name,claimed_by`
  );
  if (byId.body?.[0]?.id) return byId.body[0];

  const bySite = await admin(
    `/rest/v1/dealers?website=ilike.%25goldfingersvintage.com%25&select=id,name,claimed_by&limit=1`
  );
  if (bySite.body?.[0]?.id) return bySite.body[0];

  throw new Error(
    "Goldfinger's Vintage is not in this project. Local: npm run db:reset. Hosted: import the shop (npm run dealers -- add goldfingersvintage.com) and approve it."
  );
}

async function claimGoldfinger(ownerId) {
  const shop = await resolveGoldfingerDealerId();
  if (shop.claimed_by === ownerId) return shop.id;

  const claimed = await admin(`/rest/v1/dealers?id=eq.${shop.id}`, {
    method: 'PATCH',
    body: { claimed_by: ownerId, permission: 'approved' },
  });
  if (claimed.status >= 400) {
    throw new Error(
      `could not claim Goldfinger's: ${claimed.status} ${JSON.stringify(claimed.body)}`
    );
  }
  return shop.id;
}

const roster = goldOnly ? PEOPLE.filter((person) => person.handle === 'goldfinger') : PEOPLE;

const made = [];
for (const person of roster) {
  const user = await ensureUser(person);
  await finishProfile(person, user.id);
  made.push({ ...person, id: user.id });
}

const goldfingerOwner = made.find((person) => person.handle === 'goldfinger');
if (!goldfingerOwner) {
  throw new Error('gold@graham.test was not in the roster');
}
await claimGoldfinger(goldfingerOwner.id);

if (!goldOnly) {
  const deskOwner = made.find((person) => person.handle === 'desk');
  const shopId = await ensureShop(deskOwner.id);

  // The buyer has to be able to open the thread the shop page opens. Signing in
  // here is the same call the app makes, without going through Mailpit.
  const ada = made.find((person) => person.handle === 'ada');
  const session = await fetch(`${URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ type: 'magiclink', email: ada.email }),
  });
  const link = await session.json();
  if (!link?.hashed_token && !session.ok) {
    throw new Error(`could not sign Ada in to check the shop thread: ${session.status} ${JSON.stringify(link)}`);
  }

  const verified = await fetch(`${URL}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }),
  });
  const adaSession = await verified.json();
  if (!adaSession?.access_token) {
    throw new Error(`Ada has no session: ${verified.status} ${JSON.stringify(adaSession)}`);
  }

  const thread = await fetch(`${URL}/rest/v1/rpc/conversation_with_dealer`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${adaSession.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_dealer_id: shopId }),
  });
  const threadId = await thread.json();
  if (thread.status >= 400 || typeof threadId !== 'string') {
    throw new Error(`Ada cannot open Mock Desk: ${thread.status} ${JSON.stringify(threadId)}`);
  }
}

const where = config().isLocal ? 'Local' : describeTarget();
console.log(`\n${where} fixture accounts.\n`);
for (const person of made) {
  console.log(`  ${person.email.padEnd(22)} @${person.handle.padEnd(6)} ${person.role}`);
}
if (!goldOnly) {
  console.log('\n  Mock Desk is claimed by dealer@graham.test (Fixture Message Test).');
}
console.log("  Goldfinger's is claimed by gold@graham.test — Seller hub + Profile.");
if (config().isLocal) {
  console.log('  Local: codes fill from Mailpit. db:reset removes users; run mock:users again.\n');
} else {
  console.log('  Hosted: npm run mock:signin -- gold@graham.test for the one-time code.\n');
}
