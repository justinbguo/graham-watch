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

// These tests create users, approve shops, and delete what they made. Against
// the hosted project that is a write to real data, and `config()` silently
// prefers SUPABASE_URL from the environment — so one exported variable, or
// `--env-file=scripts/.env.operator.local` copied from another script, is
// enough to point them at production.
if (!config().isLocal) {
  console.error(
    `\n  Refusing to run: ${config().url} is not the local stack.\n\n` +
      '  These tests write and delete data. Run them against `npm run db:start`\n' +
      '  and unset SUPABASE_URL.\n'
  );
  process.exit(1);
}

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
const dealerUser = await createUser(`dealer-${stamp}@example.com`);

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

console.log('\navatars');
{
  // 1×1 jpeg. The bytes only have to be a legal image type the bucket accepts.
  const jpeg = Uint8Array.from(
    atob(
      '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGf/9k='
    ),
    (c) => c.charCodeAt(0)
  );

  async function putAvatar(token, objectPath) {
    return fetch(`${URL}/storage/v1/object/avatars/${objectPath}`, {
      method: 'POST',
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'image/jpeg',
        'x-upsert': 'true',
      },
      body: jpeg,
    });
  }

  const own = await putAvatar(buyer.token, `${buyer.id}/avatar.jpg`);
  check('a user can upload their own avatar', own.ok, `got ${own.status}`);

  const hijack = await putAvatar(importer.token, `${buyer.id}/avatar.jpg`);
  check("a user cannot overwrite someone else's avatar", !hijack.ok, `got ${hijack.status}`);

  const read = await fetch(`${URL}/storage/v1/object/public/avatars/${buyer.id}/avatar.jpg`);
  check('an avatar is publicly readable by path', read.ok, `got ${read.status}`);
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
    body: {
      name: 'Vintage Vault',
      website: `https://vault-${stamp}.test`,
      contact_email: `dealer-${stamp}@example.com`,
      created_by: importer.id,
    },
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

console.log('\ndealer claims');
{
  const buyerAccounts = await api('/rest/v1/rpc/dealer_accounts', {
    token: buyer.token,
    method: 'POST',
    body: {},
  });
  check('a stranger is not offered another shop', buyerAccounts.body?.length === 0);

  const eligible = await api('/rest/v1/rpc/dealer_accounts', {
    token: dealerUser.token,
    method: 'POST',
    body: {},
  });
  check(
    'the matching contact account is offered the shop',
    eligible.body?.some((dealer) => dealer.id === dealerId && dealer.claimed === false)
  );

  const wrongClaim = await api('/rest/v1/rpc/claim_dealer', {
    token: buyer.token,
    method: 'POST',
    body: { p_dealer_id: dealerId },
  });
  check('a stranger cannot claim a shop', wrongClaim.status >= 400, `got ${wrongClaim.status}`);

  const claim = await api('/rest/v1/rpc/claim_dealer', {
    token: dealerUser.token,
    method: 'POST',
    body: { p_dealer_id: dealerId },
  });
  check('the matching contact account can claim the shop', claim.status === 200, `got ${claim.status}`);
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

  // A sold watch must leave every surface that offers something to buy, and stay
  // readable everywhere that only reports what already happened.
  await api(`/rest/v1/listings?id=eq.${listingId}`, {
    token: importer.token,
    method: 'PATCH',
    body: { sold_at: new Date().toISOString() },
  });

  const soldDeck = await api('/rest/v1/rpc/get_deck', { token: buyer.token, method: 'POST', body: { p_limit: 50 } });
  check('a sold listing leaves the deck', !soldDeck.body?.some((row) => row.id === listingId));

  const soldSearch = await api('/rest/v1/rpc/search_listings', {
    token: buyer.token,
    method: 'POST',
    body: { p_limit: 50, p_query: 'Speedmaster' },
  });
  check('a sold listing leaves search', !soldSearch.body?.some((row) => row.id === listingId));

  const soldFacets = await api('/rest/v1/rpc/listing_facets', { token: buyer.token, method: 'POST', body: {} });
  check(
    'a sold listing leaves the filter counts',
    !soldFacets.body?.some((row) => row.kind === 'brand' && row.label === 'Omega')
  );

  // Saved reads listings directly. Hiding a sold watch there would delete it out
  // of somebody's list with no explanation, so it has to stay legible.
  const stillReadable = await api(`/rest/v1/listings?id=eq.${listingId}&select=id,sold_at`, {
    token: buyer.token,
  });
  check(
    'a watch you saved stays readable after it sells',
    stillReadable.body?.length === 1 && stillReadable.body[0].sold_at !== null
  );

  await api(`/rest/v1/listings?id=eq.${listingId}`, {
    token: importer.token,
    method: 'PATCH',
    body: { sold_at: null },
  });

  const tamper = await api(`/rest/v1/listings?id=eq.${listingId}`, {
    token: buyer.token,
    method: 'PATCH',
    body: { price_cents: 1 },
    prefer: 'return=representation',
  });
  check("a buyer cannot edit someone else's listing", !(tamper.status < 300 && tamper.body?.length > 0));

  const poison = await api('/rest/v1/listings', {
    token: buyer.token,
    method: 'POST',
    body: {
      dealer_id: dealerId,
      imported_by: buyer.id,
      brand: 'Counterfeit',
      model: 'Injected',
    },
    prefer: 'return=representation',
  });
  check('a stranger cannot add inventory to an approved shop', poison.status >= 400, `got ${poison.status}`);

  const remove = await api(`/rest/v1/listings?id=eq.${listingId}&select=id,status`, {
    token: dealerUser.token,
    method: 'PATCH',
    body: { status: 'hidden' },
    prefer: 'return=representation',
  });
  check('a claimed dealer can remove its listing', remove.body?.[0]?.status === 'hidden');

  const hidden = await api(`/rest/v1/listings?id=eq.${listingId}`, { token: buyer.token });
  check('a removed listing is hidden from buyers', hidden.body?.length === 0);

  const ownedHidden = await api(`/rest/v1/listings?id=eq.${listingId}`, {
    token: dealerUser.token,
  });
  check('a claimed dealer can still read its removed listing', ownedHidden.body?.length === 1);

  // The shop's own inventory list shows a photograph for every watch, including
  // the ones it has taken out of the catalogue.
  await api('/rest/v1/listing_photos', {
    token: importer.token,
    method: 'POST',
    body: { listing_id: listingId, source_url: 'https://example.test/watch.jpg', position: 0 },
  });

  const ownedPhotos = await api(`/rest/v1/listing_photos?listing_id=eq.${listingId}`, {
    token: dealerUser.token,
  });
  check('a claimed dealer reads photos on a listing it did not import', ownedPhotos.body?.length === 1);

  const hiddenPhotos = await api(`/rest/v1/listing_photos?listing_id=eq.${listingId}`, {
    token: buyer.token,
  });
  check('a removed listing hides its photos from buyers', hiddenPhotos.body?.length === 0);

  await api(`/rest/v1/listings?id=eq.${listingId}`, {
    token: dealerUser.token,
    method: 'PATCH',
    body: { status: 'active' },
  });

  // brand is printed as written; brand_key is what every filter matches on. An
  // edit that left the old key would drop the watch out of its own brand filter.
  const renamed = await api(`/rest/v1/listings?id=eq.${listingId}&select=brand,brand_key`, {
    token: dealerUser.token,
    method: 'PATCH',
    body: { brand: 'Vacheron & Constantin' },
    prefer: 'return=representation',
  });
  check(
    'editing the brand recomputes the key filters use',
    renamed.body?.[0]?.brand_key === 'vacheronconstantin',
    `got ${renamed.body?.[0]?.brand_key}`
  );

  await api(`/rest/v1/listings?id=eq.${listingId}`, {
    token: dealerUser.token,
    method: 'PATCH',
    body: { brand: 'Omega' },
  });
}

console.log('\ncatalogue');
let syncedListingId;
{
  const typed = {
    brand: 'Heuer',
    model: 'Autavia',
    reference: 'FEED-1',
    complications: ['chronograph'],
    price_cents: 900000,
    currency: 'USD',
  };

  const created = await api('/rest/v1/source_items?select=id', {
    token: dealerUser.token,
    method: 'POST',
    body: {
      dealer_id: dealerId,
      provider: 'shopify',
      external_id: `shopify:${stamp}`,
      source_url: `https://vault-${stamp}.test/products/autavia`,
      raw: { title: 'Heuer Autavia' },
      text_hash: 't1',
      content_hash: 'c1',
      publish: true,
      extracted: typed,
      extracted_hash: 't1',
    },
    prefer: 'return=representation',
  });
  check('a shop can record its own catalogue', created.status === 201, `got ${created.status}`);
  const itemId = created.body?.[0]?.id;

  // A catalogue holds watches the shop has not published, at prices it has not
  // committed to. It is the shop's book, not the deck.
  const leak = await api(`/rest/v1/source_items?id=eq.${itemId}`, { token: buyer.token });
  check("a buyer cannot read a shop's catalogue", leak.body?.length === 0);

  const poison = await api('/rest/v1/source_items?select=id', {
    token: buyer.token,
    method: 'POST',
    body: {
      dealer_id: dealerId,
      provider: 'shopify',
      external_id: `evil:${stamp}`,
      source_url: 'https://evil.test/p/1',
      raw: {},
      text_hash: 'x',
      content_hash: 'x',
    },
    prefer: 'return=representation',
  });
  check('a stranger cannot add to a shop catalogue', poison.status >= 400, `got ${poison.status}`);

  const hijack = await api('/rest/v1/rpc/apply_source_item', {
    token: buyer.token,
    method: 'POST',
    body: { p_source_item_id: itemId },
  });
  check('a stranger cannot publish into a shop', hijack.status >= 400, `got ${hijack.status}`);

  const applied = await api('/rest/v1/rpc/apply_source_item', {
    token: dealerUser.token,
    method: 'POST',
    body: { p_source_item_id: itemId },
  });
  check('a shop can publish a catalogue item', applied.status === 200, `got ${applied.status}`);
  syncedListingId = applied.body;

  const published = await api(
    `/rest/v1/listings?id=eq.${syncedListingId}&select=brand,reference,edited_fields`,
    { token: dealerUser.token }
  );
  check(
    'publishing writes the typed fields',
    published.body?.[0]?.brand === 'Heuer' && published.body[0].reference === 'FEED-1'
  );
  check('a published listing starts with no hand edits', published.body?.[0]?.edited_fields.length === 0);

  // The whole point of edited_fields: a correction has to outlive the refresh
  // that would otherwise put the shop's own value back.
  const corrected = await api(
    `/rest/v1/listings?id=eq.${syncedListingId}&select=reference,edited_fields`,
    {
      token: dealerUser.token,
      method: 'PATCH',
      body: { reference: 'BY-HAND' },
      prefer: 'return=representation',
    }
  );
  check(
    'a hand edit records which column was corrected',
    corrected.body?.[0]?.edited_fields.includes('reference'),
    JSON.stringify(corrected.body?.[0]?.edited_fields)
  );

  await api(`/rest/v1/source_items?id=eq.${itemId}`, {
    token: dealerUser.token,
    method: 'PATCH',
    body: {
      extracted: { ...typed, reference: 'FEED-2', model: 'Autavia 2446', price_cents: 850000 },
      text_hash: 't2',
      extracted_hash: 't2',
      content_hash: 'c2',
    },
  });

  const refreshed = await api('/rest/v1/rpc/apply_source_item', {
    token: dealerUser.token,
    method: 'POST',
    body: { p_source_item_id: itemId },
  });
  check('a refresh re-applies without error', refreshed.status === 200, `got ${refreshed.status}`);

  const merged = await api(
    `/rest/v1/listings?id=eq.${syncedListingId}&select=reference,model,price_cents,edited_fields`,
    { token: dealerUser.token }
  );
  check('a refresh keeps a hand-corrected field', merged.body?.[0]?.reference === 'BY-HAND');
  check('a refresh updates a field nobody touched', merged.body?.[0]?.model === 'Autavia 2446');
  check('a refresh follows the shop on price', merged.body?.[0]?.price_cents === 850000);
  check(
    'a refresh is not mistaken for a hand edit',
    merged.body?.[0]?.edited_fields.length === 1,
    JSON.stringify(merged.body?.[0]?.edited_fields)
  );

  const strangerSweep = await api('/rest/v1/rpc/sync_source_availability', {
    token: buyer.token,
    method: 'POST',
    body: { p_dealer_id: dealerId, p_seen_ids: [itemId] },
  });
  check(
    "a stranger cannot sweep another shop's stock",
    strangerSweep.status >= 400,
    `got ${strangerSweep.status}`
  );

  await api(`/rest/v1/source_items?id=eq.${itemId}`, {
    token: dealerUser.token,
    method: 'PATCH',
    body: { available: false },
  });

  const swept = await api('/rest/v1/rpc/sync_source_availability', {
    token: dealerUser.token,
    method: 'POST',
    body: { p_dealer_id: dealerId, p_seen_ids: [itemId] },
  });
  check('a shop marking a watch gone retires the listing', swept.body === 1, `got ${JSON.stringify(swept.body)}`);

  const retired = await api(`/rest/v1/listings?id=eq.${syncedListingId}&select=sold_at`, {
    token: dealerUser.token,
  });
  check('the retired listing carries a sold date', retired.body?.[0]?.sold_at !== null);

  const strangerAdopt = await api('/rest/v1/rpc/adopt_existing_listings', {
    token: buyer.token,
    method: 'POST',
    body: { p_dealer_id: dealerId },
  });
  check(
    "a stranger cannot adopt another shop's listings",
    strangerAdopt.status >= 400,
    `got ${strangerAdopt.status}`
  );
}

console.log('\nswipes');
{
  // Passing needs a watch the buyer has not already saved, and the seed is
  // deliberately empty. Without this the pass tests ran against `undefined`.
  const spare = await api('/rest/v1/listings?select=id', {
    token: importer.token,
    method: 'POST',
    body: { dealer_id: dealerId, imported_by: importer.id, brand: 'Longines', model: 'Flagship' },
    prefer: 'return=representation',
  });
  const passedId = spare.body?.[0]?.id;

  await api('/rest/v1/swipes', {
    token: buyer.token,
    method: 'POST',
    body: { actor_id: buyer.id, listing_id: listingId, direction: 'right' },
  });

  const deck = await api('/rest/v1/rpc/get_deck', { token: buyer.token, method: 'POST', body: { p_limit: 50 } });
  check('a swiped listing leaves the deck', !deck.body?.some((row) => row.id === listingId));
  check('an unswiped listing stays in the deck', deck.body?.some((row) => row.id === passedId));

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

  // Undo is that same delete narrowed to one row. The watch has to be genuinely
  // unjudged afterwards, not merely hidden by the client.
  await api('/rest/v1/swipes', {
    token: buyer.token,
    method: 'POST',
    body: { actor_id: buyer.id, listing_id: passedId, direction: 'left' },
  });
  await api(`/rest/v1/swipes?actor_id=eq.${buyer.id}&listing_id=eq.${passedId}`, {
    token: buyer.token,
    method: 'DELETE',
  });
  const undone = await api('/rest/v1/rpc/get_deck', {
    token: buyer.token,
    method: 'POST',
    body: { p_limit: 50 },
  });
  check(
    'undoing a pass puts the watch back in the deck',
    undone.body?.some((row) => row.id === passedId)
  );
  check(
    'undoing a pass leaves the saved watch out of the deck',
    !undone.body?.some((row) => row.id === listingId)
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

console.log('\nclaiming by code');
let codeDealerId;
let unconfirmed;
let claimer;
let rival;
{
  const admin = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
  const shopHost = `codeshop-${stamp}.test`;

  // The shop publishes a Gmail address, which is the case the code flow exists
  // for: the dealer cannot sign in as the address on their own contact page.
  const created = await fetch(`${URL}/rest/v1/dealers?select=id`, {
    method: 'POST',
    headers: { ...admin, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({
      name: 'Code Shop',
      website: `https://www.${shopHost}/watches`,
      contact_email: `codeshop-${stamp}@gmail.test`,
      created_by: importer.id,
      permission: 'approved',
    }),
  }).then((r) => r.json());
  codeDealerId = created[0].id;

  claimer = await createUser(`claimer-${stamp}@personal.test`);
  rival = await createUser(`rival-${stamp}@personal.test`);

  // -------------------------------------------------------- takeover by sign-up
  // The old hole: sign up as the address the shop prints on its contact page and
  // claim_dealer hands over the shop, because confirmations being off made
  // GoTrue stamp email_confirmed_at at signup. Confirmations are on now, so the
  // signup yields no session at all and the claim is never reachable.
  //
  // The matching guard inside dealer_accounts and claim_dealer cannot be tested
  // from out here — it only fires for a session GoTrue now refuses to issue.
  const signUp = await fetch(`${URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `codeshop-${stamp}@gmail.test`, password: 'attacker-pw' }),
  }).then((r) => r.json());
  unconfirmed = { id: signUp.user?.id };

  check('signing up as the published address yields no session', !signUp.access_token);
  check(
    'the address is not treated as confirmed',
    !signUp.user?.email_confirmed_at,
    `got ${signUp.user?.email_confirmed_at}`
  );

  const passwordIn = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `codeshop-${stamp}@gmail.test`, password: 'attacker-pw' }),
  });
  check('and it cannot sign in either', passwordIn.status >= 400, `got ${passwordIn.status}`);

  // ------------------------------------------------------------- finding the shop
  const found = await api('/rest/v1/rpc/lookup_claimable_dealer', {
    token: claimer.token,
    method: 'POST',
    body: { p_website: shopHost },
  });
  check(
    'a bare domain finds the shop',
    found.body?.[0]?.id === codeDealerId,
    JSON.stringify(found.body)
  );
  check(
    'the published address comes back masked',
    found.body?.[0]?.contact_hint?.includes('•') &&
      !found.body?.[0]?.contact_hint?.includes(`codeshop-${stamp}@`),
    found.body?.[0]?.contact_hint
  );
  check('the claim host drops www', found.body?.[0]?.claim_host === shopHost);

  const noMatch = await api('/rest/v1/rpc/lookup_claimable_dealer', {
    token: claimer.token,
    method: 'POST',
    body: { p_website: `other-${stamp}.test` },
  });
  check('an unrelated domain finds nothing', noMatch.body?.length === 0);

  // ------------------------------------------------------------ who may hold a code
  const table = await api('/rest/v1/dealer_claim_codes?select=id', { token: claimer.token });
  check('codes are unreachable over REST', table.status >= 400, `got ${table.status}`);

  const selfIssued = await api('/rest/v1/rpc/store_dealer_claim_code', {
    token: claimer.token,
    method: 'POST',
    body: {
      p_dealer_id: codeDealerId,
      p_requested_by: claimer.id,
      p_email: `owner@${shopHost}`,
      p_code: '000000',
    },
  });
  check(
    'a user cannot issue themselves a code',
    selfIssued.status >= 400,
    `got ${selfIssued.status}`
  );

  // --------------------------------------------------------------- the domain rule
  const foreign = await api('/rest/v1/rpc/store_dealer_claim_code', {
    token: SERVICE,
    method: 'POST',
    body: {
      p_dealer_id: codeDealerId,
      p_requested_by: claimer.id,
      p_email: 'attacker@somewhere-else.test',
      p_code: '111111',
    },
  });
  check(
    'a code cannot be sent off the shop\'s domain',
    foreign.status >= 400,
    `got ${foreign.status}`
  );

  const parent = await api('/rest/v1/rpc/store_dealer_claim_code', {
    token: SERVICE,
    method: 'POST',
    body: {
      p_dealer_id: codeDealerId,
      p_requested_by: claimer.id,
      p_email: 'attacker@test',
      p_code: '111111',
    },
  });
  check(
    'the parent domain does not qualify',
    parent.status >= 400,
    `got ${parent.status}`
  );

  // -------------------------------------------------------------- spending a code
  const issue = (userId, code) =>
    api('/rest/v1/rpc/store_dealer_claim_code', {
      token: SERVICE,
      method: 'POST',
      body: {
        p_dealer_id: codeDealerId,
        p_requested_by: userId,
        p_email: `sales@${shopHost}`,
        p_code: code,
      },
    });

  const issued = await issue(claimer.id, '424242');
  check('a mailbox on the shop domain gets a code', issued.status === 200, `got ${issued.status}`);

  const spend = (token, code) =>
    api('/rest/v1/rpc/claim_dealer_with_code', {
      token,
      method: 'POST',
      body: { p_dealer_id: codeDealerId, p_code: code },
    });

  // The requester is part of the lookup, so a forwarded email is inert.
  const stolen = await spend(rival.token, '424242');
  check(
    'another account cannot spend a code it did not request',
    stolen.status >= 400,
    `got ${stolen.status}`
  );

  // Null, not an error, so the attempt commits and the guess is spent.
  const wrong = await spend(claimer.token, '999999');
  check('a wrong code claims nothing', wrong.body === null, `got ${wrong.status} ${wrong.body}`);

  const right = await spend(claimer.token, '424242');
  check('the right code claims the shop', right.status === 200, `got ${right.status}`);

  const owner = await fetch(`${URL}/rest/v1/dealers?id=eq.${codeDealerId}&select=claimed_by`, {
    headers: admin,
  }).then((r) => r.json());
  check('the shop belongs to the account that proved the mailbox', owner[0].claimed_by === claimer.id);

  const replay = await spend(claimer.token, '424242');
  check('the same code cannot be spent twice', replay.status >= 400, `got ${replay.status}`);

  const afterClaim = await issue(rival.id, '565656');
  check(
    'a claimed shop issues no further codes',
    afterClaim.status >= 400,
    `got ${afterClaim.status}`
  );

  // Five wrong guesses must burn a code, or six digits is only 1e6 requests.
  const burnDealer = await fetch(`${URL}/rest/v1/dealers?select=id`, {
    method: 'POST',
    headers: { ...admin, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({
      name: 'Burn Shop',
      website: `https://burnshop-${stamp}.test`,
      created_by: importer.id,
      permission: 'approved',
    }),
  }).then((r) => r.json());

  await api('/rest/v1/rpc/store_dealer_claim_code', {
    token: SERVICE,
    method: 'POST',
    body: {
      p_dealer_id: burnDealer[0].id,
      p_requested_by: rival.id,
      p_email: `sales@burnshop-${stamp}.test`,
      p_code: '313131',
    },
  });

  for (let guess = 0; guess < 5; guess++) {
    await api('/rest/v1/rpc/claim_dealer_with_code', {
      token: rival.token,
      method: 'POST',
      body: { p_dealer_id: burnDealer[0].id, p_code: '000000' },
    });
  }

  const burned = await api('/rest/v1/rpc/claim_dealer_with_code', {
    token: rival.token,
    method: 'POST',
    body: { p_dealer_id: burnDealer[0].id, p_code: '313131' },
  });
  check(
    'five wrong guesses burn the code even for the right one',
    burned.status >= 400,
    `got ${burned.status}`
  );

  await fetch(`${URL}/rest/v1/dealers?id=eq.${burnDealer[0].id}`, { method: 'DELETE', headers: admin });
}

console.log('\ninquiries');
{
  const admin = {
    apikey: SERVICE,
    Authorization: `Bearer ${SERVICE}`,
    'Content-Type': 'application/json',
  };

  const ask = (token, body) =>
    api('/rest/v1/inquiries', { token, method: 'POST', body, prefer: 'return=representation' });

  const forgedBuyer = await ask(buyer.token, {
    listing_id: listingId,
    dealer_id: dealerId,
    buyer_id: importer.id,
    message: 'Not from me.',
  });
  check('a buyer cannot ask as someone else', forgedBuyer.status >= 400, `got ${forgedBuyer.status}`);

  const preSent = await ask(buyer.token, {
    listing_id: listingId,
    dealer_id: dealerId,
    buyer_id: buyer.id,
    status: 'sent',
  });
  check('a buyer cannot open an inquiry already marked sent', preSent.status >= 400, `got ${preSent.status}`);

  // The mail goes to whichever shop the row names. Before the dealer_id was
  // tied to the listing, this was a way to send any shop an inquiry about a
  // watch they have never carried.
  const misdirected = await ask(buyer.token, {
    listing_id: listingId,
    dealer_id: codeDealerId,
    buyer_id: buyer.id,
    message: 'Wrong shop.',
  });
  check(
    'a buyer cannot name a shop that does not sell the watch',
    misdirected.status >= 400,
    `got ${misdirected.status}`
  );

  const real = await ask(buyer.token, {
    listing_id: listingId,
    dealer_id: dealerId,
    buyer_id: buyer.id,
    message: 'Is it still available?',
  });
  check('a buyer can ask about a watch from an approved shop', real.status === 201, `got ${real.status}`);
  const inquiryId = real.body?.[0]?.id;

  const twice = await ask(buyer.token, {
    listing_id: listingId,
    dealer_id: dealerId,
    buyer_id: buyer.id,
    message: 'Asking again.',
  });
  check('a buyer cannot ask twice about the same watch', twice.status >= 400, `got ${twice.status}`);

  // The importer added this shop and is not the one who proved the mailbox, so
  // the leads are not theirs to read. Adding a shop is not owning it.
  const nosy = await api(`/rest/v1/inquiries?id=eq.${inquiryId}`, { token: importer.token });
  check('the account that added the shop cannot read its inquiries', nosy.body?.length === 0);

  const own = await api(`/rest/v1/inquiries?id=eq.${inquiryId}`, { token: buyer.token });
  check('a buyer reads their own inquiry', own.body?.length === 1);

  // Only the send-inquiry function moves an inquiry to 'sent', and it does that
  // with the service role. A buyer marking their own would report a mail that
  // was never sent.
  await api(`/rest/v1/inquiries?id=eq.${inquiryId}`, {
    token: buyer.token,
    method: 'PATCH',
    body: { status: 'sent' },
  });
  const unsent = await api(`/rest/v1/inquiries?id=eq.${inquiryId}&select=status`, { token: buyer.token });
  check('a buyer cannot mark their own inquiry sent', unsent.body?.[0]?.status === 'pending');

  await api(`/rest/v1/inquiries?id=eq.${inquiryId}`, { token: buyer.token, method: 'DELETE' });
  const survived = await api(`/rest/v1/inquiries?id=eq.${inquiryId}`, { token: buyer.token });
  check('a buyer cannot delete an inquiry', survived.body?.length === 1);

  // dealerUser proved this shop's mailbox back in the claims section, so the
  // lead is theirs to read.
  const afterClaim = await api(`/rest/v1/inquiries?id=eq.${inquiryId}`, { token: dealerUser.token });
  check('the shop that claimed reads its own inquiries', afterClaim.body?.length === 1);

  // And loses it the moment the claim is lifted, which is how an operator hands
  // a shop to a different account.
  await fetch(`${URL}/rest/v1/dealers?id=eq.${dealerId}`, {
    method: 'PATCH',
    headers: admin,
    body: JSON.stringify({ claimed_by: null }),
  });
  const unclaimed = await api(`/rest/v1/inquiries?id=eq.${inquiryId}`, { token: dealerUser.token });
  check('an unclaimed shop has nobody reading its inquiries', unclaimed.body?.length === 0);

  await fetch(`${URL}/rest/v1/dealers?id=eq.${dealerId}`, {
    method: 'PATCH',
    headers: admin,
    body: JSON.stringify({ claimed_by: dealerUser.id }),
  });

  // A watch nobody can buy must not generate mail. Both conditions are checked
  // by the insert policy, so the app hiding the button is the second line, not
  // the only one.
  await fetch(`${URL}/rest/v1/listings?id=eq.${listingId}`, {
    method: 'PATCH',
    headers: admin,
    body: JSON.stringify({ sold_at: new Date().toISOString() }),
  });
  const sold = await ask(dealerUser.token, {
    listing_id: listingId,
    dealer_id: dealerId,
    buyer_id: dealerUser.id,
    message: 'Sold already?',
  });
  check('a sold watch cannot be asked about', sold.status >= 400, `got ${sold.status}`);

  await fetch(`${URL}/rest/v1/listings?id=eq.${listingId}`, {
    method: 'PATCH',
    headers: admin,
    body: JSON.stringify({ sold_at: null }),
  });

  await fetch(`${URL}/rest/v1/dealers?id=eq.${dealerId}`, {
    method: 'PATCH',
    headers: admin,
    body: JSON.stringify({ permission: 'revoked' }),
  });
  const revoked = await ask(dealerUser.token, {
    listing_id: listingId,
    dealer_id: dealerId,
    buyer_id: dealerUser.id,
    message: 'Still trading?',
  });
  check('a revoked shop stops receiving inquiries', revoked.status >= 400, `got ${revoked.status}`);

  await fetch(`${URL}/rest/v1/dealers?id=eq.${dealerId}`, {
    method: 'PATCH',
    headers: admin,
    body: JSON.stringify({ permission: 'approved' }),
  });
}

console.log('\nimport job ledger');
{
  const admin = {
    apikey: SERVICE,
    Authorization: `Bearer ${SERVICE}`,
    'Content-Type': 'application/json',
  };

  const seeded = await fetch(`${URL}/rest/v1/import_jobs`, {
    method: 'POST',
    headers: { ...admin, Prefer: 'return=representation' },
    body: JSON.stringify({
      user_id: importer.id,
      dealer_id: dealerId,
      source_url: `https://vault-${stamp}.test`,
      provider: 'fetch',
      status: 'succeeded',
    }),
  });
  const jobId = (await seeded.json())?.[0]?.id;

  const own = await api(`/rest/v1/import_jobs?id=eq.${jobId}`, { token: importer.token });
  check('a user reads their own import history', own.body?.length === 1);

  const nosy = await api(`/rest/v1/import_jobs?id=eq.${jobId}`, { token: buyer.token });
  check("a user cannot read another user's import history", nosy.body?.length === 0);

  // The ledger meters what an account has spent on scrape credits and model
  // calls. Anything the spender can write, the spender can forge.
  const forged = await api('/rest/v1/import_jobs', {
    token: importer.token,
    method: 'POST',
    body: {
      user_id: importer.id,
      dealer_id: dealerId,
      source_url: 'https://forged.test',
      provider: 'fetch',
      status: 'succeeded',
    },
    prefer: 'return=representation',
  });
  check('a user cannot write their own ledger row', forged.status >= 400, `got ${forged.status}`);

  // The budget counts recent rows, so a delete is a way to buy another hour.
  await api(`/rest/v1/import_jobs?id=eq.${jobId}`, { token: importer.token, method: 'DELETE' });
  const survived = await api(`/rest/v1/import_jobs?id=eq.${jobId}`, { token: importer.token });
  check('a user cannot erase their own ledger row', survived.body?.length === 1);

  await api(`/rest/v1/import_jobs?id=eq.${jobId}`, {
    token: importer.token,
    method: 'PATCH',
    body: { created_at: '2020-01-01T00:00:00Z' },
  });
  const unmoved = await api(`/rest/v1/import_jobs?id=eq.${jobId}&select=created_at`, {
    token: importer.token,
  });
  check(
    'a user cannot backdate their own ledger row',
    !unmoved.body?.[0]?.created_at?.startsWith('2020')
  );

  await fetch(`${URL}/rest/v1/import_jobs?id=eq.${jobId}`, { method: 'DELETE', headers: admin });
}

console.log('\nreplacing a gallery');
{
  const admin = {
    apikey: SERVICE,
    Authorization: `Bearer ${SERVICE}`,
    'Content-Type': 'application/json',
  };

  const replace = (token, photos) =>
    api('/rest/v1/rpc/replace_listing_photos', {
      token,
      method: 'POST',
      body: { p_listing_id: listingId, p_photos: photos },
    });

  const gallery = [
    { source_url: 'https://shop.test/1.jpg', storage_path: null, position: 0 },
    { source_url: 'https://shop.test/2.jpg', storage_path: null, position: 1 },
  ];

  const mine = await replace(importer.token, gallery);
  check('the importer replaces their own gallery', mine.body === 2, `got ${JSON.stringify(mine.body)}`);

  const stranger = await replace(buyer.token, gallery);
  check('a stranger cannot replace a gallery', stranger.status >= 400, `got ${stranger.status}`);

  // The reason this is an RPC. dealerUser claimed this shop but did not import
  // it, so they are not the listing's importer — the photo write policy refused
  // them, and every refresh they ran silently left the gallery as it was.
  const claimed = await replace(dealerUser.token, [gallery[0]]);
  check(
    'a dealer who claimed the shop replaces the gallery',
    claimed.body === 1,
    `got ${JSON.stringify(claimed.body)}`
  );

  const left = await api(`/rest/v1/listing_photos?listing_id=eq.${listingId}&select=position`, {
    token: buyer.token,
  });
  check('replacing a shorter gallery leaves no tail behind', left.body?.length === 1);
}

console.log('\ndealer applications');
let applicant;
let applicationId;
{
  const admin = {
    apikey: SERVICE,
    Authorization: `Bearer ${SERVICE}`,
    'Content-Type': 'application/json',
  };

  applicant = await createUser(`applicant-${stamp}@personal.test`);
  const applyHost = `applyshop-${stamp}.test`;

  const file = (token, overrides = {}) =>
    api('/rest/v1/dealer_applications', {
      token,
      method: 'POST',
      prefer: 'return=representation',
      body: {
        user_id: applicant.id,
        shop_name: 'Apply Shop',
        website: `https://${applyHost}`,
        brands: ['Heuer', 'Universal Genève'],
        volume: '10_to_50',
        ...overrides,
      },
    });

  // ------------------------------------------------------- what may be filed
  const asOther = await file(rival.token);
  check('a user cannot apply as someone else', asOther.status >= 400, `got ${asOther.status}`);

  const preVerified = await file(applicant.token, {
    verified_email: `owner@${applyHost}`,
    verified_at: new Date().toISOString(),
  });
  check(
    'an applicant cannot file an already-verified application',
    preVerified.status >= 400,
    `got ${preVerified.status}`
  );

  const preApproved = await file(applicant.token, { status: 'approved' });
  check(
    'an applicant cannot file an already-approved application',
    preApproved.status >= 400,
    `got ${preApproved.status}`
  );

  // Pointing a fresh application at a shop that already exists would hand the
  // applicant a claimed_by the moment an operator approved it.
  const preLinked = await file(applicant.token, { dealer_id: dealerId });
  check(
    'an applicant cannot file an application against an existing shop',
    preLinked.status >= 400,
    `got ${preLinked.status}`
  );

  const filed = await file(applicant.token);
  check('an applicant files their own application', filed.status === 201, `got ${filed.status}`);
  applicationId = filed.body?.[0]?.id;
  check('a filed application starts pending and unverified', 
    filed.body?.[0]?.status === 'pending' && filed.body?.[0]?.verified_at === null);

  const second = await file(applicant.token);
  check(
    'one live application per account',
    second.status >= 400,
    `got ${second.status}`
  );

  // ------------------------------------------------------------ who may read
  const mine = await api(`/rest/v1/dealer_applications?id=eq.${applicationId}`, {
    token: applicant.token,
  });
  check('an applicant reads their own application', mine.body?.length === 1);

  const theirs = await api(`/rest/v1/dealer_applications?id=eq.${applicationId}`, {
    token: rival.token,
  });
  check('a stranger cannot read an application', theirs.body?.length === 0);

  // --------------------------------------------------- who may answer it
  await api(`/rest/v1/dealer_applications?id=eq.${applicationId}`, {
    token: applicant.token,
    method: 'PATCH',
    body: { status: 'approved' },
  });
  const unchanged = await api(
    `/rest/v1/dealer_applications?id=eq.${applicationId}&select=status`,
    { token: applicant.token }
  );
  check(
    'an applicant cannot approve their own application',
    unchanged.body?.[0]?.status === 'pending',
    JSON.stringify(unchanged.body)
  );

  await api(`/rest/v1/dealer_applications?id=eq.${applicationId}`, {
    token: applicant.token,
    method: 'DELETE',
  });
  const survived = await api(`/rest/v1/dealer_applications?id=eq.${applicationId}`, {
    token: applicant.token,
  });
  check('an applicant cannot delete their own application', survived.body?.length === 1);

  // ------------------------------------------------------ proving the mailbox
  const selfIssued = await api('/rest/v1/rpc/store_application_claim_code', {
    token: applicant.token,
    method: 'POST',
    body: {
      p_application_id: applicationId,
      p_requested_by: applicant.id,
      p_email: `owner@${applyHost}`,
      p_code: '000000',
    },
  });
  check(
    'an applicant cannot issue themselves a code',
    selfIssued.status >= 400,
    `got ${selfIssued.status}`
  );

  const issue = (applicationTarget, userId, code) =>
    api('/rest/v1/rpc/store_application_claim_code', {
      token: SERVICE,
      method: 'POST',
      body: {
        p_application_id: applicationTarget,
        p_requested_by: userId,
        p_email: `owner@${applyHost}`,
        p_code: code,
      },
    });

  const foreign = await api('/rest/v1/rpc/store_application_claim_code', {
    token: SERVICE,
    method: 'POST',
    body: {
      p_application_id: applicationId,
      p_requested_by: applicant.id,
      p_email: 'attacker@somewhere-else.test',
      p_code: '111111',
    },
  });
  check(
    'a code cannot be sent off the applied domain',
    foreign.status >= 400,
    `got ${foreign.status}`
  );

  const notMine = await issue(applicationId, rival.id, '222222');
  check(
    'a code cannot be issued for an application you did not file',
    notMine.status >= 400,
    `got ${notMine.status}`
  );

  const issued = await issue(applicationId, applicant.id, '424242');
  check('a mailbox on the applied domain gets a code', issued.status === 200, `got ${issued.status}`);

  const spend = (token, code) =>
    api('/rest/v1/rpc/verify_application_email', {
      token,
      method: 'POST',
      body: { p_application_id: applicationId, p_code: code },
    });

  const byRival = await spend(rival.token, '424242');
  check(
    'another account cannot spend a code it did not request',
    byRival.status >= 400,
    `got ${byRival.status}`
  );

  const wrong = await spend(applicant.token, '999999');
  check('a wrong code verifies nothing', wrong.body === null, `got ${wrong.status} ${wrong.body}`);

  const right = await spend(applicant.token, '424242');
  check(
    'the right code stamps the proved mailbox',
    right.body === `owner@${applyHost}`,
    `got ${right.status} ${JSON.stringify(right.body)}`
  );

  const verified = await api(
    `/rest/v1/dealer_applications?id=eq.${applicationId}&select=verified_email,verified_at,status`,
    { token: applicant.token }
  );
  check(
    'verification does not approve the application',
    verified.body?.[0]?.verified_email === `owner@${applyHost}` &&
      verified.body?.[0]?.verified_at !== null &&
      verified.body?.[0]?.status === 'pending'
  );

  const replay = await spend(applicant.token, '424242');
  check('the same code cannot be spent twice', replay.status >= 400, `got ${replay.status}`);

  // Verifying grants nothing on its own. Until an operator creates the shop
  // there is no dealers row to own, which is the whole point of the ordering.
  const accounts = await api('/rest/v1/rpc/dealer_accounts', {
    token: applicant.token,
    method: 'POST',
  });
  check(
    'a verified applicant owns no shop yet',
    Array.isArray(accounts.body) && accounts.body.length === 0,
    JSON.stringify(accounts.body)
  );

  await fetch(`${URL}/rest/v1/dealer_applications?id=eq.${applicationId}`, {
    method: 'DELETE',
    headers: admin,
  });
}

console.log('\nanswering an application');
let accepter;
let decliner;
let acceptedDealerId;
{
  const admin = {
    apikey: SERVICE,
    Authorization: `Bearer ${SERVICE}`,
    'Content-Type': 'application/json',
  };

  accepter = await createUser(`accepted-${stamp}@personal.test`);
  decliner = await createUser(`declined-${stamp}@personal.test`);

  // One application, proved, ready for an operator — the state `accept` needs.
  const fileFor = async (user, host, shopName) => {
    const filed = await api('/rest/v1/dealer_applications', {
      token: user.token,
      method: 'POST',
      prefer: 'return=representation',
      body: {
        user_id: user.id,
        shop_name: shopName,
        website: `https://${host}`,
        brands: ['Omega'],
        volume: 'under_10',
      },
    });
    return filed.body?.[0]?.id;
  };

  const prove = async (user, applicationId, host) => {
    await api('/rest/v1/rpc/store_application_claim_code', {
      token: SERVICE,
      method: 'POST',
      body: {
        p_application_id: applicationId,
        p_requested_by: user.id,
        p_email: `owner@${host}`,
        p_code: '313131',
      },
    });
    return api('/rest/v1/rpc/verify_application_email', {
      token: user.token,
      method: 'POST',
      body: { p_application_id: applicationId, p_code: '313131' },
    });
  };

  const acceptHost = `accepted-${stamp}.test`;
  const acceptId = await fileFor(accepter, acceptHost, 'Accepted Watches');

  const answer = (token, applicationId, permission = 'approved') =>
    api('/rest/v1/rpc/approve_dealer_application', {
      token,
      method: 'POST',
      body: {
        p_application_id: applicationId,
        p_created_by: importer.id,
        p_permission: permission,
      },
    });

  const bySelf = await answer(accepter.token, acceptId);
  check(
    'an applicant cannot accept their own application',
    bySelf.status >= 400,
    `got ${bySelf.status}`
  );

  const unproved = await answer(SERVICE, acceptId);
  check(
    'an unproved application cannot be accepted',
    unproved.status >= 400,
    `got ${unproved.status} ${JSON.stringify(unproved.body)}`
  );

  await prove(accepter, acceptId, acceptHost);

  const accepted = await answer(SERVICE, acceptId);
  check(
    'a proved application becomes a shop',
    accepted.status === 200 && typeof accepted.body === 'string',
    `got ${accepted.status} ${JSON.stringify(accepted.body)}`
  );
  acceptedDealerId = accepted.body;

  const shop = await api(
    `/rest/v1/dealers?id=eq.${acceptedDealerId}&select=name,claimed_by,contact_email,permission`,
    { token: SERVICE }
  );
  check(
    'the shop is claimed by the applicant',
    shop.body?.[0]?.claimed_by === accepter.id,
    JSON.stringify(shop.body)
  );
  check(
    'the proved mailbox becomes the contact address',
    shop.body?.[0]?.contact_email === `owner@${acceptHost}`,
    JSON.stringify(shop.body)
  );

  // The dealer flow's whole point: the applicant now owns a shop they can
  // manage, without ever proving the same mailbox a second time.
  const owned = await api('/rest/v1/rpc/dealer_accounts', {
    token: accepter.token,
    method: 'POST',
  });
  check(
    'the applicant can now manage their shop',
    owned.body?.length === 1 && owned.body[0].claimed === true,
    JSON.stringify(owned.body)
  );

  const twice = await answer(SERVICE, acceptId);
  check('an answered application cannot be accepted twice', twice.status >= 400, `got ${twice.status}`);

  // ------------------------------------------------------------------ decline
  const declineHost = `declined-${stamp}.test`;
  const declineId = await fileFor(decliner, declineHost, 'Declined Watches');
  await prove(decliner, declineId, declineHost);

  const noNote = await api('/rest/v1/rpc/decline_dealer_application', {
    token: SERVICE,
    method: 'POST',
    body: { p_application_id: declineId, p_note: '   ' },
  });
  check('a decline needs a reason', noNote.status >= 400, `got ${noNote.status}`);

  const bySelfDecline = await api('/rest/v1/rpc/decline_dealer_application', {
    token: decliner.token,
    method: 'POST',
    body: { p_application_id: declineId, p_note: 'let me in' },
  });
  check(
    'an applicant cannot answer their own application',
    bySelfDecline.status >= 400,
    `got ${bySelfDecline.status}`
  );

  const declined = await api('/rest/v1/rpc/decline_dealer_application', {
    token: SERVICE,
    method: 'POST',
    body: { p_application_id: declineId, p_note: 'Not a dealer site.' },
  });
  check('an operator can decline', declined.status < 300, `got ${declined.status}`);

  const read = await api('/rest/v1/rpc/my_dealer_application', {
    token: decliner.token,
    method: 'POST',
  });
  check(
    'the applicant reads why they were declined',
    read.body?.[0]?.status === 'declined' && read.body?.[0]?.note === 'Not a dealer site.',
    JSON.stringify(read.body?.[0])
  );

  // A decline is final for that attempt but not for the account.
  const again = await fileFor(decliner, `retry-${stamp}.test`, 'Second Try');
  check('a declined applicant can apply again', Boolean(again));

  for (const id of [acceptId, declineId, again]) {
    await fetch(`${URL}/rest/v1/dealer_applications?id=eq.${id}`, {
      method: 'DELETE',
      headers: admin,
    });
  }
}

// The tests approve a dealer to prove the deck respects permission, which put
// fixtures in front of real users. Clean up rather than leave them there.
async function cleanUp() {
  const admin = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

  for (const id of [dealerId, codeDealerId, acceptedDealerId]) {
    if (id) await fetch(`${URL}/rest/v1/dealers?id=eq.${id}`, { method: 'DELETE', headers: admin });
  }
  for (const user of [
    importer,
    buyer,
    dealerUser,
    claimer,
    rival,
    unconfirmed,
    applicant,
    accepter,
    decliner,
  ]) {
    if (user?.id) {
      await fetch(`${URL}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers: admin });
    }
  }
}

await cleanUp();

console.log(failures === 0 ? '\nAll RLS checks passed.\n' : `\n${failures} RLS check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
