/**
 * Row-level security tests against the local stack.
 *
 * RLS is the only thing standing between a buyer and every other buyer's data:
 * the anon key ships inside the app binary, so anyone can call the REST API with
 * it directly. These tests assert the rules from the buyer's side of the wire,
 * over HTTP, the same way the app hits them.
 *
 * Run with `npm run test:rls` while `supabase start` is up.
 */

import { config, serviceKey } from './_supabase.mjs';

const URL = config().url;
const ANON = config().anonKey;
const SERVICE = serviceKey();

let failures = 0;

function check(name, passed, detail = '') {
  if (passed) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function api(path, { token = ANON, method = 'GET', body, prefer } = {}) {
  const response = await fetch(`${URL}${path}`, {
    method,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function createUser(email) {
  await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123', email_confirm: true }),
  });

  const response = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123' }),
  });
  const session = await response.json();
  if (!session.access_token) throw new Error(`sign-in failed for ${email}: ${JSON.stringify(session)}`);
  return { token: session.access_token, id: session.user.id };
}

const stamp = Date.now();
const importer = await createUser(`importer-${stamp}@example.com`);
const buyer = await createUser(`buyer-${stamp}@example.com`);

console.log('\nprofiles');
{
  const { body } = await api(`/rest/v1/profiles?id=eq.${importer.id}`, { token: importer.token });
  check('a profile is created automatically on sign-up', Array.isArray(body) && body.length === 1);

  const { body: others } = await api(`/rest/v1/profiles?id=eq.${buyer.id}`, { token: importer.token });
  check("a user cannot read another user's profile", Array.isArray(others) && others.length === 0);

  check(
    'a new profile has not been onboarded',
    body[0]?.onboarded_at === null && body[0]?.favorite_brands.length === 0
  );

  const onboard = await api(`/rest/v1/profiles?id=eq.${buyer.id}`, {
    token: buyer.token,
    method: 'PATCH',
    body: { first_name: 'Ada', last_name: 'Byron', onboarded_at: new Date().toISOString() },
  });
  check('a user can finish their own onboarding', onboard.status < 300, `got ${onboard.status}`);

  // PATCH on a row RLS hides is a no-op, not an error, so read back to be sure.
  await api(`/rest/v1/profiles?id=eq.${buyer.id}`, {
    token: importer.token,
    method: 'PATCH',
    body: { first_name: 'Mallory' },
  });
  const { body: unchanged } = await api(`/rest/v1/profiles?id=eq.${buyer.id}`, {
    token: buyer.token,
  });
  check("a user cannot rename someone else's profile", unchanged[0]?.first_name === 'Ada');
}

console.log('\ndealers');
let dealerId;
{
  const escalation = await api('/rest/v1/dealers?select=id,name,permission', {
    token: importer.token,
    method: 'POST',
    body: { name: 'Self Approved', website: `https://evil-${stamp}.test`, created_by: importer.id, permission: 'approved' },
    prefer: 'return=representation',
  });
  check('a user cannot create a pre-approved dealer', escalation.status >= 400, `got ${escalation.status}`);

  const created = await api('/rest/v1/dealers?select=id,name,permission', {
    token: importer.token,
    method: 'POST',
    body: { name: 'Vintage Vault', website: `https://vault-${stamp}.test`, created_by: importer.id },
    prefer: 'return=representation',
  });
  check('a user can add a dealer', created.status === 201, `got ${created.status}`);
  dealerId = created.body?.[0]?.id;
  check('the new dealer starts pending', created.body?.[0]?.permission === 'pending');

  const selfApprove = await api(`/rest/v1/dealers?id=eq.${dealerId}&select=id,permission`, {
    token: importer.token,
    method: 'PATCH',
    body: { permission: 'approved' },
    prefer: 'return=representation',
  });
  const approved = selfApprove.status < 300 && selfApprove.body?.length > 0;
  check('a user cannot approve their own dealer', !approved, `status ${selfApprove.status}`);

  const rename = await api(`/rest/v1/dealers?id=eq.${dealerId}&select=id,name`, {
    token: importer.token,
    method: 'PATCH',
    body: { name: 'Renamed Shop' },
    prefer: 'return=representation',
  });
  check(
    'an importer can rename a dealer they added',
    rename.body?.[0]?.name === 'Renamed Shop',
    `status ${rename.status}`
  );

  const hijack = await api(`/rest/v1/dealers?id=eq.${dealerId}&select=id,name`, {
    token: buyer.token,
    method: 'PATCH',
    body: { name: 'Hijacked' },
    prefer: 'return=representation',
  });
  check(
    'a user cannot rename a dealer someone else added',
    !(hijack.status < 300 && hijack.body?.length > 0),
    `status ${hijack.status}`
  );
}

console.log('\nlistings');
let listingId;
{
  const created = await api('/rest/v1/listings', {
    token: importer.token,
    method: 'POST',
    body: { dealer_id: dealerId, imported_by: importer.id, brand: 'Omega', model: 'Speedmaster', price_cents: 1250000 },
    prefer: 'return=representation',
  });
  check('the importer can create a listing', created.status === 201, `got ${created.status}`);
  listingId = created.body?.[0]?.id;

  const mine = await api(`/rest/v1/listings?id=eq.${listingId}`, { token: importer.token });
  check('the importer can see their own pending listing', mine.body?.length === 1);

  const theirs = await api(`/rest/v1/listings?id=eq.${listingId}`, { token: buyer.token });
  check('a buyer cannot see a listing from a pending dealer', theirs.body?.length === 0);

  const deck = await api('/rest/v1/rpc/get_deck', { token: buyer.token, method: 'POST', body: { p_limit: 50 } });
  check('the deck excludes pending dealers', !deck.body?.some((row) => row.id === listingId));

  // The dealer filter takes an id straight from the caller. Asking for a shop
  // that is not approved must not become a way around the approval rule.
  const byDealer = await api('/rest/v1/rpc/search_listings', {
    token: buyer.token,
    method: 'POST',
    body: { p_limit: 50, p_dealers: [dealerId] },
  });
  check('filtering by a pending dealer returns nothing', byDealer.body?.length === 0);
}

console.log('\nafter approval');
{
  await fetch(`${URL}/rest/v1/dealers?id=eq.${dealerId}`, {
    method: 'PATCH',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permission: 'approved' }),
  });

  const theirs = await api(`/rest/v1/listings?id=eq.${listingId}`, { token: buyer.token });
  check('a buyer can see a listing from an approved dealer', theirs.body?.length === 1);

  const buyerDeck = await api('/rest/v1/rpc/get_deck', { token: buyer.token, method: 'POST', body: { p_limit: 50 } });
  check('the deck includes approved listings', buyerDeck.body?.some((row) => row.id === listingId));

  const importerDeck = await api('/rest/v1/rpc/get_deck', { token: importer.token, method: 'POST', body: { p_limit: 50 } });
  check('the deck never shows you your own import', !importerDeck.body?.some((row) => row.id === listingId));

  // Favourites rank the deck. If they ever start filtering it, this listing —
  // whose brand the buyer did not pick — disappears and the check fails.
  await api(`/rest/v1/profiles?id=eq.${buyer.id}`, {
    token: buyer.token,
    method: 'PATCH',
    body: { favorite_brands: ['a-brand-nobody-stocks'] },
  });
  const ranked = await api('/rest/v1/rpc/get_deck', { token: buyer.token, method: 'POST', body: { p_limit: 50 } });
  check(
    'favourite brands rank the deck without filtering it',
    ranked.body?.some((row) => row.id === listingId)
  );

  const tamper = await api(`/rest/v1/listings?id=eq.${listingId}`, {
    token: buyer.token,
    method: 'PATCH',
    body: { price_cents: 1 },
    prefer: 'return=representation',
  });
  check("a buyer cannot edit someone else's listing", !(tamper.status < 300 && tamper.body?.length > 0));
}

console.log('\nswipes');
{
  await api('/rest/v1/swipes', {
    token: buyer.token,
    method: 'POST',
    body: { actor_id: buyer.id, listing_id: listingId, direction: 'right' },
  });

  const deck = await api('/rest/v1/rpc/get_deck', { token: buyer.token, method: 'POST', body: { p_limit: 50 } });
  check('a swiped listing leaves the deck', !deck.body?.some((row) => row.id === listingId));

  const spoof = await api('/rest/v1/swipes', {
    token: buyer.token,
    method: 'POST',
    body: { actor_id: importer.id, listing_id: listingId, direction: 'left' },
    prefer: 'return=representation',
  });
  check('a user cannot swipe as someone else', spoof.status >= 400, `got ${spoof.status}`);

  const others = await api(`/rest/v1/swipes?actor_id=eq.${buyer.id}`, { token: importer.token });
  check("a user cannot read another user's swipes", others.body?.length === 0);

  // Starting over deletes rows, so the same isolation has to hold for delete.
  const passedId = deck.body?.[0]?.id;
  await api('/rest/v1/swipes', {
    token: buyer.token,
    method: 'POST',
    body: { actor_id: buyer.id, listing_id: passedId, direction: 'left' },
  });

  await api(`/rest/v1/swipes?actor_id=eq.${buyer.id}&direction=eq.left`, {
    token: importer.token,
    method: 'DELETE',
  });
  const survived = await api(`/rest/v1/swipes?actor_id=eq.${buyer.id}&direction=eq.left`, {
    token: buyer.token,
  });
  check("a user cannot delete another user's swipes", survived.body?.length === 1);

  await api(`/rest/v1/swipes?actor_id=eq.${buyer.id}&direction=eq.left`, {
    token: buyer.token,
    method: 'DELETE',
  });
  const mine = await api(`/rest/v1/swipes?actor_id=eq.${buyer.id}&select=direction`, {
    token: buyer.token,
  });
  check(
    'starting over clears the passes and keeps the saves',
    mine.body?.length === 1 && mine.body[0].direction === 'right'
  );
}

console.log('\ndealer contact and stats');
{
  const leak = await api(`/rest/v1/dealers?id=eq.${dealerId}&select=contact_email`, {
    token: buyer.token,
  });
  check("a buyer cannot read a dealer's contact address", leak.status >= 400, `got ${leak.status}`);

  const visible = await api(`/rest/v1/dealers?id=eq.${dealerId}&select=id,name`, {
    token: buyer.token,
  });
  check('a buyer can still read a dealer name', visible.body?.length === 1);

  const own = await api('/rest/v1/rpc/dealer_stats', {
    token: importer.token,
    method: 'POST',
    body: { p_dealer_id: dealerId },
  });
  check('an importer sees stats for their own dealer', own.status === 200, `got ${own.status}`);
  check(
    'stats count the swipe without naming who made it',
    own.body?.some((row) => row.saves === 1) && !JSON.stringify(own.body).includes(buyer.id)
  );

  const stranger = await api('/rest/v1/rpc/dealer_stats', {
    token: buyer.token,
    method: 'POST',
    body: { p_dealer_id: dealerId },
  });
  check(
    "a user cannot read stats for someone else's dealer",
    stranger.status >= 400,
    `got ${stranger.status}`
  );

  const signedOut = await api('/rest/v1/rpc/dealer_stats', {
    method: 'POST',
    body: { p_dealer_id: dealerId },
  });
  check('a signed-out visitor cannot read stats', signedOut.status >= 400, `got ${signedOut.status}`);
}

// The tests approve a dealer to prove the deck respects permission, which put
// fixtures in front of real users. Clean up rather than leave them there.
async function cleanUp() {
  const admin = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

  if (dealerId) {
    await fetch(`${URL}/rest/v1/dealers?id=eq.${dealerId}`, { method: 'DELETE', headers: admin });
  }
  for (const user of [importer, buyer]) {
    if (user?.id) {
      await fetch(`${URL}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers: admin });
    }
  }
}

await cleanUp();

console.log(failures === 0 ? '\nAll RLS checks passed.\n' : `\n${failures} RLS check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
