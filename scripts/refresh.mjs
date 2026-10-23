/**
 * Keep every approved shop current: re-read the catalogue, retire what sold,
 * auto-publish what is new or changed.
 *
 *   npm run refresh                 every approved shop (via scheduled-refresh)
 *   npm run refresh -- <dealer-id>  one shop
 *
 * Calls import-listings with the service role JWT (so the gateway accepts the
 * request) and GRAHAM_CRON_SECRET on x-graham-cron-secret (so only the nightly
 * job can start a full auto-publish). An operator session cannot write a
 * claimed shop's catalogue; the function uses the service role after that
 * check.
 *
 * Exits 0 when the function returns and at least one shop finished. A shop
 * that failed is logged and left for the next night. Exits 1 when the request
 * itself failed (missing secret, rejected cron secret, OpenAI key) or every
 * shop failed.
 */

import { readFileSync } from 'node:fs';

import { OPERATOR_HOSTED, parseEnvFile } from './_env.mjs';
import { config, describeTarget, serviceKey } from './_supabase.mjs';

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

console.log(describeTarget());

const response = await fetch(`${url}/functions/v1/import-listings`, {
  method: 'POST',
  headers: {
    apikey: anonKey,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    'x-graham-cron-secret': secret,
  },
  body: JSON.stringify({
    action: 'scheduled-refresh',
    ...(dealerId ? { dealerId } : {}),
  }),
});

const text = await response.text();
let body = null;
try {
  body = text ? JSON.parse(text) : null;
} catch {
  body = text;
}

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

function logResults(results) {
  let retired = 0;
  let published = 0;
  let failed = 0;

  for (const row of results) {
    if (!row.ok) {
      failed += 1;
      const label = row.website ?? row.dealerId;
      const reason = row.error ?? 'failed';
      console.error(`${label}\n  failed: ${reason}`);
      annotation('warning', 'ShopFailed', `${label}: ${reason}`);
      continue;
    }

    retired += Number(row.retired ?? 0);
    published += Number(row.published ?? 0);
    console.log(
      `${row.website ?? row.name}\n  read ${row.found}, ${row.changed} changed, ${row.added} new, ${
        row.retired
      } retired, ${row.relisted ?? 0} relisted, ${row.published} published${
        row.complete ? '' : ', incomplete read'
      }`
    );
  }

  return { retired, published, failed };
}

if (!response.ok) {
  const partial = Array.isArray(body?.results) ? body.results : [];
  if (partial.length) {
    const counts = logResults(partial);
    console.log(
      `\n${partial.length} shop(s) before the refresh stopped: ${counts.published} published, ${counts.retired} retired, ${counts.failed} failed.`
    );
  }
  const detail = body?.error ?? (typeof body === 'string' ? body : JSON.stringify(body));
  console.error(`Refresh failed (${response.status}): ${detail}`);
  annotation('error', 'RefreshFailed', detail);
  process.exit(1);
}

const results = body.results ?? [];
const { published, retired, failed } = logResults(results);

console.log(
  `\n${results.length} shop(s): ${published} published, ${retired} retired, ${failed} failed.`
);

if (results.length > 0 && failed === results.length) {
  console.error('Every shop failed.');
  annotation('error', 'RefreshFailed', 'Every shop failed.');
  process.exit(1);
}

if (failed > 0) {
  console.error(
    `${failed} of ${results.length} shop(s) failed. The shops that finished were still published.`
  );
}
