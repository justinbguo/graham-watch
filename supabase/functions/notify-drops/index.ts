import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { chunk, dropPushMessages, EXPO_CHUNK, EXPO_PUSH_URL, readTickets, ticketsFromExpoBody } from './expo.ts';
import {
  dropCutoff,
  reportDrops,
  utcDay,
  type DropFollow,
  type DropListing,
  type DropNotice,
  type DropPlan,
  type DropToken,
} from './select.ts';

/**
 * After the catalogue refresh: one push per buyer who follows a shop that
 * listed something they have not already been told about.
 *
 * Auth matches scheduled-refresh. The gateway still wants a JWT (the refresh
 * script sends the service role). The cron secret is the second door, the same
 * GRAHAM_CRON_SECRET import-listings already has. No new secret.
 *
 * Expo's push API does not require a token. If Expo push security is turned
 * on later, set EXPO_ACCESS_TOKEN on the function and this sends it. The value
 * is never logged.
 */

const PAGE = 1000;
const IN_CHUNK = 80;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function admin(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
}

async function eachPage<T>(
  load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await load(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
}

function chunksOf(ids: string[]): string[][] {
  return chunk(ids, IN_CHUNK);
}

async function loadFollows(db: SupabaseClient): Promise<DropFollow[]> {
  const rows = await eachPage<{
    user_id: string;
    dealer_id: string;
    created_at: string;
  }>((from, to) =>
    db
      .from('dealer_follows')
      .select('user_id, dealer_id, created_at')
      .order('user_id')
      .order('dealer_id')
      .range(from, to),
  );
  const dealerIds = [...new Set(rows.map((row) => row.dealer_id))];
  const dealers = new Map<string, { name: string; permission: string }>();
  for (const ids of chunksOf(dealerIds)) {
    const { data, error } = await db.from('dealers').select('id, name, permission').in('id', ids);
    if (error) throw new Error(error.message);
    for (const dealer of data ?? []) {
      dealers.set(dealer.id, { name: dealer.name, permission: dealer.permission });
    }
  }
  return rows.flatMap((row) => {
    const dealer = dealers.get(row.dealer_id);
    if (!dealer) return [];
    return [
      {
        userId: row.user_id,
        dealerId: row.dealer_id,
        dealerName: dealer.name,
        followedAt: row.created_at,
        permission: dealer.permission,
      },
    ];
  });
}

async function loadListings(db: SupabaseClient, follows: DropFollow[], now: Date): Promise<DropListing[]> {
  const approved = follows.filter((follow) => follow.permission === 'approved');
  if (approved.length === 0) return [];
  // Same instant dropCutoff uses. gte keeps a watch created exactly 14 days ago.
  const earliest = new Date(dropCutoff(now)).toISOString();
  const dealerIds = [...new Set(approved.map((follow) => follow.dealerId))];
  const listings: DropListing[] = [];
  for (const ids of chunksOf(dealerIds)) {
    const rows = await eachPage<{
      id: string;
      dealer_id: string;
      created_at: string;
      status: string;
      sold_at: string | null;
    }>((from, to) =>
      db
        .from('listings')
        .select('id, dealer_id, created_at, status, sold_at')
        .in('dealer_id', ids)
        .eq('status', 'active')
        .is('sold_at', null)
        .gte('created_at', earliest)
        .order('id')
        .range(from, to),
    );
    for (const row of rows) {
      listings.push({
        id: row.id,
        dealerId: row.dealer_id,
        createdAt: row.created_at,
        status: row.status,
        soldAt: row.sold_at,
      });
    }
  }
  return listings;
}

async function loadNotices(db: SupabaseClient, userIds: string[]): Promise<DropNotice[]> {
  const notices: DropNotice[] = [];
  for (const ids of chunksOf(userIds)) {
    const rows = await eachPage<{
      user_id: string;
      notified_on: string;
      status: string;
      listing_ids: string[] | null;
    }>((from, to) =>
      db
        .from('drop_notifications')
        .select('user_id, notified_on, status, listing_ids')
        .in('user_id', ids)
        .order('user_id')
        .range(from, to),
    );
    for (const row of rows) {
      notices.push({
        userId: row.user_id,
        notifiedOn: row.notified_on,
        status: row.status,
        listingIds: row.listing_ids ?? [],
      });
    }
  }
  return notices;
}

/** User ids that have a device row. The token string stays out of this query. */
async function loadTokenUserIds(db: SupabaseClient): Promise<Set<string>> {
  const rows = await eachPage<{ user_id: string }>((from, to) =>
    db.from('device_push_tokens').select('user_id').order('user_id').range(from, to),
  );
  return new Set(rows.map((row) => row.user_id));
}

function insertProblem(error: { code?: string }): string {
  if (error.code === '42501') return '42501 row-level security refused the insert';
  if (error.code === '23514') return '23514 a drop row failed its check constraint';
  if (error.code === '23503') return '23503 a drop row referenced a missing user or dealer';
  return error.code ? `insert ${error.code}` : 'insert failed';
}

async function loadTokens(db: SupabaseClient, userIds: string[]): Promise<DropToken[]> {
  const tokens: DropToken[] = [];
  for (const ids of chunksOf(userIds)) {
    const rows = await eachPage<{ user_id: string; token: string }>((from, to) =>
      db.from('device_push_tokens').select('user_id, token').in('user_id', ids).order('token').range(from, to),
    );
    for (const row of rows) tokens.push({ userId: row.user_id, token: row.token });
  }
  return tokens;
}

async function postExpo(messages: ReturnType<typeof dropPushMessages>): Promise<unknown> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
  };
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;

  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(messages),
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'errors' in body
        ? 'Expo refused the push'
        : `Expo push failed (${response.status})`;
    throw new Error(message);
  }
  return body;
}

async function deliver(drop: DropPlan, notificationId: string, tokens: string[]) {
  const messages = dropPushMessages({
    tokens,
    title: drop.title,
    body: drop.body,
    notificationId,
    dealerId: drop.dealerId,
  });
  const okIds: string[] = [];
  const deadTokens: string[] = [];
  let anyOk = false;
  for (const group of chunk(messages, EXPO_CHUNK)) {
    const body = await postExpo(group);
    const tickets = ticketsFromExpoBody(body);
    if (!tickets) throw new Error('Expo push returned no tickets');
    const reading = readTickets(
      group.map((message) => message.to),
      tickets,
    );
    okIds.push(...reading.okIds);
    deadTokens.push(...reading.deadTokens);
    anyOk = anyOk || reading.anyOk;
  }
  return { okIds, deadTokens, anyOk };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only.' }, 405);

  const secret = Deno.env.get('GRAHAM_CRON_SECRET');
  if (!secret) return json({ error: 'Drops are not configured.' }, 503);

  const offered = req.headers.get('x-graham-cron-secret') ?? '';
  if (offered !== secret) return json({ error: 'Not authorized.' }, 401);

  try {
    const db = admin();
    const now = new Date();
    const follows = await loadFollows(db);
    const userIds = [...new Set(follows.map((follow) => follow.userId))];
    const [listings, notices, tokens, tokenAccounts] = await Promise.all([
      loadListings(db, follows, now),
      loadNotices(db, userIds),
      loadTokens(db, userIds),
      loadTokenUserIds(db),
    ]);
    const report = reportDrops({ now, follows, listings, notices, tokens });
    const plan = report.plans;
    const followerIds = new Set(follows.map((follow) => follow.userId));
    let tokensOnFollowers = 0;
    let tokensOnOtherAccounts = 0;
    for (const id of tokenAccounts) {
      if (followerIds.has(id)) tokensOnFollowers += 1;
      else tokensOnOtherAccounts += 1;
    }
    const tokensByUser = new Map<string, string[]>();
    for (const row of tokens) {
      const list = tokensByUser.get(row.userId) ?? [];
      if (!list.includes(row.token)) list.push(row.token);
      tokensByUser.set(row.userId, list);
    }

    let sent = 0;
    let failed = 0;
    let tokensRemoved = 0;
    let alreadyClaimed = 0;
    const problems: string[] = [];
    const day = utcDay(now);

    for (const drop of plan) {
      const inserted = await db
        .from('drop_notifications')
        .insert({
          user_id: drop.userId,
          listing_ids: drop.listingIds,
          dealer_ids: drop.dealerIds,
          title: drop.title,
          body: drop.body,
          destination: drop.destination,
          dealer_id: drop.dealerId,
          notified_on: day,
          notified_through: drop.notifiedThrough,
          status: 'pending',
        })
        .select('id')
        .single();

      if (inserted.error) {
        // The other run already took today's slot.
        if (inserted.error.code === '23505') {
          alreadyClaimed += 1;
          continue;
        }
        failed += 1;
        const label = insertProblem(inserted.error);
        if (!problems.includes(label)) problems.push(label);
        continue;
      }

      const id = inserted.data.id;
      try {
        const result = await deliver(drop, id, tokensByUser.get(drop.userId) ?? []);
        if (result.deadTokens.length > 0) {
          const removed = await db.from('device_push_tokens').delete().in('token', result.deadTokens);
          if (!removed.error) tokensRemoved += result.deadTokens.length;
        }
        const status = result.anyOk ? 'sent' : 'failed';
        await db
          .from('drop_notifications')
          .update({ status, expo_ticket_ids: result.okIds })
          .eq('id', id);
        if (result.anyOk) sent += 1;
        else {
          failed += 1;
          if (!problems.includes('expo accepted no device')) problems.push('expo accepted no device');
        }
      } catch {
        await db.from('drop_notifications').update({ status: 'failed' }).eq('id', id);
        failed += 1;
        if (!problems.includes('expo push failed')) problems.push('expo push failed');
      }
    }

    const body = {
      users: plan.length,
      sent,
      failed,
      tokensRemoved,
      alreadyClaimed,
      skipped: report.skipped,
      tokensOnFollowers,
      tokensOnOtherAccounts,
      problems,
    };
    console.log(JSON.stringify(body));
    return json(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Drops failed.';
    return json({ error: message }, 500);
  }
});
