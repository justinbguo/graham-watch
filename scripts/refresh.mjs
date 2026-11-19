/**
 * Keep every approved shop current: re-read the catalogue, retire what sold,
 * auto-publish what is new or changed.
 *
 *   npm run refresh                 every approved shop
 *   npm run refresh -- <dealer-id>  one shop
 *
 * Each shop is its own request to import-listings, and publishing is a
 * second request of two watches at a time. An edge isolate has two seconds
 * of CPU; doing every shop in one request is what died with HTTP 546
 * ("CPU Time exceeded") on 23 Oct 2026. Watches still queued when this
 * process stops are in `source_items` and the next run continues them.
 *
 * A revoked shop is not in the list (`permission` is not `approved`). A
 * paused shop is not either: pause is a permission, not a second flag, so
 * the same filter skips it.
 *
 * After a full run that exits 0, unclaimed guest rows older than 180 days
 * are purged, then the watches it put on the deck are sealed into one
 * catalogue batch for the New tab, then drops go out. A one-shop run does
 * not purge and does not seal.
 *
 * Exits 0 when at least one shop finished its catalogue read, the purge
 * succeeded, the seal succeeded, and the notify-drops call succeeded. A shop
 * that failed is logged and left for the next night. A gateway 503 is that
 * kind of failure. Exits 1 when the request itself failed (missing secret,
 * rejected cron secret, OpenAI key), every shop failed, the purge failed,
 * the seal failed, or notify-drops errored. Nobody to notify is not an error.
 * Health warnings — one shop's error, an empty catalogue, missing photos, a
 * week with nothing new — do not change that exit code.
 */

import { randomUUID } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';

import { OPERATOR_HOSTED, parseEnvFile } from './_env.mjs';
import { config, describeTarget, request, serviceKey } from './_supabase.mjs';
import { explainTokenGap, interpretDrops, tokenGapLine } from './drops-refresh.mjs';
import {
  healthReport,
  isSchemaMiss,
  refreshRunRow,
  shopFlags,
} from './refresh-health.mjs';
import { formatShop, refreshFailureReason, runRefresh } from './refresh-run.mjs';

function cronSecret() {
  if (process.env.GRAHAM_CRON_SECRET) return process.env.GRAHAM_CRON_SECRET;

  const hosted = parseEnvFile(OPERATOR_HOSTED);
  if (hosted.GRAHAM_CRON_SECRET) return hosted.GRAHAM_CRON_SECRET;

  try {
    const raw = readFileSync('supabase/functions/.env', 'utf8');
    const match = raw.match(/^\s*GRAHAM_CRON_SECRET\s*=\s*(.*)$/m);
    if (match) return match[1].trim().replace(/^["']|["']$/g, '');
  } catch {
    // optional
  }

  return null;
}

const secret = cronSecret();
if (!secret) {
  console.error(
    'GRAHAM_CRON_SECRET is not set. Add it to scripts/.env.operator.local (hosted) or supabase/functions/.env (local).'
  );
  process.exit(1);
}

const key = serviceKey();
const { url, anonKey } = config();
const batchId = randomUUID();
const dealerId = process.argv.slice(2).find((arg) => !arg.startsWith('-')) ?? null;

if (dealerId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dealerId)) {
  console.error('That dealer id is not a UUID.');
  process.exit(1);
}

console.log(describeTarget());

// stderr is in the log either way. On Actions, the annotation puts the failed
// shop on the job summary while the check itself stays green.
function annotation(level, title, message) {
  if (process.env.GITHUB_ACTIONS !== 'true') return;
  const encoded = String(message)
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A');
  console.error(`::${level} title=${title}::${encoded}`);
}

const params = new URLSearchParams({
  select: 'id,name,website',
  permission: 'eq.approved',
  website: 'not.is.null',
  order: 'name.asc',
});
if (dealerId) params.set('id', `eq.${dealerId}`);

const listed = await request(`/rest/v1/dealers?${params}`, { token: key });
if (!listed.ok) {
  const detail = listed.body?.message ?? listed.body?.error ?? JSON.stringify(listed.body);
  console.error(`Could not list shops (${listed.status}): ${detail}`);
  annotation('error', 'RefreshFailed', detail);
  process.exit(1);
}

const dealers = Array.isArray(listed.body) ? listed.body : [];
if (dealerId && dealers.length === 0) {
  console.error('No approved shop with that id.');
  process.exit(1);
}

// Shorter than the platform's 150s idle timeout, so a hung isolate becomes
// a shop error here instead of a client that waits forever.
const CALL_TIMEOUT_MS = 140_000;

async function invoke(body) {
  try {
    const response = await fetch(`${url}/functions/v1/import-listings`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'x-graham-cron-secret': secret,
      },
      body: JSON.stringify({ action: 'scheduled-refresh', ...body }),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { ok: response.ok, status: response.status, body: parsed };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: { error: error instanceof Error ? error.message : 'The function did not answer.' },
    };
  }
}

const { results, exitCode } = await runRefresh(dealers, invoke);

let published = 0;
let retired = 0;
let failed = 0;
let waiting = 0;
for (const shop of results) {
  const lines = formatShop(shop);
  if (!shop.ok || shop.publishError || shop.pending > 0) console.error(lines.join('\n'));
  else console.log(lines.join('\n'));
  if (!shop.ok || shop.fatal) {
    failed += 1;
    annotation('warning', 'ShopFailed', lines.join(' '));
  } else if (shop.publishError || shop.pending > 0) {
    if (shop.pending > 0) waiting += 1;
    annotation('warning', 'ShopIncomplete', lines.slice(1).join(' '));
  }
  published += Number(shop.published ?? 0);
  retired += Number(shop.retired ?? 0);
}

console.log(
  `\n${results.length} shop(s): ${published} published, ${retired} retired, ${failed} failed, ${waiting} with watches left for the next run.`
);

await reportHealth(results);

if (exitCode !== 0) {
  const reason = refreshFailureReason(results);
  console.error(reason);
  annotation('error', 'RefreshFailed', reason);
  process.exit(exitCode);
}

// A one-shop run is not the nightly sweep, so it leaves the guest log and the New tab alone.
if (!dealerId) {
  const purged = await purgeGuests();
  if (!purged) process.exit(1);
}

const sealed = dealerId ? true : await sealBatch();
await notifyDrops();
if (!sealed) process.exit(1);

async function purgeGuests() {
  let response;
  try {
    response = await request('/rest/v1/rpc/purge_unclaimed_guest_events', {
      token: key,
      method: 'POST',
      body: {},
    });
  } catch (error) {
    response = { ok: false, status: 0, body: { message: error instanceof Error ? error.message : String(error) } };
  }

  if (!response.ok) {
    const detail = response.body?.message ?? response.body?.error ?? JSON.stringify(response.body);
    const line = `Guest log: could not purge unclaimed rows (${response.status}): ${detail}`;
    console.error(line);
    annotation('error', 'GuestPurge', line);
    return false;
  }

  const removed = typeof response.body === 'number' ? response.body : 0;
  console.log(`Guest log: purged ${removed} unclaimed event(s) older than 180 days.`);
  return true;
}

async function sealBatch() {
  let response;
  try {
    response = await request('/rest/v1/rpc/seal_catalogue_batch', {
      token: key,
      method: 'POST',
      body: { p_batch_id: batchId },
    });
  } catch (error) {
    response = { ok: false, status: 0, body: { message: error instanceof Error ? error.message : String(error) } };
  }

  const row = Array.isArray(response.body) ? response.body[0] : null;
  if (!response.ok || !row) {
    const detail = response.body?.message ?? response.body?.error ?? JSON.stringify(response.body);
    const line = `New tab: could not seal batch ${batchId} (${response.status}): ${detail}`;
    console.error(line);
    annotation('error', 'CatalogueBatch', line);
    return false;
  }

  console.log(
    row.created
      ? `New tab: ${row.listing_count} watch(es) sealed (batch ${batchId}).`
      : `New tab: batch ${batchId} was already sealed with ${row.listing_count} watch(es).`
  );
  return true;
}

// The catalogue rows are already written. This still fails the job when the
// drop call itself fails, so a 404 or a rejected secret is not a green night.
// A successful call that selected nobody stays green and says why.
async function notifyDrops() {
  let status = 0;
  let parsed = null;
  try {
    const response = await fetch(`${url}/functions/v1/notify-drops`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'x-graham-cron-secret': secret,
      },
      body: '{}',
      signal: AbortSignal.timeout(60_000),
    });
    status = response.status;
    const text = await response.text();
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
  } catch (error) {
    parsed = error instanceof Error ? error.message : 'Drops were not sent.';
  }

  const outcome = interpretDrops(status, parsed);
  for (const line of outcome.lines) {
    if (outcome.fail) console.error(line);
    else console.log(line);
  }
  if (outcome.fail) {
    annotation('error', 'Drops', outcome.lines[0]);
    process.exit(1);
  }

  if (outcome.warn) {
    const notable =
      outcome.lines.find((line) => line.startsWith('Skipped:')) ??
      outcome.lines.find((line) => line.startsWith('Push tokens:')) ??
      outcome.lines[0];
    annotation('warning', 'Drops', notable);
  }

  if (!outcome.needsGap) return;
  try {
    await logTokenGap();
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Could not explain the empty drop.';
    console.error(detail);
    annotation('warning', 'Drops', detail);
  }
}

async function logTokenGap() {
  const follows = await request('/rest/v1/dealer_follows?select=user_id', { token: key });
  const tokens = await request('/rest/v1/device_push_tokens?select=user_id', { token: key });
  if (!follows.ok || !tokens.ok) {
    const detail = 'Could not explain the empty drop. The follow and token counts were not readable.';
    console.error(detail);
    annotation('warning', 'Drops', detail);
    return;
  }
  const followIds = Array.isArray(follows.body) ? follows.body.map((row) => row.user_id) : [];
  const tokenIds = Array.isArray(tokens.body) ? tokens.body.map((row) => row.user_id) : [];
  const line = tokenGapLine(explainTokenGap(followIds, tokenIds));
  console.log(line);
  annotation('warning', 'Drops', line);
}

function stepSummary(markdown) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}

async function insertRuns(rows) {
  if (rows.length === 0) return { recorded: true, missing: false, detail: null };
  const response = await request('/rest/v1/refresh_runs', {
    token: key,
    method: 'POST',
    body: rows,
    prefer: 'return=minimal',
  });
  if (response.ok) return { recorded: true, missing: false, detail: null };
  const detail = response.body?.message ?? response.body?.error ?? JSON.stringify(response.body);
  return {
    recorded: false,
    missing: isSchemaMiss(response.body, response.status),
    detail,
  };
}

async function fetchRuns(dealerIds) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const rows = [];
  const page = 1000;
  const filter = `dealer_id=in.(${dealerIds.join(',')})`;
  for (let offset = 0; ; offset += page) {
    const response = await request(
      `/rest/v1/refresh_runs?select=dealer_id,finished_at,ok,skipped,added,changed,published,error&${filter}&finished_at=gte.${encodeURIComponent(since)}&order=finished_at.desc&limit=${page}&offset=${offset}`,
      { token: key }
    );
    if (!response.ok) return { ok: false, missing: isSchemaMiss(response.body, response.status), rows, detail: response.body?.message };
    const batch = Array.isArray(response.body) ? response.body : [];
    rows.push(...batch);
    if (batch.length < page) return { ok: true, missing: false, rows, detail: null };
  }
}

function runsByDealer(rows) {
  const map = new Map();
  for (const row of rows) {
    const list = map.get(row.dealer_id) ?? [];
    list.push(row);
    map.set(row.dealer_id, list);
  }
  return map;
}

async function fetchPhotoGaps() {
  const response = await request('/rest/v1/rpc/catalogue_photo_gaps', {
    token: key,
    method: 'POST',
    body: {},
  });
  if (!response.ok) {
    return {
      ok: false,
      missing: isSchemaMiss(response.body, response.status),
      rows: [],
      detail: response.body?.message ?? response.body?.error ?? null,
    };
  }
  return {
    ok: true,
    missing: false,
    rows: Array.isArray(response.body) ? response.body : [],
    detail: null,
  };
}

async function reportHealth(results) {
  const notes = [];
  const rows = results.map(refreshRunRow);
  const saved = await insertRuns(rows);
  let history = new Map();

  if (!saved.recorded && saved.missing) {
    notes.push(
      'Refresh history is not on this database yet. Apply the new migrations with npm run db:push (after a dump) so the next nights can see a quiet streak. Today’s lines above are still the run.'
    );
  } else if (!saved.recorded) {
    notes.push(`Could not record refresh history (${saved.detail}).`);
    annotation('warning', 'RefreshHistory', saved.detail ?? 'Could not record refresh history.');
  } else if (results.length > 0) {
    const loaded = await fetchRuns(results.map((shop) => shop.dealerId));
    if (loaded.ok) history = runsByDealer(loaded.rows);
    else {
      notes.push(`Could not read refresh history (${loaded.detail ?? 'request failed'}).`);
      annotation('warning', 'RefreshHistory', loaded.detail ?? 'Could not read refresh history.');
    }
  }

  const photos = new Map();
  const gaps = await fetchPhotoGaps();
  if (gaps.ok) {
    for (const row of gaps.rows) photos.set(row.dealer_id, row);
  } else if (gaps.missing) {
    notes.push('Photo gap check is not on this database yet. It arrives with the same migration.');
  } else {
    notes.push(`Could not read photo gaps (${gaps.detail ?? 'request failed'}).`);
    annotation('warning', 'PhotoGaps', gaps.detail ?? 'Could not read photo gaps.');
  }

  const entries = results.map((shop) => {
    const recorded = saved.recorded ? (history.get(shop.dealerId) ?? []) : [refreshRunRow(shop)];
    return {
      label: shop.website ?? shop.dealerId,
      flags: shopFlags(shop, recorded, gaps.ok ? (photos.get(shop.dealerId) ?? null) : null),
    };
  });

  const report = healthReport(entries, notes);
  console.log(`\n${report.text}`);
  stepSummary(`### Shop health\n\n\`\`\`\n${report.text}\n\`\`\`\n`);
  for (const warning of report.warnings) annotation('warning', warning.title, warning.message);
}
