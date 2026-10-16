/**
 * Three local accounts for walking messages by hand.
 *
 * The app signs in with an email code, and locally it reads that code from
 * Mailpit, so these accounts have no password you type. `npm run db:reset`
 * drops them with everything else; run this again afterwards.
 *
 * Goldfinger's stays unclaimed. Mock Desk is a second shop, so Email the shop
 * and an in-app reply can both be walked on the same database.
 *
 * Run with `npm run mock:users` while `supabase start` is up.
 */

import { config, serviceKey } from './_supabase.mjs';

if (!config().isLocal) {
  console.error(
    `\n  Refusing to run: ${config().url} is not the local stack.\n\n` +
      '  These accounts are fixtures. Run them against `npm run db:start`\n' +
      '  and unset SUPABASE_URL.\n'
  );
  process.exit(1);
}

const URL = config().url;
const ANON = config().anonKey;
const SERVICE = serviceKey();

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

const made = [];
for (const person of PEOPLE) {
  const user = await ensureUser(person);
  await finishProfile(person, user.id);
  made.push({ ...person, id: user.id });
}

const dealer = made.find((person) => person.account_type === 'dealer');
const shopId = await ensureShop(dealer.id);

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

console.log('\nLocal accounts. Log in with email — the code fills in from Mailpit.\n');
for (const person of made) {
  console.log(`  ${person.email.padEnd(22)} @${person.handle.padEnd(6)} ${person.role}`);
}
console.log('\n  Mock Desk is claimed, with one watch: Fixture Message Test.');
console.log("  Goldfinger's is still unclaimed, so Email the shop still works there.");
console.log('  npm run db:reset removes these. Run npm run mock:users again.\n');
