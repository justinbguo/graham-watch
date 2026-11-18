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

import { spawnSync } from 'node:child_process';

import { isLocalUrl, localStatus } from './_env.mjs';
import { config, serviceKey } from './_supabase.mjs';

// These tests create users, approve shops, and delete what they made. Against
// the hosted project that is a write to real data. `npm run test:rls` pins
// GRAHAM_TARGET=local, but an exported SUPABASE_URL still wins over it, so the
// address is checked here as well.
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

async function attachGallery(listingId, count = 3) {
  const rows = [];
  for (let position = 0; position < count; position += 1) {
    rows.push({
      listing_id: listingId,
      position,
      source_url: `https://photos.test/${listingId}/${position}.jpg`,
    });
  }
  const written = await fetch(`${URL}/rest/v1/listing_photos`, {
    method: 'POST',
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  });
  return written.status;
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
    body[0]?.onboarded_at === null &&
      body[0]?.favorite_brands.length === 0 &&
      body[0]?.date_of_birth === null &&
      body[0]?.notifications_enabled === false &&
      body[0]?.search_pain_points.length === 0
  );

  const adult = '1990-05-01';
  // Finishing onboarding requires a handle (20260925000001). Claim it first so
  // the profile patch below is not refused for a missing username.
  const claimed = await api('/rest/v1/rpc/claim_username', {
    token: buyer.token,
    method: 'POST',
    body: { candidate: `ada${String(stamp).slice(-6)}` },
  });
  check('a user can claim a username', claimed.status < 300, `got ${claimed.status}`);

  const onboard = await api(`/rest/v1/profiles?id=eq.${buyer.id}`, {
    token: buyer.token,
    method: 'PATCH',
    body: {
      first_name: 'Ada',
      last_name: 'Byron',
      date_of_birth: adult,
      account_type: 'buyer',
      collection_size: 'two_to_three',
      search_pain_points: ['verifying_originality', 'finding_fair_prices'],
      notifications_enabled: true,
      onboarded_at: new Date().toISOString(),
    },
  });
  check('a user can finish their own onboarding', onboard.status < 300, `got ${onboard.status}`);

  const { body: saved } = await api(`/rest/v1/profiles?id=eq.${buyer.id}`, { token: buyer.token });
  check(
    'onboarding stores birthday, collection, pain points, and notification permission',
    saved[0]?.date_of_birth === adult &&
      saved[0]?.collection_size === 'two_to_three' &&
      saved[0]?.search_pain_points?.[0] === 'verifying_originality' &&
      saved[0]?.notifications_enabled === true
  );

  const tooYoung = `${new Date().getFullYear() - 10}-01-01`;
  const underage = await api(`/rest/v1/profiles?id=eq.${importer.id}`, {
    token: importer.token,
    method: 'PATCH',
    body: {
      first_name: 'Kid',
      last_name: 'Buyer',
      date_of_birth: tooYoung,
      account_type: 'buyer',
      onboarded_at: new Date().toISOString(),
    },
  });
  check(
    'a user under 18 cannot finish onboarding',
    underage.status >= 400,
    `got ${underage.status}`
  );

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
let dropDealerId;
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

  const bare = await api(`/rest/v1/listings?id=eq.${listingId}`, { token: buyer.token });
  check('a buyer cannot see an approved listing with no photographs', bare.body?.length === 0);

  const attached = await attachGallery(listingId);
  check('the proof listing gets a three-photo gallery', attached >= 200 && attached < 300, `got ${attached}`);

  const thin = await api(`/rest/v1/listings?id=eq.${listingId}`, { token: buyer.token });
  check('a buyer can see a listing from an approved dealer', thin.body?.length === 1);

  const buyerDeck = await api('/rest/v1/rpc/get_deck', { token: buyer.token, method: 'POST', body: { p_limit: 50 } });
  check('the deck includes approved listings', buyerDeck.body?.some((row) => row.id === listingId));

  const importerDeck = await api('/rest/v1/rpc/get_deck', { token: importer.token, method: 'POST', body: { p_limit: 50 } });
  check(
    'the deck keeps a listing you imported until you claim the shop',
    importerDeck.body?.some((row) => row.id === listingId)
  );

  const ownerDeck = await api('/rest/v1/rpc/get_deck', { token: dealerUser.token, method: 'POST', body: { p_limit: 50 } });
  check(
    'the deck hides listings from a shop you claimed',
    !ownerDeck.body?.some((row) => row.id === listingId)
  );

  const buyerSearch = await api('/rest/v1/rpc/search_listings', {
    token: buyer.token,
    method: 'POST',
    body: { p_limit: 50, p_exclude_own: false, p_query: 'Speedmaster' },
  });
  check('search includes an approved shop', buyerSearch.body?.some((row) => row.id === listingId));

  const importerDefault = await api('/rest/v1/rpc/search_listings', {
    token: importer.token,
    method: 'POST',
    body: { p_limit: 50, p_query: 'Speedmaster' },
  });
  check(
    'search keeps a listing you imported when you have not claimed the shop',
    importerDefault.body?.some((row) => row.id === listingId)
  );

  const importerSearch = await api('/rest/v1/rpc/search_listings', {
    token: importer.token,
    method: 'POST',
    body: { p_limit: 50, p_exclude_own: false, p_query: 'Speedmaster' },
  });
  check(
    'search includes a shop you imported',
    importerSearch.body?.some((row) => row.id === listingId)
  );

  const importerFacets = await api('/rest/v1/rpc/listing_facets', {
    token: importer.token,
    method: 'POST',
    body: { p_exclude_own: false },
  });
  check(
    'search filters include a dealer you imported',
    importerFacets.body?.some((row) => row.kind === 'dealer' && row.value === dealerId)
  );

  const importerCount = await api('/rest/v1/rpc/listing_counts', {
    token: importer.token,
    method: 'POST',
    body: { p_exclude_own: false, p_query: 'Speedmaster' },
  });
  const importerDefaultCount = await api('/rest/v1/rpc/listing_counts', {
    token: importer.token,
    method: 'POST',
    body: { p_query: 'Speedmaster' },
  });
  const counted = Number(importerCount.body?.[0]?.matched ?? 0);
  const omitted = Number(importerDefaultCount.body?.[0]?.matched ?? 0);
  check(
    'importing a listing does not change your deck count',
    counted === omitted && counted >= 1,
    `exclude_own false ${counted}, default ${omitted}`
  );

  const claimantAll = await api('/rest/v1/rpc/listing_counts', {
    token: dealerUser.token,
    method: 'POST',
    body: { p_exclude_own: false, p_query: 'Speedmaster' },
  });
  const claimantOwn = await api('/rest/v1/rpc/listing_counts', {
    token: dealerUser.token,
    method: 'POST',
    body: { p_query: 'Speedmaster' },
  });
  check(
    'claiming a shop removes its watches from your deck count',
    Number(claimantAll.body?.[0]?.matched ?? 0) > Number(claimantOwn.body?.[0]?.matched ?? 0),
    `all ${claimantAll.body?.[0]?.matched}, own excluded ${claimantOwn.body?.[0]?.matched}`
  );

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
  //
  // The brand's count is read first rather than assumed to be one. Any real
  // inventory in the database — the snapshot seed, or a shop imported by hand —
  // stocks its own Omegas, so demanding the brand vanish outright only ever
  // held on an empty database.
  const brandCount = async () => {
    const facets = await api('/rest/v1/rpc/listing_facets', {
      token: buyer.token,
      method: 'POST',
      body: {},
    });
    return facets.body?.find((row) => row.kind === 'brand' && row.label === 'Omega')?.count ?? 0;
  };
  const omegasBefore = await brandCount();

  // Marked by the account that claimed the shop. Importing it first is not a
  // standing permission over someone else's stock.
  await api(`/rest/v1/listings?id=eq.${listingId}`, {
    token: dealerUser.token,
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

  const omegasAfter = await brandCount();
  check(
    'a sold listing leaves the filter counts',
    omegasAfter === omegasBefore - 1,
    `Omega went from ${omegasBefore} to ${omegasAfter}`
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
    token: dealerUser.token,
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
  check('a claimed dealer reads photos on a listing it did not import', ownedPhotos.body?.length >= 1);

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
let itemId;
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
  itemId = created.body?.[0]?.id;

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

  // Hashes agree and nothing has been copied yet. The queue still has to
  // offer the watch, or a gallery that failed to record stays blank forever.
  const bareQueue = await fetch(`${URL}/rest/v1/rpc/pending_source_items`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_dealer_id: dealerId, p_limit: 25 }),
  });
  const bareRows = await bareQueue.json();
  check(
    'a published watch with no photographs stays queued',
    bareQueue.status < 300 && Array.isArray(bareRows) && bareRows.some((row) => row.id === itemId),
    `got ${bareQueue.status} ${JSON.stringify(bareRows)?.slice(0, 180)}`
  );
  const unstamped = bareRows.find((row) => row.id === itemId);
  check(
    'apply_source_item does not stamp applied_hash before the gallery',
    unstamped?.applied_hash == null,
    `applied_hash ${unstamped?.applied_hash}`
  );

  const scheduledWrite = await fetch(`${URL}/rest/v1/rpc/replace_listing_photos`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_listing_id: syncedListingId,
      p_photos: [
        { source_url: 'https://shop.test/a.jpg', storage_path: `${syncedListingId}/0.jpg`, position: 0 },
      ],
    }),
  });
  const scheduledWritten = await scheduledWrite.json();
  check(
    'the nightly refresh, which has no signed-in user, writes the gallery',
    scheduledWrite.status < 300 && scheduledWritten === 1,
    `got ${scheduledWrite.status} ${JSON.stringify(scheduledWritten)}`
  );

  const filledQueue = await fetch(`${URL}/rest/v1/rpc/pending_source_items`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_dealer_id: dealerId, p_limit: 25 }),
  });
  const filledRows = await filledQueue.json();
  check(
    'one photograph does not finish the gallery',
    filledQueue.status < 300 && Array.isArray(filledRows) && filledRows.some((row) => row.id === itemId),
    `got ${filledQueue.status} ${JSON.stringify(filledRows)?.slice(0, 180)}`
  );

  await fetch(`${URL}/rest/v1/listing_photos`, {
    method: 'POST',
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify([1, 2].map((position) => ({
      listing_id: syncedListingId,
      position,
      source_url: `https://shop.test/${position}.jpg`,
    }))),
  });
  const three = await fetch(`${URL}/rest/v1/rpc/pending_source_items`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_dealer_id: dealerId, p_limit: 25 }),
  });
  const threeRows = await three.json();
  check(
    'three photographs stay queued until the hashes are stamped',
    three.status < 300 && Array.isArray(threeRows) && threeRows.some((row) => row.id === itemId),
    `got ${three.status}`
  );
  await fetch(`${URL}/rest/v1/source_items?id=eq.${itemId}`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ applied_hash: 'c1', photos_hash: 'gallery' }),
  });
  const finished = await fetch(`${URL}/rest/v1/rpc/pending_source_items`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_dealer_id: dealerId, p_limit: 25 }),
  });
  const finishedRows = await finished.json();
  check(
    'a stamped three-photo gallery leaves the queue',
    finished.status < 300 && Array.isArray(finishedRows) && !finishedRows.some((row) => row.id === itemId),
    `got ${finished.status} ${JSON.stringify(finishedRows)?.slice(0, 180)}`
  );

  const held = await api('/rest/v1/source_items?select=id', {
    token: dealerUser.token,
    method: 'POST',
    body: {
      dealer_id: dealerId,
      provider: 'shopify',
      external_id: `shopify:held-${stamp}`,
      source_url: `https://vault-${stamp}.test/products/strap`,
      raw: { title: 'Black Saffiano Watch Strap' },
      text_hash: 'th',
      content_hash: 'ch',
      publish: true,
      available: true,
      hold_reason: 'strap',
      extracted: typed,
      extracted_hash: 'other',
    },
    prefer: 'return=representation',
  });
  check('a shop can record a held strap', held.status === 201, `got ${held.status} ${JSON.stringify(held.body)?.slice(0, 180)}`);
  const heldId = held.body?.[0]?.id;
  const heldQueue = await fetch(`${URL}/rest/v1/rpc/pending_source_items`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_dealer_id: dealerId, p_limit: 25 }),
  });
  const heldRows = await heldQueue.json();
  check(
    'a held strap stays out of the publish queue',
    heldQueue.status < 300 && Array.isArray(heldRows) && !heldRows.some((row) => row.id === heldId),
    `got ${heldQueue.status} ${JSON.stringify(heldRows)?.slice(0, 180)}`
  );
  const heldApply = await api('/rest/v1/rpc/apply_source_item', {
    token: dealerUser.token,
    method: 'POST',
    body: { p_source_item_id: heldId },
  });
  check('a held strap is not published', heldApply.status >= 400, `got ${heldApply.status}`);
  const strapListing = await api(
    `/rest/v1/listings?source_url=eq.${encodeURIComponent(`https://vault-${stamp}.test/products/strap`)}&select=id`,
    { token: dealerUser.token }
  );
  check('a held strap creates no listing', Array.isArray(strapListing.body) && strapListing.body.length === 0);

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
    body: { p_dealer_id: dealerId, p_seen_ids: [itemId], p_read_complete: true },
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
    body: { p_dealer_id: dealerId, p_seen_ids: [itemId], p_read_complete: false },
  });
  check(
    'a shop marking a watch gone retires the listing',
    swept.body?.retired === 1,
    `got ${JSON.stringify(swept.body)}`
  );

  const retired = await api(
    `/rest/v1/listings?id=eq.${syncedListingId}&select=sold_at,sold_source`,
    { token: dealerUser.token }
  );
  check('the retired listing carries a sold date', retired.body?.[0]?.sold_at !== null);
  check(
    'a feed-unavailable sale is attributed to the feed',
    retired.body?.[0]?.sold_source === 'feed_unavailable',
    JSON.stringify(retired.body?.[0])
  );

  // Relist: the shop says available again and a complete read may clear a
  // feed-sourced sold. A dealer-marked sold must stick — checked below.
  await api(`/rest/v1/source_items?id=eq.${itemId}`, {
    token: dealerUser.token,
    method: 'PATCH',
    body: { available: true },
  });
  const relisted = await api('/rest/v1/rpc/sync_source_availability', {
    token: dealerUser.token,
    method: 'POST',
    body: { p_dealer_id: dealerId, p_seen_ids: [itemId], p_read_complete: true },
  });
  check('a complete read can clear a feed-sourced sold', relisted.body?.relisted === 1);
  const back = await api(
    `/rest/v1/listings?id=eq.${syncedListingId}&select=sold_at,sold_source`,
    { token: dealerUser.token }
  );
  check('the relisted watch is for sale again', back.body?.[0]?.sold_at === null);

  // Dealer-marked sold sticks across a feed that still shows the watch.
  await api(`/rest/v1/listings?id=eq.${syncedListingId}`, {
    token: dealerUser.token,
    method: 'PATCH',
    body: { sold_at: new Date().toISOString() },
    prefer: 'return=representation',
  });
  const dealerMarked = await api(
    `/rest/v1/listings?id=eq.${syncedListingId}&select=sold_source`,
    { token: dealerUser.token }
  );
  check(
    'a hand-sold watch is attributed to the dealer',
    dealerMarked.body?.[0]?.sold_source === 'dealer'
  );
  const keepDealer = await api('/rest/v1/rpc/sync_source_availability', {
    token: dealerUser.token,
    method: 'POST',
    body: { p_dealer_id: dealerId, p_seen_ids: [itemId], p_read_complete: true },
  });
  check('a dealer-marked sold is not cleared by the feed', keepDealer.body?.relisted === 0);
  const stillSold = await api(
    `/rest/v1/listings?id=eq.${syncedListingId}&select=sold_at,sold_source`,
    { token: dealerUser.token }
  );
  check(
    'the dealer-marked sold date remains',
    stillSold.body?.[0]?.sold_at !== null && stillSold.body?.[0]?.sold_source === 'dealer'
  );

  // Put it back for sale so later checks that count live stock still work.
  await api(`/rest/v1/listings?id=eq.${syncedListingId}`, {
    token: dealerUser.token,
    method: 'PATCH',
    body: { sold_at: null },
  });

  await api(`/rest/v1/source_items?id=eq.${itemId}`, {
    token: dealerUser.token,
    method: 'PATCH',
    body: { hold_reason: 'accessory', available: true },
  });
  const heldSweep = await api('/rest/v1/rpc/sync_source_availability', {
    token: dealerUser.token,
    method: 'POST',
    body: { p_dealer_id: dealerId, p_seen_ids: [itemId], p_read_complete: false },
  });
  check(
    'a held catalogue item leaves the deck',
    heldSweep.body?.retired === 1,
    `got ${JSON.stringify(heldSweep.body)}`
  );
  const heldListing = await api(
    `/rest/v1/listings?id=eq.${syncedListingId}&select=sold_at,sold_source`,
    { token: dealerUser.token }
  );
  check(
    'a held listing is sold as not a watch',
    heldListing.body?.[0]?.sold_at !== null && heldListing.body?.[0]?.sold_source === 'not_a_watch',
    JSON.stringify(heldListing.body?.[0])
  );
  const heldAgain = await api('/rest/v1/rpc/sync_source_availability', {
    token: dealerUser.token,
    method: 'POST',
    body: { p_dealer_id: dealerId, p_seen_ids: [itemId], p_read_complete: true },
  });
  check(
    'a held listing stays off the deck while the shop still lists it',
    heldAgain.body?.relisted === 0,
    `got ${JSON.stringify(heldAgain.body)}`
  );
  await api(`/rest/v1/source_items?id=eq.${itemId}`, {
    token: dealerUser.token,
    method: 'PATCH',
    body: { hold_reason: null },
  });
  await api(`/rest/v1/listings?id=eq.${syncedListingId}`, {
    token: dealerUser.token,
    method: 'PATCH',
    body: { sold_at: null },
  });

  // Absence from an incomplete read must not retire. Seed a second linked
  // listing, sweep with an empty seen set and complete=false, then prove it
  // stayed live; complete=true must retire it.
  const missingItem = await api('/rest/v1/source_items', {
    token: dealerUser.token,
    method: 'POST',
    body: {
      dealer_id: dealerId,
      provider: 'test',
      external_id: 'missing-1',
      source_url: 'https://example.test/watches/missing-1',
      raw: {},
      text_hash: 'tm',
      content_hash: 'cm',
      available: true,
      publish: true,
      extracted: {
        brand: 'Omega',
        model: 'Speedmaster',
        reference: 'MISS-1',
        year: null,
        caliber: null,
        winding: null,
        case_size_mm: null,
        case_material: null,
        dial_color: null,
        style: null,
        complications: [],
        condition: null,
        has_box: null,
        has_papers: null,
        price_cents: 100000,
        currency: 'USD',
        description: null,
      },
      extracted_hash: 'tm',
    },
    prefer: 'return=representation',
  });
  const missingId = missingItem.body?.[0]?.id;
  const missingListing = await api('/rest/v1/rpc/apply_source_item', {
    token: dealerUser.token,
    method: 'POST',
    body: { p_source_item_id: missingId },
  });
  check('a second catalogue item publishes', missingListing.status === 200);

  const incomplete = await api('/rest/v1/rpc/sync_source_availability', {
    token: dealerUser.token,
    method: 'POST',
    body: { p_dealer_id: dealerId, p_seen_ids: [itemId], p_read_complete: false },
  });
  const incompleteRow = await api(
    `/rest/v1/listings?id=eq.${missingListing.body}&select=sold_at`,
    { token: dealerUser.token }
  );
  check(
    'an incomplete read does not retire by absence',
    incomplete.status < 300 && incompleteRow.body?.[0]?.sold_at === null,
    JSON.stringify({ incomplete: incomplete.body, row: incompleteRow.body?.[0] })
  );

  const completeMiss = await api('/rest/v1/rpc/sync_source_availability', {
    token: dealerUser.token,
    method: 'POST',
    body: { p_dealer_id: dealerId, p_seen_ids: [itemId], p_read_complete: true },
  });
  const gone = await api(
    `/rest/v1/listings?id=eq.${missingListing.body}&select=sold_at,sold_source`,
    { token: dealerUser.token }
  );
  check(
    'a complete read retires watches missing from the feed',
    completeMiss.body?.retired >= 1 && gone.body?.[0]?.sold_source === 'missing_from_catalog',
    JSON.stringify({ completeMiss: completeMiss.body, gone: gone.body?.[0] })
  );

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
  if (passedId) await attachGallery(passedId);

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

  const top = await api('/rest/v1/rpc/dealer_top_customers', {
    token: importer.token,
    method: 'POST',
    body: { p_dealer_id: dealerId },
  });
  check(
    'an importer sees top customers for their dealer',
    top.status === 200,
    `got ${top.status} ${JSON.stringify(top.body)}`,
  );
  check(
    'top customers name the buyer who saved',
    Array.isArray(top.body) && top.body.some((row) => row.buyer_id === buyer.id && row.saves >= 1),
    JSON.stringify(top.body),
  );

  const topStranger = await api('/rest/v1/rpc/dealer_top_customers', {
    token: buyer.token,
    method: 'POST',
    body: { p_dealer_id: dealerId },
  });
  check(
    "a user cannot read top customers for someone else's dealer",
    topStranger.status >= 400,
    `got ${topStranger.status}`
  );
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

  // Same reasoning for opened_at: only inquiry-draft stamps it, with the
  // service role, and only because it handed over a composer. A buyer who
  // could set it would pad the lead count on a shop's own dashboard.
  await api(`/rest/v1/inquiries?id=eq.${inquiryId}`, {
    token: buyer.token,
    method: 'PATCH',
    body: { opened_at: new Date().toISOString() },
  });
  const unopened = await api(`/rest/v1/inquiries?id=eq.${inquiryId}&select=opened_at`, {
    token: buyer.token,
  });
  check('a buyer cannot stamp their own inquiry opened', unopened.body?.[0]?.opened_at === null);

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

  const stranger = await replace(buyer.token, gallery);
  check('a stranger cannot replace a gallery', stranger.status >= 400, `got ${stranger.status}`);

  // Importing a shop first is not a permission that outlives its claim. This
  // account added the shop and is every listing's `imported_by`, and once
  // dealerUser claimed it that stopped counting.
  const stale = await replace(importer.token, gallery);
  check(
    'the earlier importer cannot rewrite a claimed shop’s gallery',
    stale.status >= 400,
    `got ${stale.status}`
  );

  // The reason this is an RPC. dealerUser claimed this shop but did not import
  // it, so they are not the listing's importer — the photo write policy refused
  // them, and every refresh they ran silently left the gallery as it was.
  const claimed = await replace(dealerUser.token, gallery);
  check(
    'a dealer who claimed the shop replaces the gallery',
    claimed.body === 2,
    `got ${JSON.stringify(claimed.body)}`
  );

  const shorter = await replace(dealerUser.token, [gallery[0]]);
  check('a shorter gallery replaces a longer one', shorter.body === 1, `got ${JSON.stringify(shorter.body)}`);

  const left = await fetch(
    `${URL}/rest/v1/listing_photos?listing_id=eq.${listingId}&select=position`,
    { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } },
  ).then((response) => response.json());
  check(
    'replacing a shorter gallery leaves no tail behind',
    Array.isArray(left) && left.length === 1,
    JSON.stringify(left),
  );

  // The refresh runs with the service key. auth.uid() is null. This used to
  // raise "Sign in first." after the files were already in the bucket.
  const scheduled = await fetch(`${URL}/rest/v1/rpc/replace_listing_photos`, {
    method: 'POST',
    headers: { ...admin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_listing_id: listingId, p_photos: gallery }),
  });
  const scheduledBody = await scheduled.json();
  check(
    'the nightly refresh replaces a claimed shop’s gallery',
    scheduled.status < 300 && scheduledBody === 2,
    `got ${scheduled.status} ${JSON.stringify(scheduledBody)}`
  );

  await fetch(`${URL}/rest/v1/listing_photos`, {
    method: 'POST',
    headers: { ...admin, Prefer: 'return=minimal' },
    body: JSON.stringify({
      listing_id: listingId,
      position: 2,
      source_url: 'https://shop.test/3.jpg',
    }),
  });
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
        p_permission: permission,
        p_created_by: importer.id,
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

console.log('\noperators');
{
  const admin = {
    apikey: SERVICE,
    Authorization: `Bearer ${SERVICE}`,
    'Content-Type': 'application/json',
  };

  // The operator UI runs on a normal session, so every one of these is reachable
  // from a browser by anyone signed in. The grant is the only thing stopping it.
  const codes = await api('/rest/v1/operators', { token: buyer.token });
  check('the operator list is unreachable over REST', codes.status >= 400, `got ${codes.status}`);

  const claim = await api('/rest/v1/operators', {
    token: buyer.token,
    method: 'POST',
    body: { user_id: buyer.id },
  });
  check('nobody can make themselves an operator', claim.status >= 400, `got ${claim.status}`);

  const asksIfOperator = await api('/rest/v1/rpc/is_operator', {
    token: buyer.token,
    method: 'POST',
  });
  check('a signed-in user is not an operator', asksIfOperator.body === false);

  const publish = (token, permission) =>
    api('/rest/v1/rpc/set_dealer_permission', {
      token,
      method: 'POST',
      body: { p_dealer_id: dealerId, p_permission: permission },
    });

  const byBuyer = await publish(buyer.token, 'approved');
  check('a buyer cannot publish a shop', byBuyer.status >= 400, `got ${byBuyer.status}`);

  const beforeBot = await fetch(`${URL}/rest/v1/dealers?id=eq.${dealerId}&select=permission`, {
    headers: admin,
  }).then((response) => response.json());

  const botByBuyer = await api('/rest/v1/rpc/bot_set_dealer_permission', {
    token: buyer.token,
    method: 'POST',
    body: { p_dealer_id: dealerId, p_permission: 'approved' },
  });
  check('a buyer cannot approve through the operator bot', botByBuyer.status >= 400, `got ${botByBuyer.status}`);

  const botByOwner = await api('/rest/v1/rpc/bot_set_dealer_permission', {
    token: importer.token,
    method: 'POST',
    body: { p_dealer_id: dealerId, p_permission: 'approved' },
  });
  check(
    'the importer who added the shop cannot approve it through the operator bot',
    botByOwner.status >= 400,
    `got ${botByOwner.status}`
  );

  const botByClaimant = await api('/rest/v1/rpc/bot_set_dealer_permission', {
    token: dealerUser.token,
    method: 'POST',
    body: { p_dealer_id: dealerId, p_permission: 'approved' },
  });
  check(
    'the dealer who claimed the shop cannot approve it through the operator bot',
    botByClaimant.status >= 400,
    `got ${botByClaimant.status}`
  );

  const afterBot = await fetch(`${URL}/rest/v1/dealers?id=eq.${dealerId}&select=permission`, {
    headers: admin,
  }).then((response) => response.json());
  check(
    'a buyer or dealer call does not change shop permission',
    beforeBot?.[0]?.permission === afterBot?.[0]?.permission,
    `${beforeBot?.[0]?.permission} -> ${afterBot?.[0]?.permission}`
  );

  const originalPermission = beforeBot?.[0]?.permission;
  if (originalPermission !== 'pending') {
    const lowered = await fetch(`${URL}/rest/v1/rpc/bot_set_dealer_permission`, {
      method: 'POST',
      headers: admin,
      body: JSON.stringify({ p_dealer_id: dealerId, p_permission: 'pending' }),
    });
    const loweredBody = await lowered.json();
    check(
      'the service role can unapprove through the operator bot',
      lowered.ok && loweredBody === 'pending',
      `${lowered.status} ${JSON.stringify(loweredBody)}`,
    );
  }

  const botApproved = await fetch(`${URL}/rest/v1/rpc/bot_set_dealer_permission`, {
    method: 'POST',
    headers: admin,
    body: JSON.stringify({ p_dealer_id: dealerId, p_permission: 'approved' }),
  });
  const botApprovedBody = await botApproved.json();
  check('the service role can approve a pending shop through the operator bot', botApproved.ok && botApprovedBody === 'approved', `${botApproved.status} ${JSON.stringify(botApprovedBody)}`);

  const activity = await fetch(`${URL}/rest/v1/rpc/operator_activity`, {
    method: 'POST',
    headers: admin,
    body: JSON.stringify({ p_limit: 20 }),
  });
  const activityBody = await activity.json();
  const botRow = Array.isArray(activityBody)
    ? activityBody.find((row) => row.action === 'approve_shop' && row.target_id === dealerId && row.operator_label === 'operator bot')
    : null;
  check('that approval is recorded as the operator bot', activity.ok && Boolean(botRow), JSON.stringify(activityBody)?.slice(0, 400));

  if (originalPermission && originalPermission !== 'approved') {
    const restored = await fetch(`${URL}/rest/v1/rpc/set_dealer_permission`, {
      method: 'POST',
      headers: admin,
      body: JSON.stringify({ p_dealer_id: dealerId, p_permission: originalPermission }),
    });
    check('the shop permission is put back', restored.ok, `wanted ${originalPermission}, got ${restored.status}`);
  }

  const pauseByBuyer = await publish(buyer.token, 'paused');
  check('a buyer cannot pause a shop', pauseByBuyer.status >= 400, `got ${pauseByBuyer.status}`);

  const gapsByBuyer = await api('/rest/v1/rpc/catalogue_photo_gaps', {
    token: buyer.token,
    method: 'POST',
  });
  check('a buyer cannot read photo gaps', gapsByBuyer.status >= 400, `got ${gapsByBuyer.status}`);

  // The dealer who claimed this shop is the sharpest case: they have every
  // other power over it, and still cannot put their own stock in the deck.
  const byDealer = await publish(dealerUser.token, 'approved');
  check(
    'the dealer who claimed the shop cannot publish it',
    byDealer.status >= 400,
    `got ${byDealer.status}`
  );

  const overviewBefore = await api('/rest/v1/rpc/operator_dealers', {
    token: buyer.token,
    method: 'POST',
  });
  check(
    'a non-operator cannot list shops with their addresses',
    overviewBefore.status >= 400,
    `got ${overviewBefore.status}`
  );

  const scheduleBefore = await api('/rest/v1/rpc/operator_refresh_schedule', {
    token: buyer.token,
    method: 'POST',
  });
  check(
    'a buyer cannot read the refresh schedule',
    scheduleBefore.status >= 400,
    `got ${scheduleBefore.status}`
  );

  const logBefore = await api('/rest/v1/rpc/operator_activity', {
    token: buyer.token,
    method: 'POST',
  });
  check('a buyer cannot read the operator log', logBefore.status >= 400, `got ${logBefore.status}`);

  const dashBefore = await api('/rest/v1/rpc/operator_dashboard', {
    token: buyer.token,
    method: 'POST',
  });
  check('a buyer cannot read the user dashboard', dashBefore.status >= 400, `got ${dashBefore.status}`);

  const dealerOverride = await api('/rest/v1/rpc/operator_edit_listing', {
    token: dealerUser.token,
    method: 'POST',
    body: {
      p_listing_id: listingId,
      p_brand: 'Hijack',
      p_model: null,
      p_reference: null,
      p_year: null,
      p_case_size_mm: null,
      p_price_cents: null,
      p_condition: null,
      p_description: null,
    },
  });
  check(
    'the dealer who claimed the shop cannot use the operator override',
    dealerOverride.status >= 400,
    `got ${dealerOverride.status}`
  );

  await fetch(`${URL}/rest/v1/operators`, {
    method: 'POST',
    headers: admin,
    body: JSON.stringify({ user_id: buyer.id, note: 'rls test' }),
  });

  const nowOperator = await api('/rest/v1/rpc/is_operator', {
    token: buyer.token,
    method: 'POST',
  });
  check('a granted account is an operator', nowOperator.body === true);

  const schedule = await api('/rest/v1/rpc/operator_refresh_schedule', {
    token: buyer.token,
    method: 'POST',
  });
  check(
    'an operator can read the refresh schedule',
    schedule.status < 300 && Array.isArray(schedule.body),
    `${schedule.status} ${JSON.stringify(schedule.body)?.slice(0, 200)}`
  );

  const byOperator = await publish(buyer.token, 'revoked');
  check(
    'an operator publishes and pulls back',
    byOperator.body === 'revoked',
    `got ${byOperator.status} ${JSON.stringify(byOperator.body)}`
  );

  // Reading every application is what the review screen is; without this the
  // operator UI would show an empty list and look broken.
  const everyApplication = await api('/rest/v1/dealer_applications?select=id', {
    token: buyer.token,
  });
  check(
    'an operator reads every application',
    Array.isArray(everyApplication.body),
    JSON.stringify(everyApplication.body)
  );

  // The dealers table stays column-restricted even for an operator, so the
  // review screen reads through a function. If this ever became a plain table
  // read, every buyer would get every shop's mailbox with it.
  const bareRead = await api('/rest/v1/dealers?select=*', { token: buyer.token });
  check(
    'contact_email is unreadable through the table, operator or not',
    bareRead.status >= 400,
    `got ${bareRead.status}`
  );

  const overview = await api('/rest/v1/rpc/operator_dealers', {
    token: buyer.token,
    method: 'POST',
  });
  check(
    'operator_dealers returns the address the table will not',
    Array.isArray(overview.body) &&
      overview.body.some((row) => row.id === dealerId && 'contact_email' in row),
    `${overview.status} ${JSON.stringify(overview.body)?.slice(0, 160)}`
  );
  // The shop is revoked at this point, so the deck shows none of its watches.
  // The count used to omit permission entirely and report them as live on the
  // one screen used to decide whether to publish the shop.
  const mine = overview.body?.find((row) => row.id === dealerId);
  check(
    'a shop that is not approved has nothing in the deck',
    mine?.listings_in_deck === 0,
    JSON.stringify(mine)
  );
  check(
    'and still reports what we hold for it',
    mine?.listings_held > 0,
    JSON.stringify(mine)
  );

  const sellable = await api(
    `/rest/v1/listings?dealer_id=eq.${dealerId}&status=eq.active&sold_at=is.null&select=id`,
    { token: SERVICE }
  );
  await publish(buyer.token, 'approved');
  const afterPublish = await api('/rest/v1/rpc/operator_dealers', {
    token: buyer.token,
    method: 'POST',
  });
  const published = afterPublish.body?.find((row) => row.id === dealerId);
  check(
    'approving puts exactly the sellable ones in the deck',
    published?.listings_in_deck === sellable.body?.length,
    `${published?.listings_in_deck} in deck vs ${sellable.body?.length} active and unsold`
  );

  const paused = await publish(buyer.token, 'paused');
  check(
    'an operator can pause a published shop',
    paused.body === 'paused',
    `${paused.status} ${JSON.stringify(paused.body)}`
  );
  const whilePaused = await api('/rest/v1/rpc/operator_dealers', {
    token: buyer.token,
    method: 'POST',
  });
  const pausedRow = whilePaused.body?.find((row) => row.id === dealerId);
  check(
    'a paused shop is out of the deck and the console can see photo counts',
    pausedRow?.permission === 'paused' &&
      pausedRow?.listings_in_deck === 0 &&
      typeof pausedRow?.photo_count === 'number' &&
      typeof pausedRow?.listings_missing_photos === 'number',
    JSON.stringify(pausedRow)?.slice(0, 400)
  );

  const pauseLog = await api('/rest/v1/rpc/operator_activity', {
    token: buyer.token,
    method: 'POST',
    body: { p_limit: 20 },
  });
  check(
    'pausing a shop is written to the operator log',
    Array.isArray(pauseLog.body) &&
      pauseLog.body.some((row) => row.action === 'pause_shop' && row.target_id === dealerId),
    JSON.stringify(pauseLog.body)?.slice(0, 400)
  );

  const logTable = await api('/rest/v1/operator_actions?select=id', { token: buyer.token });
  check('the operator log is unreachable over REST', logTable.status >= 400, `got ${logTable.status}`);

  const pauseAgain = await publish(buyer.token, 'paused');
  check(
    'pausing a shop that is not published is refused',
    pauseAgain.status >= 400,
    `${pauseAgain.status} ${JSON.stringify(pauseAgain.body)}`
  );

  const ledgerDenied = await api('/rest/v1/refresh_runs', {
    token: buyer.token,
    method: 'POST',
    body: { dealer_id: dealerId, ok: true, published: 2, skipped_listings: 1 },
  });
  check(
    'an operator cannot write the refresh ledger',
    ledgerDenied.status >= 400,
    `got ${ledgerDenied.status}`
  );

  const recorded = await fetch(`${URL}/rest/v1/refresh_runs`, {
    method: 'POST',
    headers: { ...admin, Prefer: 'return=representation' },
    body: JSON.stringify({
      dealer_id: dealerId,
      // operator_dealers() only returns last_refresh_error when the latest
      // attempt failed. A successful row stores a null error on purpose, so
      // this fixture has to be a failure or the console check below is vacant.
      ok: false,
      published: 2,
      skipped_listings: 1,
      error: 'boom',
    }),
  });
  const recordedBody = await recorded.json();
  check(
    'the service role records a refresh run',
    recorded.ok,
    `${recorded.status} ${JSON.stringify(recordedBody)?.slice(0, 200)}`
  );

  const withRun = await api('/rest/v1/rpc/operator_dealers', {
    token: buyer.token,
    method: 'POST',
  });
  const ran = withRun.body?.find((row) => row.id === dealerId);
  check(
    'the console shows that run’s published and skipped counts and its error',
    ran?.last_refresh_attempt_ok === false &&
      ran?.last_refresh_published === 2 &&
      ran?.last_refresh_skipped === 1 &&
      ran?.last_refresh_error === 'boom' &&
      typeof ran?.last_refresh_at === 'string',
    JSON.stringify(ran)?.slice(0, 400)
  );

  const hiddenLedger = await api('/rest/v1/refresh_runs?select=id', { token: buyer.token });
  check(
    'refresh history is not readable over REST',
    hiddenLedger.status >= 400,
    `got ${hiddenLedger.status}`
  );

  await publish(buyer.token, 'approved');

  // ---------------------------------------------------------------------
  // The console's own reads
  // ---------------------------------------------------------------------

  const watches = await api('/rest/v1/rpc/operator_listings', {
    token: buyer.token,
    method: 'POST',
    body: { p_dealer_id: dealerId },
  });
  check(
    'operator_listings returns one shop\u2019s watches',
    Array.isArray(watches.body) && watches.body.some((row) => row.id === listingId),
    `${watches.status} ${JSON.stringify(watches.body)?.slice(0, 120)}`
  );

  const problems = await api('/rest/v1/rpc/operator_catalog_problems', {
    token: buyer.token,
    method: 'POST',
    body: { p_dealer_id: dealerId },
  });
  check(
    'operator_catalog_problems answers for a shop with none',
    Array.isArray(problems.body),
    `${problems.status} ${JSON.stringify(problems.body)?.slice(0, 120)}`
  );

  const beforeEdit = await api(
    `/rest/v1/listings?id=eq.${syncedListingId}&select=brand,model,reference,year,case_size_mm,price_cents,condition,description,edited_fields`,
    { token: SERVICE }
  );
  const held = beforeEdit.body?.[0];
  const operatorEdit = await api('/rest/v1/rpc/operator_edit_listing', {
    token: buyer.token,
    method: 'POST',
    body: {
      p_listing_id: syncedListingId,
      p_brand: held?.brand,
      p_model: held?.model,
      p_reference: held?.reference,
      p_year: held?.year,
      p_case_size_mm: held?.case_size_mm,
      p_price_cents: 111100,
      p_condition: held?.condition,
      p_description: held?.description,
    },
  });
  check('an operator can correct a watch on a claimed shop', operatorEdit.status < 300, `got ${operatorEdit.status} ${JSON.stringify(operatorEdit.body)}`);

  const editedFields = await api(
    `/rest/v1/listings?id=eq.${syncedListingId}&select=price_cents,edited_fields`,
    { token: SERVICE }
  );
  check(
    'an operator edit is recorded so a refresh will keep it',
    editedFields.body?.[0]?.price_cents === 111100 &&
      editedFields.body?.[0]?.edited_fields?.includes('price_cents'),
    JSON.stringify(editedFields.body?.[0])
  );

  await api(`/rest/v1/source_items?id=eq.${itemId}`, {
    token: dealerUser.token,
    method: 'PATCH',
    body: {
      extracted: {
        brand: held?.brand,
        model: 'After operator',
        reference: held?.reference ?? 'FEED-2',
        price_cents: 222200,
        currency: 'USD',
      },
      text_hash: 't-op',
      extracted_hash: 't-op',
      content_hash: 'c-op',
    },
  });
  const reapplied = await api('/rest/v1/rpc/apply_source_item', {
    token: dealerUser.token,
    method: 'POST',
    body: { p_source_item_id: itemId },
  });
  const kept = await api(
    `/rest/v1/listings?id=eq.${syncedListingId}&select=price_cents,model`,
    { token: SERVICE }
  );
  check(
    'a refresh keeps the operator price and updates a field they did not touch',
    reapplied.status < 300 && kept.body?.[0]?.price_cents === 111100 && kept.body?.[0]?.model === 'After operator',
    `${reapplied.status} ${JSON.stringify(kept.body?.[0])}`
  );

  await api('/rest/v1/rpc/operator_edit_listing', {
    token: buyer.token,
    method: 'POST',
    body: {
      p_listing_id: syncedListingId,
      p_brand: held?.brand,
      p_model: held?.model,
      p_reference: held?.reference,
      p_year: held?.year,
      p_case_size_mm: held?.case_size_mm,
      p_price_cents: held?.price_cents,
      p_condition: held?.condition,
      p_description: held?.description,
    },
  });

  const hidden = await api('/rest/v1/rpc/operator_set_listing_status', {
    token: buyer.token,
    method: 'POST',
    body: { p_listing_id: listingId, p_status: 'hidden' },
  });
  check('an operator can hide a watch', hidden.body === 'hidden', JSON.stringify(hidden.body));
  const shownAgain = await api('/rest/v1/rpc/operator_set_listing_status', {
    token: buyer.token,
    method: 'POST',
    body: { p_listing_id: listingId, p_status: 'active' },
  });
  check('an operator can show it again', shownAgain.body === 'active', JSON.stringify(shownAgain.body));

  const markedSold = await api('/rest/v1/rpc/operator_set_listing_sold', {
    token: buyer.token,
    method: 'POST',
    body: { p_listing_id: listingId, p_sold: true },
  });
  const soldSource = await api(`/rest/v1/listings?id=eq.${listingId}&select=sold_at,sold_source`, {
    token: SERVICE,
  });
  check(
    'marking sold is a dealer decision the feed will not clear',
    markedSold.status < 300 &&
      soldSource.body?.[0]?.sold_at &&
      soldSource.body?.[0]?.sold_source === 'dealer',
    JSON.stringify(soldSource.body?.[0])
  );
  await api('/rest/v1/rpc/operator_set_listing_sold', {
    token: buyer.token,
    method: 'POST',
    body: { p_listing_id: listingId, p_sold: false },
  });
  const availableAgain = await api(`/rest/v1/listings?id=eq.${listingId}&select=sold_at,sold_source`, {
    token: SERVICE,
  });
  check(
    'marking available clears the sold date',
    availableAgain.body?.[0]?.sold_at === null && availableAgain.body?.[0]?.sold_source === null,
    JSON.stringify(availableAgain.body?.[0])
  );

  const dash = await api('/rest/v1/rpc/operator_dashboard', {
    token: buyer.token,
    method: 'POST',
  });
  check(
    'an operator can read signup and activity counts',
    dash.status < 300 && dash.body?.totals?.users >= 1 && dash.body?.activity?.dau >= 1,
    `${dash.status} ${JSON.stringify(dash.body)?.slice(0, 240)}`
  );
  check(
    'the dashboard does not include email addresses',
    !JSON.stringify(dash.body).includes('example.com'),
    JSON.stringify(dash.body)?.slice(0, 200)
  );

  // ---------------------------------------------------------------------
  // Who may run the importer
  // ---------------------------------------------------------------------

  // Later sections assert what a claim takes away from the original importer,
  // so this block puts the shop back exactly as it found it. Restoring `null`
  // instead quietly unclaimed the shop and made those checks pass for the wrong
  // reason.
  const setClaim = async (userId) => {
    await fetch(`${URL}/rest/v1/dealers?id=eq.${dealerId}`, {
      method: 'PATCH',
      headers: admin,
      body: JSON.stringify({ claimed_by: userId }),
    });
    const all = await api('/rest/v1/rpc/operator_dealers', {
      token: buyer.token,
      method: 'POST',
    });
    return all.body?.find((row) => row.id === dealerId);
  };

  const claimedBy = (
    await api(`/rest/v1/dealers?id=eq.${dealerId}&select=claimed_by`, { token: SERVICE })
  ).body?.[0]?.claimed_by;

  // An unclaimed shop is the operator's to import even though somebody else
  // added it. The terminal tools sign in as their own account, so without this
  // every shop added from a laptop is unimportable in the browser.
  const unclaimedShop = await setClaim(null);
  check(
    'an operator controls an unclaimed shop it did not add',
    unclaimedShop?.can_import === true
  );
  check(
    'an unclaimed shop is flagged neglected',
    unclaimedShop?.neglect_flags?.includes('unclaimed') === true,
    JSON.stringify(unclaimedShop?.neglect_flags)
  );

  // can_import is a claim about writes, and a catalogue read cashes it in two
  // RPCs that each carried their own copy of the ownership test. The flag said
  // yes, the read wrote its rows, and the sweep two statements later said
  // "You do not manage that shop." Empty p_seen_ids so this judges nothing.
  const operatorSweep = await api('/rest/v1/rpc/sync_source_availability', {
    token: buyer.token,
    method: 'POST',
    body: { p_dealer_id: dealerId, p_seen_ids: [], p_read_complete: true },
  });
  check(
    'an operator sweeps stock on an unclaimed shop it did not add',
    operatorSweep.status < 300,
    `got ${operatorSweep.status} ${JSON.stringify(operatorSweep.body)}`
  );

  const operatorAdopt = await api('/rest/v1/rpc/adopt_existing_listings', {
    token: buyer.token,
    method: 'POST',
    body: { p_dealer_id: dealerId },
  });
  check(
    'an operator adopts listings on an unclaimed shop it did not add',
    operatorAdopt.status < 300,
    `got ${operatorAdopt.status} ${JSON.stringify(operatorAdopt.body)}`
  );

  // A claim is a dealer taking over their own inventory. 20260917000002 exists
  // to stop an earlier importer writing over them, and operator status must not
  // be a way back in.
  const issuedWhileOpen = await api('/rest/v1/rpc/operator_issue_claim_code', {
    token: buyer.token,
    method: 'POST',
    body: { p_dealer_id: dealerId },
  });
  const handoffCode = issuedWhileOpen.body?.[0]?.code;
  check(
    'an operator can issue a claim code for an unclaimed shop',
    issuedWhileOpen.status < 300 && /^\d{6}$/.test(handoffCode),
    `${issuedWhileOpen.status} ${JSON.stringify(issuedWhileOpen.body)}`
  );
  const wrongCode = handoffCode === '000000' ? '111111' : '000000';
  const wrongClaimCode = await api('/rest/v1/rpc/claim_dealer_with_code', {
    token: importer.token,
    method: 'POST',
    body: { p_dealer_id: dealerId, p_code: wrongCode },
  });
  check(
    'a wrong handoff code does not claim the shop',
    wrongClaimCode.status < 300 && wrongClaimCode.body === null,
    JSON.stringify(wrongClaimCode.body)
  );
  const spent = await api('/rest/v1/rpc/claim_dealer_with_code', {
    token: importer.token,
    method: 'POST',
    body: { p_dealer_id: dealerId, p_code: handoffCode },
  });
  check(
    'whoever has the handoff code can claim the shop',
    spent.body === dealerId,
    `${spent.status} ${JSON.stringify(spent.body)}`
  );
  const unassigned = await api('/rest/v1/rpc/operator_unclaim_shop', {
    token: buyer.token,
    method: 'POST',
    body: { p_dealer_id: dealerId },
  });
  check('an operator can unassign the claimer', unassigned.status < 300, `got ${unassigned.status}`);
  const reused = await api('/rest/v1/rpc/claim_dealer_with_code', {
    token: importer.token,
    method: 'POST',
    body: { p_dealer_id: dealerId, p_code: handoffCode },
  });
  check('a spent handoff code cannot be used again', reused.status >= 400, `got ${reused.status}`);

  const reissued = await api('/rest/v1/rpc/operator_issue_claim_code', {
    token: buyer.token,
    method: 'POST',
    body: { p_dealer_id: dealerId },
  });
  const codesRevoked = await api('/rest/v1/rpc/operator_revoke_claim_code', {
    token: buyer.token,
    method: 'POST',
    body: { p_dealer_id: dealerId },
  });
  const afterRevoke = await api('/rest/v1/rpc/claim_dealer_with_code', {
    token: importer.token,
    method: 'POST',
    body: { p_dealer_id: dealerId, p_code: reissued.body?.[0]?.code },
  });
  check(
    'revoking a claim code stops it being spent',
    codesRevoked.status < 300 && afterRevoke.status >= 400,
    `revoke ${codesRevoked.status}, spend ${afterRevoke.status}`
  );

  const staleInquiry = await api(
    `/rest/v1/inquiries?dealer_id=eq.${dealerId}&select=id,created_at&limit=1`,
    { token: SERVICE }
  );
  const stale = staleInquiry.body?.[0];
  if (stale?.id) {
    await fetch(`${URL}/rest/v1/inquiries?id=eq.${stale.id}`, {
      method: 'PATCH',
      headers: admin,
      body: JSON.stringify({ created_at: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString() }),
    });
    const flagged = await api('/rest/v1/rpc/operator_dealers', {
      token: buyer.token,
      method: 'POST',
    });
    const waiting = flagged.body?.find((row) => row.id === dealerId);
    check(
      'an inquiry older than 48 hours flags the shop unanswered',
      waiting?.neglect_flags?.includes('unanswered') === true && waiting?.unanswered_count > 0,
      JSON.stringify(waiting?.neglect_flags)
    );
    await fetch(`${URL}/rest/v1/inquiries?id=eq.${stale.id}`, {
      method: 'PATCH',
      headers: admin,
      body: JSON.stringify({ created_at: stale.created_at }),
    });
  } else {
    check('an inquiry older than 48 hours flags the shop unanswered', false, 'no inquiry to age');
  }

  check(
    'an operator does not control a shop a dealer has claimed',
    (await setClaim(dealerUser.id))?.can_import === false
  );

  // The flag has to agree with what the write would really do. A screen that
  // offers the button and a policy that refuses it is worse than either.
  const catalogue = await api(`/rest/v1/source_items?dealer_id=eq.${dealerId}&select=id`, {
    token: buyer.token,
  });
  check(
    'and cannot read that shop\u2019s catalogue',
    Array.isArray(catalogue.body) && catalogue.body.length === 0,
    `${catalogue.status} ${JSON.stringify(catalogue.body)?.slice(0, 120)}`
  );

  const claimedSweep = await api('/rest/v1/rpc/sync_source_availability', {
    token: buyer.token,
    method: 'POST',
    body: { p_dealer_id: dealerId, p_seen_ids: [], p_read_complete: true },
  });
  const claimedAdopt = await api('/rest/v1/rpc/adopt_existing_listings', {
    token: buyer.token,
    method: 'POST',
    body: { p_dealer_id: dealerId },
  });
  check(
    'and cannot sweep or adopt against it',
    claimedSweep.status >= 400 && claimedAdopt.status >= 400,
    `sweep ${claimedSweep.status}, adopt ${claimedAdopt.status}`
  );

  await setClaim(claimedBy);

  await fetch(`${URL}/rest/v1/operators?user_id=eq.${buyer.id}`, {
    method: 'DELETE',
    headers: admin,
  });

  const revoked = await publish(buyer.token, 'approved');
  check(
    'revoking the row revokes the power',
    revoked.status >= 400,
    `got ${revoked.status}`
  );

  await fetch(`${URL}/rest/v1/rpc/set_dealer_permission`, {
    method: 'POST',
    headers: admin,
    body: JSON.stringify({ p_dealer_id: dealerId, p_permission: 'approved' }),
  });
}

// Every function in this schema is executable by anon the moment it is created:
// Supabase's default privileges say so. `revoke execute ... from public` does
// not undo that, because PUBLIC is the implicit everyone-grant and not the anon
// role. Tables ride out that mistake because RLS denies a role with no policy.
// A `security definer` function has no such backstop — it runs as its owner and
// skips RLS on purpose — so an ungranted function is an open one.
console.log('\nwhat anon can reach');
{
  const admin = {
    apikey: SERVICE,
    Authorization: `Bearer ${SERVICE}`,
    'Content-Type': 'application/json',
  };

  // The publishable key with no session behind it, which is what anyone who
  // unzips the app binary holds.
  const asAnon = (fn, body) => api(`/rest/v1/rpc/${fn}`, { method: 'POST', body: body ?? {} });

  for (const [fn, body] of [
    ['operator_dealers', {}],
    ['set_dealer_permission', { p_dealer_id: dealerId, p_permission: 'approved' }],
    ['catalogue_photo_gaps', {}],
    ['listing_photo_counts', {}],
    ['approve_dealer_application', { p_application_id: applicationId }],
    ['decline_dealer_application', { p_application_id: applicationId, p_reason: 'no' }],
    ['is_operator', {}],
    ['require_operator', {}],
    ['operator_activity', {}],
    ['operator_dashboard', {}],
    ['operator_accounts', {}],
    ['operator_account', { p_user_id: buyer.id }],
    ['record_operator_action', { p_action: 'x', p_target_type: 'shop', p_target_id: dealerId, p_before: {}, p_after: {} }],
    ['record_bot_action', { p_action: 'x', p_target_type: 'shop', p_target_id: dealerId, p_before: {}, p_after: {} }],
    ['bot_set_dealer_permission', { p_dealer_id: dealerId, p_permission: 'approved' }],
    [
      'operator_edit_listing',
      {
        p_listing_id: listingId,
        p_brand: 'Omega',
        p_model: null,
        p_reference: null,
        p_year: null,
        p_case_size_mm: null,
        p_price_cents: null,
        p_condition: null,
        p_description: null,
      },
    ],
    ['operator_set_listing_status', { p_listing_id: listingId, p_status: 'hidden' }],
    ['operator_set_listing_sold', { p_listing_id: listingId, p_sold: true }],
    ['operator_issue_claim_code', { p_dealer_id: dealerId }],
    ['operator_revoke_claim_code', { p_dealer_id: dealerId }],
    ['operator_unclaim_shop', { p_dealer_id: dealerId }],
    ['can_claim_with_email', { p_dealer_id: dealerId, p_email: 'sales@example.com' }],
    ['store_dealer_claim_code', { p_dealer_id: dealerId, p_email: 'sales@example.com' }],
    ['replace_listing_photos', { p_listing_id: listingId, p_photos: [] }],
    ['apply_source_item', { p_source_item_id: listingId }],
    ['lookup_claimable_dealer', { p_website: 'https://example.com' }],
    ['operator_delete_dealer', { p_dealer_id: dealerId }],
    ['operator_refresh_schedule', {}],
    ['operator_conversations', {}],
    ['operator_conversation_messages', { p_conversation_id: dealerId }],
    ['operator_inquiries', {}],
  ]) {
    const attempt = await asAnon(fn, body);
    check(`anon cannot execute ${fn}`, attempt.status >= 400, `got ${attempt.status}`);
  }

  // The one that was live: a shop published by nobody at all.
  const stillPending = await fetch(`${URL}/rest/v1/dealers?id=eq.${dealerId}&select=permission`, {
    headers: admin,
  }).then((r) => r.json());
  check(
    'no anon call changed a permission',
    stillPending?.[0]?.permission === 'approved',
    `permission is ${stillPending?.[0]?.permission}`
  );

  const anonWrite = await api(`/rest/v1/dealers?id=eq.${dealerId}`, {
    method: 'PATCH',
    body: { name: 'anon was here' },
  });
  check('anon cannot write dealers', anonWrite.status >= 400, `got ${anonWrite.status}`);

  // Guests browse the approved catalogue before sign-in. Pending shops and
  // their listings stay hidden; swipes stay unwritable.
  const anonDeck = await asAnon('search_listings', { p_limit: 20, p_exclude_swiped: true });
  check('anon can search the catalogue', anonDeck.status < 400, `got ${anonDeck.status}`);
  check(
    'anon search only sees approved listings',
    Array.isArray(anonDeck.body) && anonDeck.body.every((row) => row.status === 'active'),
    `got ${JSON.stringify(anonDeck.body)?.slice(0, 120)}`
  );

  // A guest's auth.uid() is null, and an unclaimed shop's claimed_by is null.
  // Those must not count as the same person, or the Buy tab hides every shop
  // nobody has claimed — including one that was just approved and stocked.
  const adminHeaders = {
    apikey: SERVICE,
    Authorization: `Bearer ${SERVICE}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
  const guestShop = await fetch(`${URL}/rest/v1/dealers?select=id`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      name: 'Unclaimed Counter',
      website: `https://unclaimed-${stamp}.test`,
      created_by: importer.id,
      permission: 'approved',
    }),
  }).then((response) => response.json());
  const guestShopId = guestShop?.[0]?.id;
  const guestListing = guestShopId
    ? await fetch(`${URL}/rest/v1/listings?select=id`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          dealer_id: guestShopId,
          imported_by: importer.id,
          brand: 'Tudor',
          model: 'Advisor',
          price_cents: 180000,
        }),
      }).then((response) => response.json())
    : null;
  const guestListingId = guestListing?.[0]?.id;
  if (guestListingId) await attachGallery(guestListingId);

  const anonFacets = await asAnon('listing_facets', { p_exclude_own: true });
  check(
    'a guest sees an unclaimed shop in the dealer filter',
    Boolean(guestShopId) &&
      anonFacets.body?.some((row) => row.kind === 'dealer' && row.value === guestShopId),
    `shop ${guestShopId} facets ${JSON.stringify(anonFacets.body?.filter((row) => row.kind === 'dealer'))}`
  );

  const anonByDealer = await asAnon('search_listings', {
    p_limit: 20,
    p_exclude_own: true,
    p_dealers: guestShopId ? [guestShopId] : [],
  });
  check(
    'a guest can filter the deck to that unclaimed shop',
    Boolean(guestListingId) && anonByDealer.body?.some((row) => row.id === guestListingId),
    `got ${anonByDealer.status}`
  );

  const importerFacets = await api('/rest/v1/rpc/listing_facets', {
    token: importer.token,
    method: 'POST',
    body: { p_exclude_own: true },
  });
  check(
    'an importer still sees an unclaimed shop they stocked',
    importerFacets.body?.some((row) => row.kind === 'dealer' && row.value === guestShopId)
  );

  const buyerFacets = await api('/rest/v1/rpc/listing_facets', {
    token: buyer.token,
    method: 'POST',
    body: { p_exclude_own: true },
  });
  check(
    'another buyer sees the unclaimed shop in the dealer filter',
    buyerFacets.body?.some((row) => row.kind === 'dealer' && row.value === guestShopId && Number(row.count) >= 1)
  );

  if (guestShopId) {
    const claimed = await fetch(`${URL}/rest/v1/dealers?id=eq.${guestShopId}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ claimed_by: buyer.id }),
    });
    check('the shop can be marked claimed', claimed.ok, `got ${claimed.status}`);

    const claimantDeck = await api('/rest/v1/rpc/search_listings', {
      token: buyer.token,
      method: 'POST',
      body: { p_limit: 20, p_exclude_own: true, p_dealers: [guestShopId] },
    });
    check(
      'a claimed shop is hidden from the account that claimed it',
      !claimantDeck.body?.some((row) => row.id === guestListingId)
    );

    const importerStill = await api('/rest/v1/rpc/search_listings', {
      token: importer.token,
      method: 'POST',
      body: { p_limit: 20, p_exclude_own: true, p_dealers: [guestShopId] },
    });
    check(
      'importing a watch does not hide it when someone else claimed the shop',
      importerStill.body?.some((row) => row.id === guestListingId)
    );

    const guestStill = await asAnon('search_listings', {
      p_limit: 20,
      p_exclude_own: true,
      p_dealers: [guestShopId],
    });
    check(
      'a guest still sees a shop after someone else claims it',
      guestStill.body?.some((row) => row.id === guestListingId)
    );

    await fetch(`${URL}/rest/v1/dealers?id=eq.${guestShopId}`, {
      method: 'DELETE',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
    });
  }

  const anonListing = await api(`/rest/v1/listings?id=eq.${listingId}&select=id`);
  check(
    'anon can read an approved listing',
    anonListing.status < 400 && anonListing.body?.length === 1,
    `got ${anonListing.status}`
  );

  const anonSwipe = await api('/rest/v1/swipes', {
    method: 'POST',
    body: { actor_id: buyer.id, listing_id: listingId, direction: 'right' },
  });
  check('anon cannot write swipes', anonSwipe.status >= 400, `got ${anonSwipe.status}`);

  // Authenticated is not the fix either: this one answers whether a guessed
  // address matches the column SELECT is revoked on, so any account could have
  // harvested dealer addresses one guess at a time.
  const probe = await api('/rest/v1/rpc/can_claim_with_email', {
    token: buyer.token,
    method: 'POST',
    body: { p_dealer_id: dealerId, p_email: 'sales@example.com' },
  });
  check(
    'a signed-in buyer cannot probe contact addresses',
    probe.status >= 400,
    `got ${probe.status}`
  );
}

// Claiming a shop sets `claimed_by` and leaves `created_by` where it was, so
// ownership spelled as `created_by = auth.uid()` never expires. The account that
// imported a shop first kept write access after its real owner claimed it —
// including over `contact_email`, the address send-inquiry mails buyers to.
console.log('\nownership after a claim');
{
  const admin = {
    apikey: SERVICE,
    Authorization: `Bearer ${SERVICE}`,
    'Content-Type': 'application/json',
  };

  const readShop = async (columns) =>
    (
      await fetch(`${URL}/rest/v1/dealers?id=eq.${dealerId}&select=${columns}`, { headers: admin })
    ).json();

  const before = await readShop('name,contact_email');

  // An update that no policy admits touches no rows and is not an error, so the
  // column is the only honest assertion here.
  await api(`/rest/v1/dealers?id=eq.${dealerId}`, {
    token: importer.token,
    method: 'PATCH',
    body: { contact_email: 'attacker@example.com' },
  });
  const afterEmail = await readShop('contact_email');
  check(
    'the original importer cannot redirect inquiry mail',
    afterEmail?.[0]?.contact_email === before?.[0]?.contact_email,
    `contact_email became ${afterEmail?.[0]?.contact_email}`
  );

  await api(`/rest/v1/dealers?id=eq.${dealerId}`, {
    token: importer.token,
    method: 'PATCH',
    body: { name: 'Importer Renamed This' },
  });
  const afterName = await readShop('name');
  check(
    'the original importer cannot rename a claimed shop',
    afterName?.[0]?.name === before?.[0]?.name,
    `name became ${afterName?.[0]?.name}`
  );

  // The other half of the rule: the account that claimed the shop owns it.
  await api(`/rest/v1/dealers?id=eq.${dealerId}`, {
    token: dealerUser.token,
    method: 'PATCH',
    body: { name: 'Claimed And Renamed' },
  });
  const byOwner = await readShop('name');
  check(
    'the account that claimed the shop can rename it',
    byOwner?.[0]?.name === 'Claimed And Renamed',
    `name is ${byOwner?.[0]?.name}`
  );

  await fetch(`${URL}/rest/v1/dealers?id=eq.${dealerId}`, {
    method: 'PATCH',
    headers: admin,
    body: JSON.stringify({ name: before?.[0]?.name }),
  });
}

// `imported_by` records who fetched a listing once. It was also accepted as
// permission to update one, on either side of the write — so a listing could be
// moved onto any approved shop and appear in the deck under that shop's name.
console.log('\nmoving a listing between shops');
{
  const admin = {
    apikey: SERVICE,
    Authorization: `Bearer ${SERVICE}`,
    'Content-Type': 'application/json',
  };

  const strangerShop = await fetch(`${URL}/rest/v1/dealers`, {
    method: 'POST',
    headers: { ...admin, Prefer: 'return=representation' },
    body: JSON.stringify({
      name: `Stranger ${stamp}`,
      website: `https://stranger-${stamp}.example.com`,
      permission: 'approved',
      created_by: buyer.id,
      claimed_by: buyer.id,
    }),
  }).then((r) => r.json());
  const strangerId = strangerShop?.[0]?.id;

  const readDealerOf = async (id) =>
    (
      await fetch(`${URL}/rest/v1/listings?id=eq.${id}&select=dealer_id`, { headers: admin })
    ).json();

  await api(`/rest/v1/listings?id=eq.${listingId}`, {
    token: importer.token,
    method: 'PATCH',
    body: { dealer_id: strangerId },
  });
  const moved = await readDealerOf(listingId);
  check(
    'a listing cannot be moved onto a shop the caller does not control',
    moved?.[0]?.dealer_id === dealerId,
    `dealer_id became ${moved?.[0]?.dealer_id}`
  );

  // The rule has to leave the ordinary edit working, which is the listing editor
  // changing a price on stock the signed-in dealer actually owns.
  const priced = await api(`/rest/v1/listings?id=eq.${listingId}`, {
    token: dealerUser.token,
    method: 'PATCH',
    body: { price_cents: 1234500 },
  });
  const afterPrice = await fetch(
    `${URL}/rest/v1/listings?id=eq.${listingId}&select=price_cents`,
    { headers: admin }
  ).then((r) => r.json());
  check(
    'the shop owner can still edit their own listing',
    afterPrice?.[0]?.price_cents === 1234500,
    `${priced.status}, price is ${afterPrice?.[0]?.price_cents}`
  );

  if (strangerId) {
    await fetch(`${URL}/rest/v1/dealers?id=eq.${strangerId}`, { method: 'DELETE', headers: admin });
  }
}

console.log('\ndelete account');
{
  const doomed = await createUser(`doomed-${stamp}@example.com`);
  const shop = await api('/rest/v1/dealers?select=id', {
    token: doomed.token,
    method: 'POST',
    body: {
      name: 'Doomed Shop',
      website: `https://doomed-${stamp}.test`,
      created_by: doomed.id,
    },
    prefer: 'return=representation',
  });
  const doomedShopId = shop.body?.[0]?.id;
  check('a user about to leave can still add a shop', Boolean(doomedShopId), `got ${shop.status}`);

  await fetch(`${URL}/rest/v1/dealers?id=eq.${doomedShopId}`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ permission: 'approved', claimed_by: doomed.id }),
  });

  const watch = await api('/rest/v1/listings', {
    token: doomed.token,
    method: 'POST',
    body: {
      dealer_id: doomedShopId,
      imported_by: doomed.id,
      brand: 'Omega',
      model: 'Datejust',
      price_cents: 5000000,
    },
    prefer: 'return=representation',
  });
  const doomedWatchId = watch.body?.[0]?.id;
  if (doomedWatchId) await attachGallery(doomedWatchId);
  check('that shop can carry a listing', Boolean(doomedWatchId), `got ${watch.status}`);

  const signedOut = await api('/rest/v1/rpc/delete_own_account', {
    method: 'POST',
    body: {},
  });
  check(
    'a signed-out caller cannot delete an account',
    signedOut.status >= 400,
    `got ${signedOut.status}`
  );

  const deleted = await api('/rest/v1/rpc/delete_own_account', {
    token: doomed.token,
    method: 'POST',
    body: {},
  });
  check(
    'a user can delete their own account',
    deleted.status < 300,
    `got ${deleted.status} ${JSON.stringify(deleted.body)}`
  );

  const adminHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
  const profileGone = await fetch(`${URL}/rest/v1/profiles?id=eq.${doomed.id}`, {
    headers: adminHeaders,
  }).then((r) => r.json());
  check(
    'deleting an account removes the profile',
    Array.isArray(profileGone) && profileGone.length === 0
  );

  const shopLeft = await fetch(
    `${URL}/rest/v1/dealers?id=eq.${doomedShopId}&select=id,claimed_by,created_by`,
    { headers: adminHeaders }
  ).then((r) => r.json());
  check(
    'a shop survives its owner deleting their account',
    shopLeft?.[0]?.id === doomedShopId,
    JSON.stringify(shopLeft)
  );
  check('the claim is released', shopLeft?.[0]?.claimed_by === null);
  check('the creator pointer is cleared', shopLeft?.[0]?.created_by === null);

  const watchLeft = await fetch(
    `${URL}/rest/v1/listings?id=eq.${doomedWatchId}&select=id,imported_by`,
    { headers: adminHeaders }
  ).then((r) => r.json());
  check(
    'listings survive the importer deleting their account',
    watchLeft?.[0]?.id === doomedWatchId
  );
  check('the importer pointer is cleared', watchLeft?.[0]?.imported_by === null);

  const deck = await api('/rest/v1/rpc/get_deck', {
    token: buyer.token,
    method: 'POST',
    body: { p_limit: 50 },
  });
  check(
    "those listings stay in other buyers' decks",
    deck.body?.some((row) => row.id === doomedWatchId)
  );

  if (doomedShopId) {
    await fetch(`${URL}/rest/v1/dealers?id=eq.${doomedShopId}`, {
      method: 'DELETE',
      headers: adminHeaders,
    });
  }
}

// The tests approve a dealer to prove the deck respects permission, which put
// fixtures in front of real users. Clean up rather than leave them there.
async function cleanUp() {
  const admin = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

  for (const id of [dealerId, codeDealerId, acceptedDealerId, dropDealerId]) {
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

console.log('\nmessages');
{
  const handle = `ada${String(stamp).slice(-6)}`;

  const peeked = await api(`/rest/v1/profiles?handle=eq.${handle}&select=id`, {
    token: importer.token,
  });
  check(
    'a username does not open someone else\'s profile',
    Array.isArray(peeked.body) && peeked.body.length === 0,
    JSON.stringify(peeked.body),
  );

  const opened = await api('/rest/v1/rpc/conversation_with_handle', {
    token: importer.token,
    method: 'POST',
    body: { p_handle: handle },
  });
  check(
    'a username opens one thread',
    opened.status < 300 && typeof opened.body === 'string',
    JSON.stringify(opened.body),
  );

  const again = await api('/rest/v1/rpc/conversation_with_handle', {
    token: importer.token,
    method: 'POST',
    body: { p_handle: `@${handle.toUpperCase()}` },
  });
  check(
    'the same username opens the same thread',
    again.status < 300 && again.body === opened.body,
    JSON.stringify(again.body),
  );

  const own = await api('/rest/v1/rpc/conversation_with_handle', {
    token: buyer.token,
    method: 'POST',
    body: { p_handle: handle },
  });
  check(
    'you cannot message your own username',
    own.status >= 400 && String(own.body?.message ?? '').includes('yours'),
    JSON.stringify(own.body),
  );

  const missing = await api('/rest/v1/rpc/conversation_with_handle', {
    token: importer.token,
    method: 'POST',
    body: { p_handle: `nobody${String(stamp).slice(-6)}` },
  });
  check(
    'an unused username is refused',
    missing.status >= 400 && String(missing.body?.message ?? '').includes('No one has'),
    JSON.stringify(missing.body),
  );

  const partial = await api('/rest/v1/rpc/conversation_with_handle', {
    token: importer.token,
    method: 'POST',
    body: { p_handle: 'no' },
  });
  check('a partial username is refused', partial.status >= 400, JSON.stringify(partial.body));

  const anon = await api('/rest/v1/rpc/conversation_with_handle', {
    method: 'POST',
    body: { p_handle: handle },
  });
  check('a guest cannot open a thread by username', anon.status >= 400, JSON.stringify(anon.body));

  const blank = await api('/rest/v1/rpc/suggest_people', {
    token: importer.token,
    method: 'POST',
    body: { p_query: '  ' },
  });
  check(
    'an empty search suggests at most eight, people you talk to first, never you',
    blank.status < 300 &&
      Array.isArray(blank.body) &&
      blank.body.length <= 8 &&
      blank.body.some((row) => row.handle === handle) &&
      !blank.body.some((row) => row.id === importer.id),
    JSON.stringify(blank.body),
  );

  const suggested = await api('/rest/v1/rpc/suggest_people', {
    token: importer.token,
    method: 'POST',
    body: { p_query: handle.slice(0, 4) },
  });
  check(
    'a username prefix suggests that person',
    suggested.status < 300 &&
      suggested.body?.some((row) => row.handle === handle && row.name === 'Ada Byron'),
    JSON.stringify(suggested.body),
  );

  const byName = await api('/rest/v1/rpc/suggest_people', {
    token: importer.token,
    method: 'POST',
    body: { p_query: 'byr' },
  });
  check(
    'a last name suggests that person too',
    byName.status < 300 && byName.body?.some((row) => row.handle === handle),
    JSON.stringify(byName.body),
  );

  const self = await api('/rest/v1/rpc/suggest_people', {
    token: buyer.token,
    method: 'POST',
    body: { p_query: handle },
  });
  check(
    'you are not a suggestion for yourself',
    self.status < 300 && !self.body?.some((row) => row.id === buyer.id),
    JSON.stringify(self.body),
  );

  const guest = await api('/rest/v1/rpc/suggest_people', {
    method: 'POST',
    body: { p_query: handle },
  });
  check('a guest cannot search people', guest.status >= 400, JSON.stringify(guest.body));

  const collector = await api('/rest/v1/rpc/collector_profile', {
    token: importer.token,
    method: 'POST',
    body: { p_user_id: buyer.id },
  });
  check(
    'a message avatar opens that collector profile',
    collector.status < 300 &&
      collector.body?.[0]?.id === buyer.id &&
      collector.body?.[0]?.handle === handle &&
      collector.body?.[0]?.name === 'Ada Byron',
    JSON.stringify(collector.body),
  );

  const missingCollector = await api('/rest/v1/rpc/collector_profile', {
    token: importer.token,
    method: 'POST',
    body: { p_user_id: '00000000-0000-0000-0000-000000000000' },
  });
  check(
    'a missing collector returns no profile',
    missingCollector.status < 300 &&
      Array.isArray(missingCollector.body) &&
      missingCollector.body.length === 0,
    JSON.stringify(missingCollector.body),
  );

  const guestCollector = await api('/rest/v1/rpc/collector_profile', {
    method: 'POST',
    body: { p_user_id: buyer.id },
  });
  check(
    'a guest cannot open a collector profile',
    guestCollector.status >= 400,
    JSON.stringify(guestCollector.body),
  );

  const phrase = `secret-phrase-${stamp}`;
  const sent = await api('/rest/v1/messages', {
    token: importer.token,
    method: 'POST',
    prefer: 'return=minimal',
    body: {
      conversation_id: opened.body,
      sender_id: importer.id,
      body: phrase,
    },
  });
  check('the opener can write in the thread', sent.status < 300, JSON.stringify(sent.body));

  const dealOffer = await api('/rest/v1/rpc/create_conversation_deal', {
    token: importer.token,
    method: 'POST',
    body: {
      p_conversation_id: opened.body,
      p_amount_cents: 1250000,
      p_currency: 'USD',
      p_proposer_is_seller: false,
    },
  });
  check(
    'either side can offer a deal in a peer thread',
    dealOffer.status < 300 && typeof dealOffer.body === 'string',
    JSON.stringify(dealOffer.body),
  );

  const dealRead = await api(
    `/rest/v1/conversation_deals?conversation_id=eq.${opened.body}&select=id,amount_cents,status`,
    { token: buyer.token },
  );
  check(
    'the other person can read the deal',
    Array.isArray(dealRead.body) &&
      dealRead.body.length === 1 &&
      dealRead.body[0].amount_cents === 1250000,
    JSON.stringify(dealRead.body),
  );

  const dealEavesdrop = await api(
    `/rest/v1/conversation_deals?conversation_id=eq.${opened.body}&select=id`,
    { token: dealerUser.token },
  );
  check(
    'someone outside the thread cannot read the deal',
    Array.isArray(dealEavesdrop.body) && dealEavesdrop.body.length === 0,
    JSON.stringify(dealEavesdrop.body),
  );

  const found = await api(
    `/rest/v1/messages?select=conversation_id&body=ilike.*${phrase}*`,
    { token: buyer.token },
  );
  check(
    'the other person can search that message',
    Array.isArray(found.body) && found.body.some((row) => row.conversation_id === opened.body),
    JSON.stringify(found.body),
  );

  const hidden = await api(
    `/rest/v1/messages?select=conversation_id&body=ilike.*${phrase}*`,
    { token: dealerUser.token },
  );
  check(
    'someone outside the thread cannot search it',
    Array.isArray(hidden.body) && hidden.body.length === 0,
    JSON.stringify(hidden.body),
  );

  const grace = `grace${String(stamp).slice(-6)}`;
  const claimedGrace = await api('/rest/v1/rpc/claim_username', {
    token: dealerUser.token,
    method: 'POST',
    body: { candidate: grace },
  });
  check('a second person can claim a username', claimedGrace.status < 300, JSON.stringify(claimedGrace.body));

  const namedGrace = await api(`/rest/v1/profiles?id=eq.${dealerUser.id}`, {
    token: dealerUser.token,
    method: 'PATCH',
    body: { first_name: 'Grace', last_name: 'Hopper' },
  });
  check('that person can set their name', namedGrace.status < 300, `got ${namedGrace.status}`);

  const outsider = await createUser(`group-out-${stamp}@example.com`);
  try {
    const alone = await api('/rest/v1/rpc/create_group', {
      token: importer.token,
      method: 'POST',
      body: { p_member_ids: [buyer.id] },
    });
    check(
      'a group needs two other people',
      alone.status >= 400 && String(alone.body?.message ?? '').includes('two'),
      JSON.stringify(alone.body),
    );

    const guestGroup = await api('/rest/v1/rpc/create_group', {
      method: 'POST',
      body: { p_member_ids: [buyer.id, dealerUser.id] },
    });
    check('a guest cannot create a group', guestGroup.status >= 400, JSON.stringify(guestGroup.body));

    const forged = await api('/rest/v1/conversations', {
      token: importer.token,
      method: 'POST',
      prefer: 'return=minimal',
      body: { opener_id: importer.id, is_group: true, members_key: 'forged' },
    });
    check(
      'you cannot open a group except through create_group',
      forged.status >= 400,
      JSON.stringify(forged.body),
    );

    const grouped = await api('/rest/v1/rpc/create_group', {
      token: importer.token,
      method: 'POST',
      body: { p_member_ids: [buyer.id, dealerUser.id] },
    });
    check(
      'two people open one group',
      grouped.status < 300 && typeof grouped.body === 'string',
      JSON.stringify(grouped.body),
    );

    const same = await api('/rest/v1/rpc/create_group', {
      token: buyer.token,
      method: 'POST',
      body: { p_member_ids: [dealerUser.id, importer.id] },
    });
    check(
      'the same people open the same group',
      same.status < 300 && same.body === grouped.body,
      JSON.stringify(same.body),
    );

    const groupId = grouped.body;
    const members = await api(
      `/rest/v1/conversation_members?conversation_id=eq.${groupId}&select=user_id`,
      { token: buyer.token },
    );
    check(
      'a member can see who is in the group',
      Array.isArray(members.body) && members.body.length === 3,
      JSON.stringify(members.body),
    );

    const hiddenMembers = await api(
      `/rest/v1/conversation_members?conversation_id=eq.${groupId}&select=user_id`,
      { token: outsider.token },
    );
    check(
      'a stranger cannot see who is in the group',
      Array.isArray(hiddenMembers.body) && hiddenMembers.body.length === 0,
      JSON.stringify(hiddenMembers.body),
    );

    const joined = await api('/rest/v1/conversation_members', {
      token: outsider.token,
      method: 'POST',
      prefer: 'return=minimal',
      body: { conversation_id: groupId, user_id: outsider.id },
    });
    check(
      'a stranger cannot add themselves to a group',
      joined.status >= 400,
      JSON.stringify(joined.body),
    );

    const heard = await api('/rest/v1/messages', {
      token: buyer.token,
      method: 'POST',
      prefer: 'return=minimal',
      body: {
        conversation_id: groupId,
        sender_id: buyer.id,
        body: `group-secret-${stamp}`,
      },
    });
    check('a member can write in the group', heard.status < 300, JSON.stringify(heard.body));

    const eavesdrop = await api('/rest/v1/messages', {
      token: outsider.token,
      method: 'POST',
      prefer: 'return=minimal',
      body: {
        conversation_id: groupId,
        sender_id: outsider.id,
        body: 'nope',
      },
    });
    check(
      'a stranger cannot write in the group',
      eavesdrop.status >= 400,
      JSON.stringify(eavesdrop.body),
    );

    const readGroup = await api(
      `/rest/v1/messages?conversation_id=eq.${groupId}&select=id`,
      { token: outsider.token },
    );
    check(
      'a stranger cannot read the group',
      Array.isArray(readGroup.body) && readGroup.body.length === 0,
      JSON.stringify(readGroup.body),
    );

    const listed = await api('/rest/v1/rpc/conversation_list', {
      token: importer.token,
      method: 'POST',
      body: {},
    });
    const groupRow = Array.isArray(listed.body)
      ? listed.body.find((row) => row.id === groupId)
      : null;
    check(
      'the group is in your list, named for the other people',
      groupRow?.is_group === true &&
        groupRow.member_count === 3 &&
        groupRow.group_names?.includes('Ada Byron') &&
        groupRow.group_names?.includes('Grace Hopper') &&
        groupRow.last_sender_name === 'Ada',
      JSON.stringify(groupRow),
    );

    const titled = await api('/rest/v1/rpc/create_group', {
      token: importer.token,
      method: 'POST',
      body: { p_member_ids: [buyer.id, dealerUser.id], p_title: '  Friday desk  ' },
    });
    check(
      'naming the same people keeps that group',
      titled.status < 300 && titled.body === groupId,
      JSON.stringify(titled.body),
    );

    const namedList = await api('/rest/v1/rpc/conversation_list', {
      token: importer.token,
      method: 'POST',
      body: {},
    });
    const namedRow = Array.isArray(namedList.body)
      ? namedList.body.find((row) => row.id === groupId)
      : null;
    check(
      'a group name replaces the list of people',
      namedRow?.group_names?.length === 1 && namedRow.group_names[0] === 'Friday desk',
      JSON.stringify(namedRow),
    );

    const renamed = await api('/rest/v1/rpc/create_group', {
      token: buyer.token,
      method: 'POST',
      body: { p_member_ids: [dealerUser.id, importer.id], p_title: 'Other name' },
    });
    const keptList = await api('/rest/v1/rpc/conversation_list', {
      token: importer.token,
      method: 'POST',
      body: {},
    });
    const keptRow = Array.isArray(keptList.body)
      ? keptList.body.find((row) => row.id === groupId)
      : null;
    check(
      'a second name does not replace the first',
      renamed.status < 300 &&
        renamed.body === groupId &&
        keptRow?.group_names?.length === 1 &&
        keptRow.group_names[0] === 'Friday desk',
      JSON.stringify(keptRow),
    );

    const tooLong = await api('/rest/v1/rpc/create_group', {
      token: importer.token,
      method: 'POST',
      body: { p_member_ids: [buyer.id, dealerUser.id], p_title: 'x'.repeat(41) },
    });
    check(
      'a group name is at most 40 characters',
      tooLong.status >= 400 && String(tooLong.body?.message ?? '').includes('40'),
      JSON.stringify(tooLong.body),
    );

    const renamedGroup = await api('/rest/v1/rpc/rename_group', {
      token: buyer.token,
      method: 'POST',
      body: { p_conversation_id: groupId, p_title: '  Saturday desk  ' },
    });
    const afterRename = await api('/rest/v1/rpc/conversation_list', {
      token: importer.token,
      method: 'POST',
      body: {},
    });
    const renamedRow = Array.isArray(afterRename.body)
      ? afterRename.body.find((row) => row.id === groupId)
      : null;
    check(
      'a member can rename the group',
      renamedGroup.status < 300 &&
        renamedRow?.group_title === 'Saturday desk' &&
        renamedRow?.group_names?.length === 1 &&
        renamedRow.group_names[0] === 'Saturday desk',
      JSON.stringify({ renamedGroup: renamedGroup.body, renamedRow }),
    );

    const strangerRename = await api('/rest/v1/rpc/rename_group', {
      token: outsider.token,
      method: 'POST',
      body: { p_conversation_id: groupId, p_title: 'Stolen' },
    });
    check(
      'a stranger cannot rename the group',
      strangerRename.status >= 400,
      JSON.stringify(strangerRename.body),
    );

    const longRename = await api('/rest/v1/rpc/rename_group', {
      token: importer.token,
      method: 'POST',
      body: { p_conversation_id: groupId, p_title: 'x'.repeat(41) },
    });
    check(
      'renaming still stops at 40 characters',
      longRename.status >= 400 && String(longRename.body?.message ?? '').includes('40'),
      JSON.stringify(longRename.body),
    );

    const directRename = await api('/rest/v1/rpc/rename_group', {
      token: importer.token,
      method: 'POST',
      body: { p_conversation_id: opened.body, p_title: 'Not a group' },
    });
    check(
      'a direct thread cannot be renamed',
      directRename.status >= 400,
      JSON.stringify(directRename.body),
    );

    const cleared = await api('/rest/v1/rpc/rename_group', {
      token: dealerUser.token,
      method: 'POST',
      body: { p_conversation_id: groupId, p_title: '   ' },
    });
    const clearedList = await api('/rest/v1/rpc/conversation_list', {
      token: importer.token,
      method: 'POST',
      body: {},
    });
    const clearedRow = Array.isArray(clearedList.body)
      ? clearedList.body.find((row) => row.id === groupId)
      : null;
    check(
      'clearing the name returns the other people',
      cleared.status < 300 &&
        clearedRow?.group_title == null &&
        clearedRow?.group_names?.includes('Ada Byron') &&
        clearedRow?.group_names?.includes('Grace Hopper'),
      JSON.stringify(clearedRow),
    );

    const strangersList = await api('/rest/v1/rpc/conversation_list', {
      token: outsider.token,
      method: 'POST',
      body: {},
    });
    check(
      'a stranger does not see the group in their list',
      Array.isArray(strangersList.body) && !strangersList.body.some((row) => row.id === groupId),
      JSON.stringify(strangersList.body),
    );

    const header = await api('/rest/v1/rpc/conversation_header', {
      token: dealerUser.token,
      method: 'POST',
      body: { p_conversation_id: groupId },
    });
    const head = header.body?.[0];
    check(
      'a member can open the group, and does not see themselves in its names',
      header.status < 300 &&
        head?.is_group === true &&
        head.writable === true &&
        head.member_count === 3 &&
        Array.isArray(head.members) &&
        head.members.length === 2 &&
        !head.members.some((member) => member.id === dealerUser.id) &&
        head.members.some((member) => member.handle === handle),
      JSON.stringify(header.body),
    );

  } finally {
    await fetch(`${URL}/auth/v1/admin/users/${outsider.id}`, {
      method: 'DELETE',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
    });
  }
}

console.log('\nlisting inquiry messages');
{
  const thread = await api('/rest/v1/rpc/conversation_about_listing', {
    token: buyer.token,
    method: 'POST',
    body: { p_listing_id: listingId },
  });
  check(
    'a buyer can open the shop thread from a watch',
    thread.status < 300 && typeof thread.body === 'string',
    JSON.stringify(thread.body),
  );

  const inquiry = await api('/rest/v1/messages', {
    token: buyer.token,
    method: 'POST',
    prefer: 'return=minimal',
    body: {
      conversation_id: thread.body,
      sender_id: buyer.id,
      body: `still available-${stamp}`,
      listing_id: listingId,
    },
  });
  check(
    'the buyer can name the watch on the first message',
    inquiry.status < 300,
    JSON.stringify(inquiry.body),
  );

  const forged = await api('/rest/v1/messages', {
    token: dealerUser.token,
    method: 'POST',
    prefer: 'return=minimal',
    body: {
      conversation_id: thread.body,
      sender_id: dealerUser.id,
      body: 'wrong listing',
      listing_id: listingId,
    },
  });
  check(
    'the dealer cannot attach a listing_id on send',
    forged.status >= 400,
    JSON.stringify(forged.body),
  );
}

console.log('\ndeal flow: offer → accept → pay → ship → receive → review');
{
  const admin = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };
  const rival = await createUser(`rival-${stamp}@example.com`);
  const dealRow = (id, token) =>
    api(
      `/rest/v1/conversation_deals?id=eq.${id}&select=id,status,expires_at,accepted_at,funded_at,ship_by,shipped_at,completed_at,reviewed_at,ship_to,tracking_carrier,tracking_number,cancelled_reason,payment_provider`,
      { token },
    ).then((res) => res.body?.[0] ?? null);
  const rpc = (name, token, body) => api(`/rest/v1/rpc/${name}`, { token, method: 'POST', body });

  try {
    const buyerThread = await rpc('conversation_about_listing', buyer.token, { p_listing_id: listingId });
    const rivalThread = await rpc('conversation_about_listing', rival.token, { p_listing_id: listingId });
    check(
      'two buyers each get their own shop thread for the same watch',
      typeof buyerThread.body === 'string' &&
        typeof rivalThread.body === 'string' &&
        buyerThread.body !== rivalThread.body,
    );

    const tooShort = await rpc('create_conversation_deal', dealerUser.token, {
      p_conversation_id: buyerThread.body,
      p_amount_cents: 1100000,
      p_currency: 'USD',
      p_listing_id: listingId,
      p_proposer_is_seller: true,
      p_expires_in_hours: 0,
    });
    check(
      'an offer must last at least an hour',
      tooShort.status >= 400 && String(tooShort.body?.message ?? '').includes('1 hour'),
      JSON.stringify(tooShort.body),
    );

    const offered = await rpc('create_conversation_deal', dealerUser.token, {
      p_conversation_id: buyerThread.body,
      p_amount_cents: 1100000,
      p_currency: 'USD',
      p_listing_id: listingId,
      p_proposer_is_seller: true,
      p_expires_in_hours: 24,
    });
    check('the shop offers the buyer a deal with a 24h clock', offered.status < 300, JSON.stringify(offered.body));
    const dealId = offered.body;

    const fresh = await dealRow(dealId, buyer.token);
    const hoursLeft = fresh?.expires_at ? (new Date(fresh.expires_at) - Date.now()) / 3_600_000 : 0;
    check(
      'the buyer sees the expiry about a day out',
      hoursLeft > 23 && hoursLeft < 24.1,
      `hours left ${hoursLeft.toFixed(2)}`,
    );

    const rivalOffer = await rpc('create_conversation_deal', dealerUser.token, {
      p_conversation_id: rivalThread.body,
      p_amount_cents: 1150000,
      p_currency: 'USD',
      p_listing_id: listingId,
      p_proposer_is_seller: true,
    });
    check('the shop can offer the same watch to a second buyer', rivalOffer.status < 300, JSON.stringify(rivalOffer.body));
    const rivalDealId = rivalOffer.body;

    const shipTo = {
      name: 'Ada Byron',
      line1: '1 Analytical Way',
      line2: '',
      city: 'London',
      region: 'LDN',
      postal_code: 'W1 1AA',
      country: 'GB',
      phone: '',
    };

    const payEarly = await rpc('fund_conversation_deal', buyer.token, {
      p_deal_id: dealId,
      p_ship_to: shipTo,
      p_payment_label: 'Test card',
    });
    check('a buyer cannot pay before accepting', payEarly.status >= 400, JSON.stringify(payEarly.body));

    const sellerAccept = await rpc('respond_to_conversation_deal', dealerUser.token, {
      p_deal_id: dealId,
      p_action: 'accept',
    });
    check('the proposer cannot accept their own offer', sellerAccept.status >= 400, JSON.stringify(sellerAccept.body));

    const accepted = await rpc('respond_to_conversation_deal', buyer.token, {
      p_deal_id: dealId,
      p_action: 'accept',
    });
    check('the buyer accepts the offer', accepted.status < 300, JSON.stringify(accepted.body));

    const afterAccept = await dealRow(dealId, buyer.token);
    check(
      'accepting stamps accepted_at',
      afterAccept?.status === 'accepted' && afterAccept.accepted_at !== null,
      JSON.stringify(afterAccept),
    );

    const rivalAfter = await dealRow(rivalDealId, rival.token);
    check(
      "accepting closes the shop's other open offer on that watch",
      rivalAfter?.status === 'cancelled' && rivalAfter.cancelled_reason === 'listing_reserved',
      JSON.stringify(rivalAfter),
    );
    const rivalNote = await api(
      `/rest/v1/messages?conversation_id=eq.${rivalThread.body}&deal_id=eq.${rivalDealId}&select=body&order=created_at.desc&limit=1`,
      { token: rival.token },
    );
    check(
      'the other buyer is told the watch was reserved',
      String(rivalNote.body?.[0]?.body ?? '').includes('reserved'),
      JSON.stringify(rivalNote.body),
    );

    const payIncomplete = await rpc('fund_conversation_deal', buyer.token, {
      p_deal_id: dealId,
      p_ship_to: { name: 'Ada', line1: '1 Analytical Way' },
      p_payment_label: 'Test card',
    });
    check(
      'payment needs a full shipping address',
      payIncomplete.status >= 400 && String(payIncomplete.body?.message ?? '').includes('address'),
      JSON.stringify(payIncomplete.body),
    );

    const sellerPays = await rpc('fund_conversation_deal', dealerUser.token, {
      p_deal_id: dealId,
      p_ship_to: shipTo,
      p_payment_label: 'Test card',
    });
    check('the seller cannot pay for the buyer', sellerPays.status >= 400, JSON.stringify(sellerPays.body));

    const paid = await rpc('fund_conversation_deal', buyer.token, {
      p_deal_id: dealId,
      p_ship_to: shipTo,
      p_payment_label: 'Test card •••• 4242',
    });
    check('the buyer pays (test hold) with an address', paid.status < 300, JSON.stringify(paid.body));

    const afterPay = await dealRow(dealId, dealerUser.token);
    const shipByDays = afterPay?.ship_by ? (new Date(afterPay.ship_by) - Date.now()) / 86_400_000 : 0;
    check(
      'payment starts a five-day shipping clock and stores a dev hold',
      afterPay?.status === 'funded' &&
        afterPay.funded_at !== null &&
        afterPay.payment_provider === 'dev_hold' &&
        shipByDays > 4.9 &&
        shipByDays < 5.1,
      JSON.stringify(afterPay),
    );
    check(
      'the seller reads the ship-to block, nothing more',
      afterPay?.ship_to?.line1 === shipTo.line1 && afterPay.ship_to.country === 'GB',
      JSON.stringify(afterPay?.ship_to),
    );

    const completeEarly = await rpc('complete_conversation_deal', buyer.token, { p_deal_id: dealId });
    check(
      'the buyer cannot confirm receipt before it ships',
      completeEarly.status >= 400 && String(completeEarly.body?.message ?? '').includes('ship'),
      JSON.stringify(completeEarly.body),
    );

    const buyerShips = await rpc('ship_conversation_deal', buyer.token, {
      p_deal_id: dealId,
      p_carrier: 'UPS',
      p_tracking_number: '1Z999AA10123456784',
    });
    check('only the seller can mark it shipped', buyerShips.status >= 400, JSON.stringify(buyerShips.body));

    const shipped = await rpc('ship_conversation_deal', dealerUser.token, {
      p_deal_id: dealId,
      p_carrier: 'UPS',
      p_tracking_number: '1Z999AA10123456784',
    });
    check('the seller enters carrier and tracking from their own label', shipped.status < 300, JSON.stringify(shipped.body));

    const afterShip = await dealRow(dealId, buyer.token);
    check(
      'the buyer sees the tracking in the deal',
      afterShip?.status === 'shipped' &&
        afterShip.tracking_carrier === 'UPS' &&
        afterShip.tracking_number === '1Z999AA10123456784' &&
        afterShip.shipped_at !== null,
      JSON.stringify(afterShip),
    );

    const reviewEarly = await rpc('review_conversation_deal', buyer.token, { p_deal_id: dealId, p_rating: 5 });
    check('no review before the deal completes', reviewEarly.status >= 400, JSON.stringify(reviewEarly.body));

    const sellerCompletes = await rpc('complete_conversation_deal', dealerUser.token, { p_deal_id: dealId });
    check('the seller cannot confirm receipt for the buyer', sellerCompletes.status >= 400, JSON.stringify(sellerCompletes.body));

    const completed = await rpc('complete_conversation_deal', buyer.token, { p_deal_id: dealId });
    check('the buyer confirms receipt', completed.status < 300, JSON.stringify(completed.body));

    const afterComplete = await dealRow(dealId, buyer.token);
    const soldListing = await api(`/rest/v1/listings?id=eq.${listingId}&select=sold_at`, { token: buyer.token });
    check(
      'completion stamps the deal and marks the watch sold',
      afterComplete?.status === 'completed' &&
        afterComplete.completed_at !== null &&
        soldListing.body?.[0]?.sold_at !== null,
      JSON.stringify({ deal: afterComplete, listing: soldListing.body }),
    );

    const sellerReviews = await rpc('review_conversation_deal', dealerUser.token, { p_deal_id: dealId, p_rating: 5 });
    check('the seller cannot review their own sale', sellerReviews.status >= 400, JSON.stringify(sellerReviews.body));

    const badRating = await rpc('review_conversation_deal', buyer.token, { p_deal_id: dealId, p_rating: 6 });
    check('a rating is 1 to 5', badRating.status >= 400, JSON.stringify(badRating.body));

    const reviewed = await rpc('review_conversation_deal', buyer.token, {
      p_deal_id: dealId,
      p_rating: 5,
      p_body: 'Packed well, shipped fast.',
    });
    check('the buyer rates the seller once', reviewed.status < 300, JSON.stringify(reviewed.body));

    const reviewRows = await api(
      `/rest/v1/deal_reviews?deal_id=eq.${dealId}&select=rating,body,reviewer_id,subject_id,dealer_id`,
      { token: rival.token },
    );
    check(
      'anyone signed in can read the review on the shop',
      reviewRows.body?.length === 1 &&
        reviewRows.body[0].rating === 5 &&
        reviewRows.body[0].reviewer_id === buyer.id &&
        reviewRows.body[0].subject_id === dealerUser.id &&
        reviewRows.body[0].dealer_id === dealerId,
      JSON.stringify(reviewRows.body),
    );
    const afterReview = await dealRow(dealId, buyer.token);
    check('the deal remembers it was reviewed', afterReview?.reviewed_at !== null, JSON.stringify(afterReview));

    const twice = await rpc('review_conversation_deal', buyer.token, { p_deal_id: dealId, p_rating: 1 });
    check('a second review on the same deal is refused', twice.status >= 400, JSON.stringify(twice.body));

    // Saved checkout details belong to one person. Another buyer, or the shop,
    // must not be able to read where somebody lives.
    const saved = await api('/rest/v1/checkout_defaults', {
      token: buyer.token,
      method: 'POST',
      prefer: 'return=minimal,resolution=merge-duplicates',
      body: { user_id: buyer.id, ship_to: shipTo, payment_label: 'Test card •••• 4242' },
    });
    check('a buyer saves their address and payment stand-in', saved.status < 300, JSON.stringify(saved.body));
    const ownDefaults = await api(`/rest/v1/checkout_defaults?user_id=eq.${buyer.id}&select=ship_to,payment_label`, {
      token: buyer.token,
    });
    check(
      'the buyer reads their own saved details',
      ownDefaults.body?.length === 1 && ownDefaults.body[0].ship_to?.city === 'London',
      JSON.stringify(ownDefaults.body),
    );
    const peek = await api(`/rest/v1/checkout_defaults?user_id=eq.${buyer.id}&select=ship_to`, {
      token: dealerUser.token,
    });
    check('the shop cannot read a buyer\'s saved address', Array.isArray(peek.body) && peek.body.length === 0, JSON.stringify(peek.body));
    const forgeDefaults = await api('/rest/v1/checkout_defaults', {
      token: rival.token,
      method: 'POST',
      prefer: 'return=minimal',
      body: { user_id: buyer.id, ship_to: shipTo },
    });
    check('nobody writes another person\'s checkout details', forgeDefaults.status >= 400, JSON.stringify(forgeDefaults.body));

    // An expired offer cannot be accepted. The clock is moved by hand with the
    // service key; waiting an hour in a test is not an option.
    const second = await api('/rest/v1/listings', {
      token: importer.token,
      method: 'POST',
      prefer: 'return=representation',
      body: { dealer_id: dealerId, imported_by: importer.id, brand: 'Tudor', model: 'Black Bay', price_cents: 400000 },
    });
    const secondId = second.body?.[0]?.id;
    const lateOffer = await rpc('create_conversation_deal', dealerUser.token, {
      p_conversation_id: buyerThread.body,
      p_amount_cents: 380000,
      p_currency: 'USD',
      p_listing_id: secondId,
      p_proposer_is_seller: true,
      p_expires_in_hours: 1,
    });
    check('a new offer opens once the last deal completed', lateOffer.status < 300, JSON.stringify(lateOffer.body));
    await fetch(`${URL}/rest/v1/conversation_deals?id=eq.${lateOffer.body}`, {
      method: 'PATCH',
      headers: admin,
      body: JSON.stringify({ expires_at: new Date(Date.now() - 60_000).toISOString() }),
    });
    const acceptLate = await rpc('respond_to_conversation_deal', buyer.token, {
      p_deal_id: lateOffer.body,
      p_action: 'accept',
    });
    check(
      'an expired offer cannot be accepted',
      acceptLate.status >= 400 && String(acceptLate.body?.message ?? '').includes('expired'),
      JSON.stringify(acceptLate.body),
    );
    const reoffer = await rpc('create_conversation_deal', dealerUser.token, {
      p_conversation_id: buyerThread.body,
      p_amount_cents: 370000,
      p_currency: 'USD',
      p_listing_id: secondId,
      p_proposer_is_seller: true,
    });
    const swept = await dealRow(lateOffer.body, buyer.token);
    check(
      'the next offer sweeps the expired one out of the way',
      reoffer.status < 300 && swept?.status === 'expired',
      JSON.stringify({ reoffer: reoffer.body, swept }),
    );
  } finally {
    await fetch(`${URL}/auth/v1/admin/users/${rival.id}`, {
      method: 'DELETE',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
    });
  }
}

console.log('\npush tokens');
{
  const bad = await api('/rest/v1/rpc/register_push_token', {
    token: buyer.token,
    method: 'POST',
    body: { p_token: 'not-a-token', p_platform: 'ios' },
  });
  check('a nonsense push token is refused', bad.status >= 400, JSON.stringify(bad.body));

  const web = await api('/rest/v1/rpc/register_push_token', {
    token: buyer.token,
    method: 'POST',
    body: { p_token: `ExponentPushToken[web${stamp}]`, p_platform: 'web' },
  });
  check(
    'a push token for an unknown platform is refused',
    web.status >= 400,
    JSON.stringify(web.body),
  );

  const expo = `ExponentPushToken[buyer${stamp}]`;
  const registered = await api('/rest/v1/rpc/register_push_token', {
    token: buyer.token,
    method: 'POST',
    body: { p_token: expo, p_platform: 'ios' },
  });
  check(
    'a user can register their own push token',
    registered.status < 300,
    JSON.stringify(registered.body),
  );

  const own = await api('/rest/v1/device_push_tokens?select=token,user_id', { token: buyer.token });
  check(
    'a user can read their own push token',
    Array.isArray(own.body) && own.body.some((row) => row.token === expo && row.user_id === buyer.id),
    JSON.stringify(own.body),
  );

  const other = await api('/rest/v1/device_push_tokens?select=token', { token: importer.token });
  check(
    "a user cannot read someone else's push token",
    Array.isArray(other.body) && other.body.length === 0,
    JSON.stringify(other.body),
  );

  const direct = await api('/rest/v1/device_push_tokens', {
    token: buyer.token,
    method: 'POST',
    body: { user_id: buyer.id, token: `ExponentPushToken[direct${stamp}]`, platform: 'ios' },
    prefer: 'return=representation',
  });
  check(
    'a client cannot insert a push token directly',
    direct.status >= 400,
    JSON.stringify(direct.body),
  );

  const anon = await api('/rest/v1/rpc/register_push_token', {
    method: 'POST',
    body: { p_token: expo, p_platform: 'ios' },
  });
  check(
    'a signed-out caller cannot register a push token',
    anon.status >= 400,
    JSON.stringify(anon.body),
  );

  const stolen = await api('/rest/v1/rpc/unregister_push_token', {
    token: importer.token,
    method: 'POST',
    body: { p_token: expo },
  });
  const still = await api('/rest/v1/device_push_tokens?select=token', { token: buyer.token });
  check(
    "someone else cannot remove your push token",
    stolen.status < 300 && Array.isArray(still.body) && still.body.some((row) => row.token === expo),
    JSON.stringify({ stolen: stolen.body, still: still.body }),
  );

  const moved = await api('/rest/v1/rpc/register_push_token', {
    token: importer.token,
    method: 'POST',
    body: { p_token: expo, p_platform: 'ios' },
  });
  const buyerAfter = await api('/rest/v1/device_push_tokens?select=token', { token: buyer.token });
  const importerAfter = await api('/rest/v1/device_push_tokens?select=token,user_id', {
    token: importer.token,
  });
  check(
    'registering a token moves it to the account now using the phone',
    moved.status < 300 &&
      Array.isArray(buyerAfter.body) &&
      !buyerAfter.body.some((row) => row.token === expo) &&
      Array.isArray(importerAfter.body) &&
      importerAfter.body.some((row) => row.token === expo && row.user_id === importer.id),
    JSON.stringify({
      moved: moved.body,
      buyerAfter: buyerAfter.body,
      importerAfter: importerAfter.body,
    }),
  );
}

console.log('\ndrops');
{
  const adminHeaders = {
    apikey: SERVICE,
    Authorization: `Bearer ${SERVICE}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  const created = await fetch(`${URL}/rest/v1/dealers?select=id`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      name: 'Craft + Tailored',
      website: `https://craft-${stamp}.test`,
      permission: 'approved',
      created_by: importer.id,
    }),
  });
  const createdBody = await created.json();
  dropDealerId = createdBody?.[0]?.id;
  check('a drop shop can be created for the test', created.status === 201 && Boolean(dropDealerId), JSON.stringify(createdBody));

  const buyerFollow = await api('/rest/v1/dealer_follows', {
    token: buyer.token,
    method: 'POST',
    body: { user_id: buyer.id, dealer_id: dropDealerId },
    prefer: 'return=minimal',
  });
  const otherFollow = await api('/rest/v1/dealer_follows', {
    token: dealerUser.token,
    method: 'POST',
    body: { user_id: dealerUser.id, dealer_id: dropDealerId },
    prefer: 'return=minimal',
  });
  check('a buyer can follow an approved shop', buyerFollow.status < 300, `got ${buyerFollow.status}`);
  check('a second buyer can follow the same shop', otherFollow.status < 300, `got ${otherFollow.status}`);

  await fetch(`${URL}/rest/v1/dealer_follows?dealer_id=eq.${dropDealerId}`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ created_at: '2020-06-01T00:00:00.000Z' }),
  });

  async function insertListing(fields) {
    const response = await fetch(`${URL}/rest/v1/listings?select=id`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        dealer_id: dropDealerId,
        imported_by: importer.id,
        brand: 'Omega',
        model: 'Speedmaster',
        price_cents: 1000000,
        ...fields,
      }),
    });
    const body = await response.json();
    const id = body?.[0]?.id;
    if (id) await attachGallery(id);
    return { status: response.status, id, body };
  }

  const oldListing = await insertListing({ created_at: '2019-01-01T00:00:00.000Z' });
  check('a listing from before the follow is stored', oldListing.status === 201, JSON.stringify(oldListing.body));

  const before = await api('/rest/v1/rpc/unseen_drop_count', {
    token: buyer.token,
    method: 'POST',
    body: {},
  });
  check('a watch listed before the follow is not unseen', before.body === 0, JSON.stringify(before.body));

  const day = 24 * 60 * 60 * 1000;
  const stale = await insertListing({
    created_at: new Date(Date.now() - 20 * day).toISOString(),
  });
  const staleCount = await api('/rest/v1/rpc/unseen_drop_count', {
    token: buyer.token,
    method: 'POST',
    body: {},
  });
  check(
    'a watch older than 14 days is not unseen even when the follow is older',
    stale.status === 201 && staleCount.body === 0,
    JSON.stringify({ stale: stale.body, count: staleCount.body }),
  );

  const fresh = await insertListing({ created_at: new Date(Date.now() - day).toISOString() });
  const sold = await insertListing({
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    sold_at: new Date().toISOString(),
  });
  const hidden = await insertListing({
    created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    status: 'hidden',
  });
  check(
    'new, sold, and hidden listings are stored',
    fresh.status === 201 && sold.status === 201 && hidden.status === 201,
    JSON.stringify({ fresh: fresh.body, sold: sold.body, hidden: hidden.body }),
  );

  const buyerCount = await api('/rest/v1/rpc/unseen_drop_count', {
    token: buyer.token,
    method: 'POST',
    body: {},
  });
  const otherCount = await api('/rest/v1/rpc/unseen_drop_count', {
    token: dealerUser.token,
    method: 'POST',
    body: {},
  });
  const strangerCount = await api('/rest/v1/rpc/unseen_drop_count', {
    token: importer.token,
    method: 'POST',
    body: {},
  });
  check('the follower has one unseen watch', buyerCount.body === 1, JSON.stringify(buyerCount.body));
  check('the other follower has their own unseen watch', otherCount.body === 1, JSON.stringify(otherCount.body));
  check('someone who does not follow has no unseen watches', strangerCount.body === 0, JSON.stringify(strangerCount.body));

  const byDealer = await api('/rest/v1/rpc/unseen_drops_by_dealer', {
    token: buyer.token,
    method: 'POST',
    body: {},
  });
  check(
    'the per-shop count names that shop',
    Array.isArray(byDealer.body) &&
      byDealer.body.length === 1 &&
      byDealer.body[0].dealer_id === dropDealerId &&
      byDealer.body[0].unseen === 1,
    JSON.stringify(byDealer.body),
  );

  const feed = await api('/rest/v1/rpc/followed_new_listing_ids', {
    token: buyer.token,
    method: 'POST',
    body: {},
  });
  const feedIds = Array.isArray(feed.body) ? feed.body.map((row) => row.id) : [];
  check(
    'the feed is watches listed after the follow, not the sold or hidden ones',
    feedIds.length === 1 && feedIds[0] === fresh.id,
    JSON.stringify(feed.body),
  );

  const marked = await api('/rest/v1/rpc/mark_drops_seen', {
    token: buyer.token,
    method: 'POST',
    body: { p_dealer_id: dropDealerId },
  });
  const afterMark = await api('/rest/v1/rpc/unseen_drop_count', {
    token: buyer.token,
    method: 'POST',
    body: {},
  });
  const otherStill = await api('/rest/v1/rpc/unseen_drop_count', {
    token: dealerUser.token,
    method: 'POST',
    body: {},
  });
  check(
    'opening the shop clears that buyer only',
    marked.body === 1 && afterMark.body === 0 && otherStill.body === 1,
    JSON.stringify({ marked: marked.body, afterMark: afterMark.body, otherStill: otherStill.body }),
  );

  const feedAfter = await api('/rest/v1/rpc/followed_new_listing_ids', {
    token: buyer.token,
    method: 'POST',
    body: {},
  });
  check(
    'the feed still lists the watch after the count clears',
    Array.isArray(feedAfter.body) && feedAfter.body.some((row) => row.id === fresh.id),
    JSON.stringify(feedAfter.body),
  );

  const views = await api('/rest/v1/drop_views?select=user_id,listing_id', { token: buyer.token });
  const otherViews = await api(
    `/rest/v1/drop_views?user_id=eq.${buyer.id}&select=listing_id`,
    { token: dealerUser.token },
  );
  check(
    'a buyer reads their own seen rows',
    Array.isArray(views.body) && views.body.some((row) => row.listing_id === fresh.id && row.user_id === buyer.id),
    JSON.stringify(views.body),
  );
  check(
    "a buyer cannot read someone else's seen rows",
    Array.isArray(otherViews.body) && otherViews.body.length === 0,
    JSON.stringify(otherViews.body),
  );

  const forged = await api('/rest/v1/drop_views', {
    token: buyer.token,
    method: 'POST',
    body: { user_id: dealerUser.id, listing_id: fresh.id },
    prefer: 'return=minimal',
  });
  check('a buyer cannot write a seen row for someone else', forged.status >= 400, `got ${forged.status}`);

  const paused = await fetch(`${URL}/rest/v1/dealers?id=eq.${dropDealerId}`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ permission: 'paused' }),
  });
  const pausedCount = await api('/rest/v1/rpc/unseen_drop_count', {
    token: dealerUser.token,
    method: 'POST',
    body: {},
  });
  check(
    'a paused shop drops out of the unseen count',
    paused.ok && pausedCount.body === 0,
    JSON.stringify(pausedCount.body),
  );
  await fetch(`${URL}/rest/v1/dealers?id=eq.${dropDealerId}`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ permission: 'approved' }),
  });

  const note = await fetch(`${URL}/rest/v1/drop_notifications?select=id,opened_at`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      user_id: buyer.id,
      listing_ids: [fresh.id],
      dealer_ids: [dropDealerId],
      title: 'New watches',
      body: '1 new watch from Craft + Tailored',
      destination: 'dealer',
      dealer_id: dropDealerId,
      notified_through: '2026-11-01T00:00:00.000Z',
      status: 'sent',
    }),
  });
  const noteBody = await note.json();
  const noteId = noteBody?.[0]?.id;
  check('the service role can log a drop', note.status === 201 && Boolean(noteId), JSON.stringify(noteBody));

  const ownNote = await api(`/rest/v1/drop_notifications?id=eq.${noteId}&select=body,user_id`, {
    token: buyer.token,
  });
  const hiddenNote = await api(`/rest/v1/drop_notifications?id=eq.${noteId}&select=id`, {
    token: dealerUser.token,
  });
  const anonNote = await api(`/rest/v1/drop_notifications?select=id&id=eq.${noteId}`);
  check(
    'a buyer can read their own drop log',
    Array.isArray(ownNote.body) && ownNote.body[0]?.user_id === buyer.id,
    JSON.stringify(ownNote.body),
  );
  check(
    "a buyer cannot read someone else's drop log",
    Array.isArray(hiddenNote.body) && hiddenNote.body.length === 0,
    JSON.stringify(hiddenNote.body),
  );
  check('a signed-out caller cannot read the drop log', anonNote.status >= 400, `got ${anonNote.status}`);

  const clientInsert = await api('/rest/v1/drop_notifications', {
    token: buyer.token,
    method: 'POST',
    body: {
      user_id: buyer.id,
      listing_ids: [fresh.id],
      dealer_ids: [dropDealerId],
      title: 'New watches',
      body: 'forged',
      destination: 'drops',
      notified_through: '2026-11-01T00:00:00.000Z',
    },
    prefer: 'return=minimal',
  });
  check('a buyer cannot insert a drop log row', clientInsert.status >= 400, `got ${clientInsert.status}`);

  const rewrite = await api(`/rest/v1/drop_notifications?id=eq.${noteId}`, {
    token: buyer.token,
    method: 'PATCH',
    body: { title: 'Changed' },
    prefer: 'return=minimal',
  });
  check('a buyer cannot rewrite the drop log', rewrite.status >= 400, `got ${rewrite.status}`);

  const opened = await api('/rest/v1/rpc/record_drop_opened', {
    token: buyer.token,
    method: 'POST',
    body: { p_id: noteId },
  });
  const openedRow = await api(`/rest/v1/drop_notifications?id=eq.${noteId}&select=opened_at`, {
    token: buyer.token,
  });
  const openedAt = openedRow.body?.[0]?.opened_at;
  check(
    'opening the push stamps the log with the current time',
    opened.status < 300 && typeof openedAt === 'string' && !openedAt.startsWith('2000'),
    JSON.stringify(openedRow.body),
  );

  const backdated = await api(`/rest/v1/drop_notifications?id=eq.${noteId}`, {
    token: buyer.token,
    method: 'PATCH',
    body: { opened_at: '2000-01-01T00:00:00.000Z' },
    prefer: 'return=representation',
  });
  const still = await api(`/rest/v1/drop_notifications?id=eq.${noteId}&select=opened_at,title`, {
    token: buyer.token,
  });
  check(
    'a later open does not move the stamp or the copy',
    still.body?.[0]?.opened_at === openedAt && still.body?.[0]?.title === 'New watches',
    JSON.stringify({ backdated: backdated.body, still: still.body }),
  );

  const stolenOpen = await api('/rest/v1/rpc/record_drop_opened', {
    token: dealerUser.token,
    method: 'POST',
    body: { p_id: noteId },
  });
  const afterStolen = await api(`/rest/v1/drop_notifications?id=eq.${noteId}&select=opened_at`, {
    token: buyer.token,
  });
  check(
    "someone else cannot mark your drop opened",
    stolenOpen.status < 300 && afterStolen.body?.[0]?.opened_at === openedAt,
    JSON.stringify(afterStolen.body),
  );
}

console.log('\ncatalogue batches');
{
  for (const [who, token] of [
    ['a guest', ANON],
    ['a signed-in stranger', buyer.token],
  ]) {
    const latest = await api('/rest/v1/rpc/latest_catalogue_batch', { token, method: 'POST', body: {} });
    check(
      `${who} can read the latest batch`,
      latest.status === 200 && Array.isArray(latest.body),
      `got ${latest.status} ${JSON.stringify(latest.body)}`,
    );

    for (const table of ['catalogue_batches', 'catalogue_batch_listings']) {
      const read = await api(`/rest/v1/${table}?select=*`, { token });
      check(`${who} cannot select ${table}`, read.status >= 400, `got ${read.status}`);
    }

    const seal = await api('/rest/v1/rpc/seal_catalogue_batch', {
      token,
      method: 'POST',
      body: { p_batch_id: crypto.randomUUID() },
    });
    check(`${who} cannot seal a batch`, seal.status >= 400, `got ${seal.status}`);
  }
}

console.log('\nbuyer events');
{
  const reader = await createUser(`events-${stamp}@example.com`);
  const other = await createUser(`events-other-${stamp}@example.com`);
  const admin = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
  const stored = (id) =>
    fetch(`${URL}/rest/v1/buyer_events?id=eq.${id}&select=user_id,guest_key,received_at`, {
      headers: admin,
    }).then((r) => r.json());
  const log = (token, events) =>
    api('/rest/v1/rpc/log_buyer_events', { token, method: 'POST', body: { p_events: events } });
  // Listing and shop ids that exist nowhere: the log keeps no foreign key to
  // either, so a deleted listing leaves its history.
  const save = (extra = {}) => ({
    id: crypto.randomUUID(),
    kind: 'save',
    surface: 'buy',
    occurred_at: new Date().toISOString(),
    listing_id: crypto.randomUUID(),
    dealer_id: crypto.randomUUID(),
    ...extra,
  });

  const first = save();
  const logged = await log(reader.token, [first]);
  const [row] = await stored(first.id);
  check(
    'a signed-in buyer logs an event the service role can read',
    logged.status === 200 && logged.body === 1 && row?.user_id === reader.id,
    `got ${logged.status} ${JSON.stringify(logged.body)} ${JSON.stringify(row)}`,
  );

  const forged = save({ user_id: other.id, received_at: '2000-01-01T00:00:00Z' });
  await log(reader.token, [forged]);
  const [forgedRow] = await stored(forged.id);
  check(
    'a forged user id and receipt time are stored as the caller and now',
    forgedRow?.user_id === reader.id && !forgedRow.received_at.startsWith('2000'),
    JSON.stringify(forgedRow),
  );

  const replay = await log(reader.token, [first]);
  const copies = await stored(first.id);
  check(
    'a replayed batch stores nothing new',
    replay.status === 200 && replay.body === 0 && copies.length === 1,
    `got ${replay.status} ${JSON.stringify(replay.body)}, ${copies.length} rows`,
  );

  const anon = await log(ANON, [save()]);
  check('a signed-out caller cannot log events', anon.status >= 400, `got ${anon.status}`);

  for (const [who, token] of [
    ['a guest', ANON],
    ['a signed-in buyer', reader.token],
  ]) {
    const read = await api('/rest/v1/buyer_events?select=*', { token });
    check(`${who} cannot read buyer_events`, read.status >= 400, `got ${read.status}`);
    const insert = await api('/rest/v1/buyer_events', { token, method: 'POST', body: save() });
    check(`${who} cannot insert into buyer_events`, insert.status >= 400, `got ${insert.status}`);
  }

  const serviceInsert = await fetch(`${URL}/rest/v1/buyer_events`, {
    method: 'POST',
    headers: { ...admin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...save(), user_id: reader.id }),
  });
  check(
    'the service role reads the log and cannot write it',
    serviceInsert.status >= 400,
    `got ${serviceInsert.status}`,
  );

  const impostor = save({ user_id: reader.id });
  await log(other.token, [impostor]);
  const [impostorRow] = await stored(impostor.id);
  const overwrite = await log(other.token, [{ ...first, user_id: other.id }]);
  const [firstAfter] = await stored(first.id);
  check(
    "a second buyer cannot write the first buyer's id or take over their row",
    impostorRow?.user_id === other.id && overwrite.body === 0 && firstAfter?.user_id === reader.id,
    JSON.stringify({ impostorRow, overwrite: overwrite.body, firstAfter }),
  );

  const guestKey = crypto.randomUUID();
  const claimed = save({ guest_key: guestKey });
  await log(reader.token, [claimed]);
  const [claimedRow] = await stored(claimed.id);
  check('a claimed guest row keeps its guest key', claimedRow?.guest_key === guestKey, JSON.stringify(claimedRow));

  const noDirection = await log(reader.token, [save({ kind: null })]);
  check('a swipe with no direction is refused', noDirection.status >= 400, `got ${noDirection.status}`);

  const filterOnListing = await log(reader.token, [
    {
      id: crypto.randomUUID(),
      kind: 'filter',
      surface: 'buy',
      occurred_at: new Date().toISOString(),
      filter: { query: 'speedmaster' },
      listing_id: crypto.randomUUID(),
    },
  ]);
  check('a filter row naming a listing is refused', filterOnListing.status >= 400, `got ${filterOnListing.status}`);

  const good = save();
  const mixed = await log(reader.token, [good, save({ listing_id: null })]);
  const goodRows = await stored(good.id);
  check(
    'one bad row refuses the whole batch',
    mixed.status >= 400 && goodRows.length === 0,
    `got ${mixed.status}, ${goodRows.length} rows`,
  );

  const tooMany = await log(
    reader.token,
    Array.from({ length: 101 }, () => save()),
  );
  check('a batch over 100 rows is refused', tooMany.status >= 400, `got ${tooMany.status}`);

  const shopReport = async () => {
    const body = { p_dealer_id: dealerId };
    const stats = await api('/rest/v1/rpc/dealer_stats', { token: importer.token, method: 'POST', body });
    const top = await api('/rest/v1/rpc/dealer_top_customers', { token: importer.token, method: 'POST', body });
    return { stats: stats.body, top: top.body };
  };
  const before = await shopReport();
  const exposure = crypto.randomUUID();
  const onTheShop = { listing_id: listingId, dealer_id: dealerId, occurred_at: new Date().toISOString() };
  const shopLogged = await log(reader.token, [
    { ...onTheShop, id: crypto.randomUUID(), kind: 'impression', surface: 'buy', exposure_id: exposure, position: 0 },
    { ...onTheShop, id: crypto.randomUUID(), kind: 'dwell', surface: 'buy', exposure_id: exposure, dwell_ms: 4000, photo_index: 2 },
    { ...onTheShop, id: crypto.randomUUID(), kind: 'dealer_click', surface: 'buy', exposure_id: exposure },
    { ...onTheShop, id: crypto.randomUUID(), kind: 'save', surface: 'buy', exposure_id: exposure },
  ]);
  const after = await shopReport();
  const statFields = Object.keys(after.stats?.[0] ?? {});
  check(
    "a shop's stats and top customers do not move when buyers log events on its watch",
    shopLogged.body === 4 &&
      statFields.length > 0 &&
      JSON.stringify(after) === JSON.stringify(before) &&
      !statFields.some((field) => /impression|dwell|exposure|event/.test(field)),
    JSON.stringify({ logged: shopLogged.body, before, after }),
  );

  for (const user of [reader, other]) {
    await fetch(`${URL}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers: admin });
  }
  const left = await fetch(`${URL}/rest/v1/buyer_events?user_id=in.(${reader.id},${other.id})&select=id`, {
    headers: admin,
  }).then((r) => r.json());
  check(
    "deleting an account deletes that account's events",
    Array.isArray(left) && left.length === 0,
    JSON.stringify(left),
  );
}

console.log('\noperator accounts');
{
  const admin = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };
  const watcher = await createUser(`accounts-watcher-${stamp}@example.com`);
  const collector = await createUser(`accounts-collector-${stamp}@example.com`);
  const stranger = await createUser(`accounts-stranger-${stamp}@example.com`);
  await fetch(`${URL}/rest/v1/operators`, { method: 'POST', headers: admin, body: JSON.stringify({ user_id: watcher.id }) });

  const granted = await api('/rest/v1/rpc/is_operator', { token: watcher.token, method: 'POST' });
  const sealed = await api('/rest/v1/buyer_events?select=*', { token: watcher.token });
  check(
    'an operator still cannot select buyer_events',
    granted.body === true && sealed.status >= 400,
    `operator ${granted.body}, got ${sealed.status}`,
  );

  const start = Date.now() - 10 * 60_000;
  const at = (seconds) => new Date(start + seconds * 1000).toISOString();
  const onTheWatch = { listing_id: listingId, dealer_id: dealerId };
  const opened = crypto.randomUUID();
  const logged = await api('/rest/v1/rpc/log_buyer_events', {
    token: collector.token,
    method: 'POST',
    body: {
      p_events: [
        { ...onTheWatch, id: crypto.randomUUID(), kind: 'impression', surface: 'buy', occurred_at: at(0), exposure_id: crypto.randomUUID(), position: 0 },
        { ...onTheWatch, id: crypto.randomUUID(), kind: 'impression', surface: 'detail', occurred_at: at(60), exposure_id: opened },
        { ...onTheWatch, id: crypto.randomUUID(), kind: 'dwell', surface: 'detail', occurred_at: at(102), exposure_id: opened, dwell_ms: 42_000 },
        { ...onTheWatch, id: crypto.randomUUID(), kind: 'save', surface: 'buy', occurred_at: at(120) },
        { id: crypto.randomUUID(), kind: 'pass', surface: 'buy', occurred_at: at(180), listing_id: crypto.randomUUID(), dealer_id: dealerId },
        { ...onTheWatch, id: crypto.randomUUID(), kind: 'dealer_click', surface: 'detail', occurred_at: at(240) },
        { ...onTheWatch, id: crypto.randomUUID(), kind: 'inquiry_open', surface: 'detail', occurred_at: at(300) },
        { id: crypto.randomUUID(), kind: 'filter', surface: 'buy', occurred_at: at(360), filter: { query: 'speedmaster' } },
        { id: crypto.randomUUID(), kind: 'follow', surface: 'shop', occurred_at: at(420), dealer_id: dropDealerId },
      ],
    },
  });
  const followed = await api('/rest/v1/dealer_follows', {
    token: collector.token,
    method: 'POST',
    body: { user_id: collector.id, dealer_id: dropDealerId },
    prefer: 'return=minimal',
  });
  const asked = await fetch(`${URL}/rest/v1/inquiries`, {
    method: 'POST',
    headers: { ...admin, Prefer: 'return=minimal' },
    body: JSON.stringify({ listing_id: listingId, dealer_id: dealerId, buyer_id: collector.id, message: 'Is the bracelet original?' }),
  });
  check(
    'the collector logs nine events, follows a shop, and has an inquiry',
    logged.body === 9 && followed.status < 300 && asked.status < 300,
    `logged ${logged.status} ${JSON.stringify(logged.body)}, follow ${followed.status}, inquiry ${asked.status}`,
  );

  const list = await api('/rest/v1/rpc/operator_accounts', { token: watcher.token, method: 'POST' });
  const row = list.body?.find?.((account) => account.id === collector.id);
  check(
    'an operator lists every account with its email and act counts',
    row?.email === `accounts-collector-${stamp}@example.com` &&
      row.swipes_right === 1 && row.swipes_left === 1 && row.dealer_clicks === 1 && row.follows === 1,
    JSON.stringify(row),
  );

  for (const [fn, body] of [
    ['operator_accounts', {}],
    ['operator_account', { p_user_id: collector.id }],
  ]) {
    const refused = await api(`/rest/v1/rpc/${fn}`, { token: stranger.token, method: 'POST', body });
    check(
      `a buyer gets 42501 from ${fn} and no address`,
      refused.status === 403 && refused.body?.code === '42501' && !JSON.stringify(refused.body).includes('example.com'),
      `${refused.status} ${JSON.stringify(refused.body)}`,
    );
  }

  const story = await api('/rest/v1/rpc/operator_account', {
    token: watcher.token,
    method: 'POST',
    body: { p_user_id: collector.id },
  });
  check(
    'the timeline shows opens and inquiries, newest first, and hides deck impressions, dwells, and drafts',
    JSON.stringify(story.body?.timeline?.map((event) => event.kind)) ===
      JSON.stringify(['inquiry', 'follow', 'filter', 'dealer_click', 'pass', 'save', 'open']) &&
      story.body.timeline.at(-1).seconds === 42 &&
      !JSON.stringify(story.body).includes('example.com'),
    JSON.stringify(story.body)?.slice(0, 400),
  );

  for (const user of [watcher, collector, stranger]) {
    await fetch(`${URL}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers: admin });
  }
}

console.log('\ncollector numbers');
{
  const admin = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
  const numberOf = (id) =>
    fetch(`${URL}/rest/v1/profiles?id=eq.${id}&select=collector_number`, { headers: admin })
      .then((r) => r.json())
      .then((rows) => rows?.[0]?.collector_number);
  const removeUser = (id) =>
    fetch(`${URL}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: admin }).then((r) => r.status);
  const made = [];
  const signUp = async (label) => {
    const user = await createUser(`cn-${label}-${stamp}@example.com`);
    made.push(user);
    return user;
  };

  const top = await signUp('top');
  const n = await numberOf(top.id);
  const removed = await removeUser(top.id);
  const again = await signUp('again');
  const againNumber = await numberOf(again.id);
  check(
    'an admin-deleted top number goes to the next sign-up',
    removed < 300 && Number.isInteger(n) && againNumber === n,
    `delete ${removed}, top had ${n}, next got ${againNumber}`,
  );

  const heldNumbers = () =>
    fetch(`${URL}/rest/v1/profiles?select=collector_number`, { headers: admin })
      .then((r) => r.json())
      .then((rows) => (rows ?? []).map((row) => row.collector_number));
  const lowestFree = (taken, count) => {
    const held = new Set(taken);
    const found = [];
    for (let i = 1; found.length < count; i += 1) {
      if (!held.has(i)) found.push(i);
    }
    return found;
  };

  const mid = await signUp('mid');
  const last = await signUp('last');
  const midNumber = await numberOf(mid.id);
  const lastNumber = await numberOf(last.id);
  const left = await api('/rest/v1/rpc/delete_own_account', { token: last.token, method: 'POST', body: {} });
  const refill = await signUp('refill');
  const refillNumber = await numberOf(refill.id);
  check(
    'the higher of two new numbers goes to the next sign-up when that account is deleted',
    left.status < 300 && lastNumber > midNumber && refillNumber === lastNumber,
    `delete ${left.status}, mid ${midNumber}, last ${lastNumber}, next ${refillNumber}`,
  );

  await removeUser(mid.id);
  const after = await signUp('after');
  const afterNumber = await numberOf(after.id);
  check(
    'a freed middle number is reused',
    afterNumber === midNumber,
    `middle was ${midNumber}, next got ${afterNumber}`,
  );
  const kept = [await numberOf(again.id), await numberOf(refill.id)];
  check(
    'survivors keep their numbers',
    kept[0] === n && kept[1] === lastNumber,
    JSON.stringify(kept),
  );

  const beforeBurst = await heldNumbers();
  const expectedBurst = lowestFree(beforeBurst, 6);
  const burst = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => signUp(`burst-${i}`)));
  const joined = burst.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  check(
    'six sign-ups at once all succeed',
    joined.length === 6,
    burst.filter((r) => r.status === 'rejected').map((r) => String(r.reason)).join('; '),
  );
  const burstNumbers = (await Promise.all(joined.map((user) => numberOf(user.id)))).sort((a, b) => a - b);
  check(
    'six sign-ups at once get the six lowest free numbers',
    JSON.stringify(burstNumbers) === JSON.stringify(expectedBurst),
    `expected ${JSON.stringify(expectedBurst)}, got ${JSON.stringify(burstNumbers)}`,
  );

  // Foreign keys are checked after BEFORE triggers, so an id with no auth user
  // still reaches the trigger, and the message proves which one refused it.
  const chosen = await fetch(`${URL}/rest/v1/profiles`, {
    method: 'POST',
    headers: { ...admin, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ id: crypto.randomUUID(), collector_number: n + 1000 }),
  });
  const chosenBody = await chosen.json().catch(() => null);
  check(
    'an insert cannot choose a collector number',
    chosen.status >= 400 && /assigned, not chosen/.test(chosenBody?.message ?? ''),
    `${chosen.status} ${JSON.stringify(chosenBody)}`,
  );

  const patched = await api(`/rest/v1/profiles?id=eq.${again.id}`, {
    token: again.token,
    method: 'PATCH',
    body: { collector_number: n + 1000 },
  });
  check(
    'a user cannot change their own collector number',
    patched.status >= 400 && (await numberOf(again.id)) === n,
    `${patched.status} ${JSON.stringify(patched.body)}`,
  );

  // `supabase db query` runs one prepared statement, so it cannot hold a
  // begin ... rollback. A DO block that always raises is one statement whose
  // transaction always rolls back, and the error text carries the number out.
  const dbUrl = localStatus()?.dbUrl;
  const rolledBackSignUp = () => {
    if (!dbUrl || !isLocalUrl(dbUrl)) return { number: null, output: `no local DB_URL from supabase status: ${dbUrl}` };
    const sql = `do $$
      declare
        uid uuid := gen_random_uuid();
        held integer;
      begin
        insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
        values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
          'cn-rolled-' || uid || '@example.com', '', now(), '{}', '{}', now(), now());
        select p.collector_number into held from public.profiles p where p.id = uid;
        raise exception 'rolled back holding collector #%', held;
      end $$`;
    const run = spawnSync('supabase', ['db', 'query', '--db-url', dbUrl, sql], { encoding: 'utf8' });
    const output = `${run.stdout ?? ''}${run.stderr ?? ''}${run.error ?? ''}`;
    const match = output.match(/rolled back holding collector #(\d+)/);
    return { number: match ? Number(match[1]) : null, output };
  };

  const beforeRollback = lowestFree(await heldNumbers(), 1)[0];
  const rolled = rolledBackSignUp();
  const afterRollback = await signUp('after-rollback');
  const afterRollbackNumber = await numberOf(afterRollback.id);
  check(
    'a rolled-back sign-up does not use up its number',
    rolled.number === beforeRollback && afterRollbackNumber === rolled.number,
    rolled.number === null
      ? rolled.output.slice(0, 400)
      : `expected ${beforeRollback}, rolled back held ${rolled.number}, next got ${afterRollbackNumber}`,
  );

  const examples = () => {
    if (!dbUrl || !isLocalUrl(dbUrl)) return { ok: false, output: `no local DB_URL from supabase status: ${dbUrl}` };
    const sql = `do $$
      declare
        a uuid := gen_random_uuid();
        b uuid := gen_random_uuid();
        c uuid := gen_random_uuid();
        d uuid := gen_random_uuid();
        e uuid := gen_random_uuid();
        f uuid := gen_random_uuid();
        n1 integer;
        n2 integer;
        n3 integer;
        n4 integer;
        n5 integer;
        n6 integer;
      begin
        delete from public.conversation_members;
        delete from public.messages;
        delete from public.conversations;
        delete from auth.users;

        insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
        values
          ('00000000-0000-0000-0000-000000000000', a, 'authenticated', 'authenticated', 'cn-a-' || a || '@example.com', '', now(), '{}', '{}', now(), now()),
          ('00000000-0000-0000-0000-000000000000', b, 'authenticated', 'authenticated', 'cn-b-' || b || '@example.com', '', now(), '{}', '{}', now(), now()),
          ('00000000-0000-0000-0000-000000000000', c, 'authenticated', 'authenticated', 'cn-c-' || c || '@example.com', '', now(), '{}', '{}', now(), now());
        select p.collector_number into n1 from public.profiles p where p.id = a;
        select p.collector_number into n2 from public.profiles p where p.id = b;
        select p.collector_number into n3 from public.profiles p where p.id = c;
        if n1 <> 1 or n2 <> 2 or n3 <> 3 then
          raise exception 'fresh line was % % %', n1, n2, n3;
        end if;

        delete from auth.users where id = b;
        insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
        values ('00000000-0000-0000-0000-000000000000', d, 'authenticated', 'authenticated', 'cn-d-' || d || '@example.com', '', now(), '{}', '{}', now(), now());
        select p.collector_number into n4 from public.profiles p where p.id = d;
        if n4 <> 2 then
          raise exception 'delete #2 of 1-3 gave %', n4;
        end if;

        delete from auth.users where id = c;
        insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
        values ('00000000-0000-0000-0000-000000000000', e, 'authenticated', 'authenticated', 'cn-e-' || e || '@example.com', '', now(), '{}', '{}', now(), now());
        select p.collector_number into n5 from public.profiles p where p.id = e;
        if n5 <> 3 then
          raise exception 'delete #3 of 1-3 gave %', n5;
        end if;

        delete from auth.users;
        insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
        values ('00000000-0000-0000-0000-000000000000', f, 'authenticated', 'authenticated', 'cn-f-' || f || '@example.com', '', now(), '{}', '{}', now(), now());
        select p.collector_number into n6 from public.profiles p where p.id = f;
        if n6 <> 1 then
          raise exception 'only account deleted gave %', n6;
        end if;

        raise exception 'number examples rolled back #1 % middle % top %', n6, n4, n5;
      end $$`;
    const run = spawnSync('supabase', ['db', 'query', '--db-url', dbUrl, sql], { encoding: 'utf8' });
    const output = `${run.stdout ?? ''}${run.stderr ?? ''}${run.error ?? ''}`;
    return { ok: /number examples rolled back #1 1 middle 2 top 3/.test(output), output };
  };
  const exampleRun = examples();
  check(
    'delete only account gives #1, delete #2 of 1-3 gives #2, delete #3 of 1-3 gives #3',
    exampleRun.ok,
    exampleRun.output.slice(0, 500),
  );

  for (const user of made) await removeUser(user.id);
}

console.log('\nguest activity');
{
  const admin = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
  const rowsFor = (key) =>
    fetch(`${URL}/rest/v1/buyer_events?guest_key=eq.${key}&select=id,user_id,guest_key,received_at`, {
      headers: admin,
    }).then((r) => r.json());
  const deviceFor = (key) =>
    fetch(
      `${URL}/rest/v1/guest_devices?guest_key=eq.${key}&select=guest_key,country,device,claimed_by`,
      { headers: admin },
    ).then((r) => r.json());
  const logGuest = (token, key, events, device = 'web-desktop') =>
    api('/rest/v1/rpc/log_guest_events', {
      token,
      method: 'POST',
      body: { p_guest_key: key, p_events: events, p_device: device },
    });
  const watchEvent = (kind, extra = {}) => ({
    id: crypto.randomUUID(),
    kind,
    surface: 'buy',
    occurred_at: new Date().toISOString(),
    listing_id: listingId,
    dealer_id: dealerId,
    ...(kind === 'impression' || kind === 'dwell' ? { exposure_id: crypto.randomUUID() } : {}),
    ...(kind === 'impression' ? { position: 0 } : {}),
    ...(kind === 'dwell' ? { dwell_ms: 1000 } : {}),
    ...extra,
  });

  const key = crypto.randomUUID();
  const otherUser = crypto.randomUUID();
  const first = watchEvent('impression', {
    user_id: otherUser,
    received_at: '2000-01-01T00:00:00Z',
    guest_key: crypto.randomUUID(),
  });
  const logged = await logGuest(ANON, key, [first]);
  const [row] = await rowsFor(key);
  const devices = await deviceFor(key);
  const receivedAt = Date.parse(row?.received_at ?? '');
  check(
    'a signed-out caller logs one guest event and one device',
    logged.status === 200 &&
      logged.body === 1 &&
      row?.user_id === null &&
      row?.guest_key === key &&
      Number.isFinite(receivedAt) &&
      Math.abs(Date.now() - receivedAt) < 2 * 60_000 &&
      devices.length === 1 &&
      devices[0]?.guest_key === key,
    `got ${logged.status} ${JSON.stringify(logged.body)} ${JSON.stringify(row)} ${JSON.stringify(devices)}`,
  );

  const country = devices[0]?.country ?? null;
  console.log(`guest_devices.country: ${country === null ? 'null' : country}`);
  check(
    'guest country is null or a two-letter code',
    country === null || /^[A-Z]{2}$/.test(country),
    JSON.stringify(country),
  );

  const replay = await logGuest(ANON, key, [first]);
  const copies = await rowsFor(key);
  check(
    'a replayed guest batch stores nothing new',
    replay.status === 200 && replay.body === 0 && copies.length === 1,
    `got ${replay.status} ${JSON.stringify(replay.body)}, ${copies.length} rows`,
  );

  for (const [table, path] of [
    ['buyer_events', '/rest/v1/buyer_events?select=*'],
    ['guest_devices', '/rest/v1/guest_devices?select=*'],
  ]) {
    const read = await api(path);
    check(`a guest cannot read ${table}`, read.status >= 400, `got ${read.status}`);
  }

  const signedKey = crypto.randomUUID();
  const signed = await logGuest(buyer.token, signedKey, [watchEvent('pass')]);
  const signedRows = await rowsFor(signedKey);
  check(
    'a signed-in caller cannot log guest events',
    signed.status >= 400 && signed.body?.code === '28000' && signedRows.length === 0,
    `${signed.status} ${JSON.stringify(signed.body)} rows ${signedRows.length}`,
  );

  const refusedKey = crypto.randomUUID();
  const madeUp = watchEvent('pass', { listing_id: crypto.randomUUID() });
  const tooMany = await logGuest(
    ANON,
    refusedKey,
    Array.from({ length: 51 }, () => watchEvent('pass')),
  );
  const saved = await logGuest(ANON, refusedKey, [watchEvent('save')]);
  const missing = await logGuest(ANON, refusedKey, [madeUp]);
  const oversized = await logGuest(ANON, refusedKey, [
    watchEvent('pass', { filter: { note: 'x'.repeat(70_000) } }),
  ]);
  const refusedRows = await rowsFor(refusedKey);
  check(
    'an oversized, over-long, save, or unknown-listing guest batch stores nothing',
    [tooMany, saved, missing, oversized].every((result) => result.status >= 400) && refusedRows.length === 0,
    JSON.stringify({
      tooMany: tooMany.status,
      saved: saved.status,
      missing: missing.status,
      oversized: oversized.status,
      rows: refusedRows.length,
    }),
  );

  const tasteOf = () => api('/rest/v1/rpc/buyer_taste', { token: buyer.token, method: 'POST', body: {} });
  const feedOf = () =>
    api('/rest/v1/rpc/rank_buy_feed', { token: buyer.token, method: 'POST', body: { p_limit: 1 } });
  const tasteBefore = await tasteOf();
  const feedBefore = await feedOf();
  const landed = await logGuest(ANON, key, [watchEvent('dealer_click'), watchEvent('pass')]);
  const tasteAfter = await tasteOf();
  const feedAfter = await feedOf();
  check(
    "a guest dealer click and pass leave that account's taste and feed unchanged",
    landed.status === 200 &&
      landed.body === 2 &&
      JSON.stringify(tasteAfter.body) === JSON.stringify(tasteBefore.body) &&
      JSON.stringify(feedAfter.body) === JSON.stringify(feedBefore.body),
    `landed ${landed.status} ${JSON.stringify(landed.body)}`,
  );

  const anonClaim = await api('/rest/v1/rpc/claim_guest_events', {
    method: 'POST',
    body: { p_guest_key: key },
  });
  const owner = await createUser(`guest-claim-${stamp}@example.com`);
  const beforeClaim = await rowsFor(key);
  const claimed = await api('/rest/v1/rpc/claim_guest_events', {
    token: owner.token,
    method: 'POST',
    body: { p_guest_key: key },
  });
  const afterClaim = await rowsFor(key);
  const [claimedDevice] = await deviceFor(key);
  const claimedAgain = await api('/rest/v1/rpc/claim_guest_events', {
    token: owner.token,
    method: 'POST',
    body: { p_guest_key: key },
  });
  const afterAgain = await rowsFor(key);
  check(
    'claiming guest events sets the user once and does not add rows',
    anonClaim.status >= 400 &&
      claimed.status === 200 &&
      claimed.body === beforeClaim.length &&
      afterClaim.length === beforeClaim.length &&
      afterClaim.every((event) => event.user_id === owner.id) &&
      claimedDevice?.claimed_by === owner.id &&
      claimedAgain.status === 200 &&
      claimedAgain.body === 0 &&
      afterAgain.length === beforeClaim.length,
    JSON.stringify({
      anon: anonClaim.status,
      claimed: claimed.body,
      again: claimedAgain.body,
      before: beforeClaim.length,
      after: afterAgain.length,
      device: claimedDevice,
    }),
  );

  const capKey = crypto.randomUUID();
  let capStored = 0;
  let capStatus = 0;
  for (let batch = 0; batch < 40; batch += 1) {
    const result = await logGuest(
      ANON,
      capKey,
      Array.from({ length: 50 }, () => watchEvent('pass')),
    );
    capStatus = result.status;
    if (result.status !== 200 || result.body !== 50) break;
    capStored += result.body;
  }
  const overCap = await logGuest(ANON, capKey, [watchEvent('pass')]);
  // PostgREST stops a select at max_rows (1000). The count is in Content-Range.
  const counted = await fetch(`${URL}/rest/v1/buyer_events?guest_key=eq.${capKey}&select=id`, {
    headers: { ...admin, Prefer: 'count=exact', Range: '0-0' },
  });
  const capTotal = Number((counted.headers.get('content-range') ?? '').split('/')[1]);
  check(
    'a guest key over 2000 rows in a day stores nothing further',
    capStored === 2000 && capStatus === 200 && overCap.status === 200 && overCap.body === 0 && capTotal === 2000,
    `stored ${capStored} status ${capStatus}, next ${overCap.status} ${JSON.stringify(overCap.body)}, rows ${capTotal}`,
  );

  const freshKey = crypto.randomUUID();
  const fresh = watchEvent('pass');
  const storedFresh = await logGuest(ANON, freshKey, [fresh]);
  const purged = await fetch(`${URL}/rest/v1/rpc/purge_unclaimed_guest_events`, {
    method: 'POST',
    headers: { ...admin, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const purgedBody = await purged.json();
  const freshRows = await rowsFor(freshKey);
  check(
    'purging unclaimed guest events leaves a row from this run',
    storedFresh.status === 200 &&
      storedFresh.body === 1 &&
      purged.status === 200 &&
      typeof purgedBody === 'number' &&
      freshRows.some((event) => event.id === fresh.id),
    `store ${storedFresh.status} ${storedFresh.body}, purge ${purged.status} ${JSON.stringify(purgedBody)}, rows ${freshRows.length}`,
  );

  await fetch(`${URL}/auth/v1/admin/users/${owner.id}`, { method: 'DELETE', headers: admin });
}

await cleanUp();

console.log(failures === 0 ? '\nAll RLS checks passed.\n' : `\n${failures} RLS check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
