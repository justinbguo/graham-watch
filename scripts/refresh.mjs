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
 * A revoked shop is not in the list (`permission` is not `approved`).
 *
 * Exits 0 when at least one shop finished its catalogue read. A shop that
 * failed is logged and left for the next night. Exits 1 when the request
 * itself failed (missing secret, rejected cron secret, OpenAI key) or every
 * shop failed.
 */

import { readFileSync } from 'node:fs';

import { OPERATOR_HOSTED, parseEnvFile } from './_env.mjs';
import { config, describeTarget, request, serviceKey } from './_supabase.mjs';
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

if (exitCode !== 0) {
  const reason = refreshFailureReason(results);
  console.error(reason);
  annotation('error', 'RefreshFailed', reason);
  process.exit(exitCode);
}
