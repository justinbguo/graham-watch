#!/usr/bin/env node
/**
 * Drive a local Graham stack. Every command refuses the hosted project.
 *
 *   node .cursor/skills/verify-graham/control-graham.mjs <command> [--dry-run]
 *
 * Stdout is one JSON object. Progress and errors go to stderr as JSON when
 * the command fails.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { localStatus } from '../../../scripts/_env.mjs';

const SKILL = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SKILL, '../../..');
const RUN = path.join(SKILL, '.run');
const WEB_DIR = path.join(RUN, 'web');
const PUSHES = path.join(RUN, 'pushes.json');
const STATE = path.join(RUN, 'state.json');
const FUNCTIONS_ENV = path.join(ROOT, 'supabase', 'functions', '.env');
const FIXTURE = path.join(SKILL, 'fixtures', 'drop-watch.json');

const PRODUCTION_REF = 'hbxgxtbtefpyutyqafoi';
const CRON_SECRET = 'graham-local-verify-cron';
const OPERATOR_SECRET = 'sb_secret_local_operator_bot';
const CAPTURE_NAME = 'graham-push-capture';
const CAPTURE_URL = `http://${CAPTURE_NAME}:8799/push`;
const CATALOG_NAME = 'graham-catalog-shop';
const CATALOG_ORIGIN = `http://${CATALOG_NAME}:8799`;
const OPENAI_BASE_URL = `${CATALOG_ORIGIN}/v1/chat/completions`;
const OPENAI_LOCAL_KEY = 'local-catalog-proof';
const WEB_PORT = 8091;
const PUSH_TOKEN = 'ExponentPushToken[grahamverifybuyer01]';
const SHOP = {
  name: 'Test Bench',
  website: 'https://test-bench.graham.test',
  contact_email: 'bench@graham.test',
};
const EXCLUDED = [
  'realtime',
  'studio',
  'imgproxy',
  'logflare',
  'vector',
  'postgres-meta',
  'storage-api',
];

const PEOPLE = {
  buyer: {
    email: 'buyer@graham.test',
    first_name: 'Test',
    last_name: 'Buyer',
    handle: 'testbuyer',
    account_type: 'buyer',
    token: PUSH_TOKEN,
  },
  quiet: {
    email: 'quiet@graham.test',
    first_name: 'Quiet',
    last_name: 'Follower',
    handle: 'quietfollower',
    account_type: 'buyer',
    token: null,
  },
  dealer: {
    email: 'bench@graham.test',
    first_name: 'Test',
    last_name: 'Dealer',
    handle: 'testdealer',
    account_type: 'dealer',
    token: null,
  },
};

process.env.PATH = `${path.join(ROOT, 'node_modules', '.bin')}${path.delimiter}${process.env.PATH ?? ''}`;

function evidenceDir() {
  if (process.env.GRAHAM_EVIDENCE_DIR) return process.env.GRAHAM_EVIDENCE_DIR;
  if (existsSync('/opt/cursor/artifacts')) return '/opt/cursor/artifacts/verify-graham';
  return path.join(ROOT, 'artifacts', 'verify-graham');
}

function fail(error, hint, extra = {}) {
  process.stderr.write(`${JSON.stringify({ ok: false, error, hint, ...extra }, null, 2)}\n`);
  process.exit(1);
}

function ok(body) {
  process.stdout.write(`${JSON.stringify({ ok: true, ...body }, null, 2)}\n`);
}

function note(line) {
  process.stderr.write(`${line}\n`);
}

function assertLocalUrl(url, what) {
  if (!url) {
    fail(`${what} has no URL.`, 'Start the local stack: node .cursor/skills/verify-graham/control-graham.mjs up');
  }
  if (String(url).includes(PRODUCTION_REF)) {
    fail(
      `Refusing ${what}: the URL is the production project ${PRODUCTION_REF}.`,
      'Verification is local only. Do not point this CLI at the hosted project.',
    );
  }
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    fail(`${what} is not a URL: ${url}`, 'Use the URL from `supabase status` on this machine.');
  }
  if (host !== '127.0.0.1' && host !== 'localhost') {
    fail(
      `Refusing ${what}: host ${host} is not local.`,
      'This CLI only talks to 127.0.0.1. Run `up` and do not export a hosted SUPABASE_URL.',
    );
  }
}

function stack() {
  const status = localStatus();
  if (!status?.url || !status.anonKey || !status.serviceKey) return null;
  assertLocalUrl(status.url, 'the local stack');
  return status;
}

function requireStack() {
  const status = stack();
  if (!status) {
    fail(
      'The local Supabase stack is not running.',
      'Run: node .cursor/skills/verify-graham/control-graham.mjs up',
    );
  }
  return status;
}

function readState() {
  try {
    return JSON.parse(readFileSync(STATE, 'utf8'));
  } catch {
    return {};
  }
}

function writeState(patch) {
  mkdirSync(RUN, { recursive: true });
  writeFileSync(STATE, JSON.stringify({ ...readState(), ...patch }, null, 2));
}

function parseEnv(text) {
  const values = {};
  for (const line of text.split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
  return values;
}

function commandLine(pid) {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, 'utf8').replaceAll('\0', ' ');
  } catch {
    return '';
  }
}

async function api(url, path, { key, token = key, method = 'GET', body, prefer } = {}) {
  assertLocalUrl(url, path);
  const response = await fetch(`${url}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: response.status, ok: response.ok, body: parsed };
}

function person(name) {
  const key = name?.trim().toLowerCase();
  const found = PEOPLE[key];
  if (!found) {
    fail(
      `Unknown user "${name ?? ''}".`,
      'Use buyer, quiet, or dealer. buyer has a push token. quiet follows without one. dealer owns Test Bench.',
    );
  }
  return found;
}

async function signIn(status, who) {
  const link = await api(status.url, '/auth/v1/admin/generate_link', {
    key: status.serviceKey,
    method: 'POST',
    body: { type: 'magiclink', email: who.email },
  });
  const otp = link.body?.email_otp ?? link.body?.properties?.email_otp;
  if (!otp) {
    fail(
      `Could not mint a local sign-in code for ${who.email}.`,
      'Run seed first. generate_link only works for an account that already exists on this local stack.',
      { status: link.status, detail: link.body },
    );
  }
  let verified = await api(status.url, '/auth/v1/verify', {
    key: status.anonKey,
    method: 'POST',
    body: { type: 'magiclink', email: who.email, token: otp },
  });
  if (!verified.ok) {
    verified = await api(status.url, '/auth/v1/verify', {
      key: status.anonKey,
      method: 'POST',
      body: { type: 'email', email: who.email, token: otp },
    });
  }
  const access = verified.body?.access_token;
  const userId = verified.body?.user?.id;
  if (!verified.ok || !access || !userId) {
    fail(
      `Local sign-in failed for ${who.email}.`,
      'The code came from GoTrue on this machine. If the stack was reset, run seed again.',
      { status: verified.status, detail: verified.body },
    );
  }
  return { email: who.email, userId, accessToken: access };
}

async function ensureUser(status, who) {
  const created = await api(status.url, '/auth/v1/admin/users', {
    key: status.serviceKey,
    method: 'POST',
    body: { email: who.email, email_confirm: true },
  });
  let userId = created.body?.id;
  if (!userId) {
    const session = await signIn(status, who);
    userId = session.userId;
  }
  const profile = await api(status.url, `/rest/v1/profiles?id=eq.${userId}`, {
    key: status.serviceKey,
    method: 'PATCH',
    prefer: 'return=representation',
    body: {
      first_name: who.first_name,
      last_name: who.last_name,
      handle: who.handle,
      date_of_birth: '1990-05-01',
      account_type: who.account_type,
      onboarded_at: new Date().toISOString(),
    },
  });
  if (!profile.ok) {
    fail(
      `Could not finish the profile for ${who.email}.`,
      'onboarded_at requires an adult birthday and an account type. The patch sends both.',
      { status: profile.status, detail: profile.body },
    );
  }
  return userId;
}

async function ensureShop(status, dealerId) {
  const existing = await api(
    status.url,
    `/rest/v1/dealers?website=eq.${encodeURIComponent(SHOP.website)}&select=id,name,permission`,
    { key: status.serviceKey },
  );
  if (!existing.ok) {
    fail('Could not read dealers.', 'The local API should answer this. Run doctor.', {
      status: existing.status,
      detail: existing.body,
    });
  }
  if (existing.body?.[0]?.id) return existing.body[0];
  const inserted = await api(status.url, '/rest/v1/dealers', {
    key: status.serviceKey,
    method: 'POST',
    prefer: 'return=representation',
    body: {
      name: SHOP.name,
      website: SHOP.website,
      contact_email: SHOP.contact_email,
      permission: 'approved',
      created_by: dealerId,
      claimed_by: dealerId,
    },
  });
  if (!inserted.ok || !inserted.body?.[0]?.id) {
    fail('Could not create Test Bench.', 'The insert uses the service role on the local stack only.', {
      status: inserted.status,
      detail: inserted.body,
    });
  }
  return inserted.body[0];
}

async function ensureShelf(status, shopId, importerId) {
  const existing = await api(
    status.url,
    `/rest/v1/listings?dealer_id=eq.${shopId}&reference=eq.SHELF-1&select=id,created_at`,
    { key: status.serviceKey },
  );
  if (existing.body?.[0]?.id) return existing.body[0];
  const inserted = await api(status.url, '/rest/v1/listings', {
    key: status.serviceKey,
    method: 'POST',
    prefer: 'return=representation',
    body: {
      dealer_id: shopId,
      imported_by: importerId,
      brand: 'Fixture',
      model: 'Shelf',
      reference: 'SHELF-1',
      year: 1962,
      price_cents: 100000,
      currency: 'USD',
      status: 'active',
      description: 'On the shelf before anyone followed. This must not become a drop.',
      source_url: 'https://test-bench.graham.test/shelf-1',
    },
  });
  if (!inserted.ok) {
    fail('Could not insert the shelf listing.', 'Seed inserts it with the service role before anyone follows.', {
      status: inserted.status,
      detail: inserted.body,
    });
  }
  return inserted.body?.[0];
}

async function registerToken(status, who) {
  if (!who.token) return null;
  const session = await signIn(status, who);
  const registered = await api(status.url, '/rest/v1/rpc/register_push_token', {
    key: status.anonKey,
    token: session.accessToken,
    method: 'POST',
    body: { p_token: who.token, p_platform: 'ios' },
  });
  if (!registered.ok) {
    fail(
      `Could not register a push token for ${who.email}.`,
      'The token must look like ExponentPushToken[...]. The RPC runs as that user.',
      { status: registered.status, detail: registered.body },
    );
  }
  return who.token;
}

function networkName() {
  const listed = spawnSync('docker', ['network', 'ls', '--format', '{{.Name}}'], { encoding: 'utf8' });
  const name = listed.stdout
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('supabase_network_graham'));
  if (!name) {
    fail(
      'The local Supabase docker network is not up.',
      'Run up first. The capture container joins that network so the edge function can reach it by name.',
    );
  }
  return name;
}

function startCapture() {
  mkdirSync(RUN, { recursive: true });
  if (!existsSync(PUSHES)) writeFileSync(PUSHES, '[]\n');
  spawnSync('docker', ['rm', '-f', CAPTURE_NAME], { encoding: 'utf8' });
  const started = spawnSync(
    'docker',
    [
      'run',
      '-d',
      '--name',
      CAPTURE_NAME,
      '--network',
      networkName(),
      '-v',
      `${SKILL}:/app:ro`,
      '-v',
      `${RUN}:/captures`,
      '-e',
      'CAPTURE_FILE=/captures/pushes.json',
      'node:22-alpine',
      'node',
      '/app/capture-server.mjs',
    ],
    { encoding: 'utf8' },
  );
  if (started.status !== 0) {
    fail(
      'The push capture container did not start.',
      'Docker must be running. The image is node:22-alpine. The function posts to http://graham-push-capture:8799/push and nowhere else.',
      { detail: `${started.stderr}\n${started.stdout}`.trim() },
    );
  }
}

function writeFunctionEnv() {
  let current = {};
  if (existsSync(FUNCTIONS_ENV)) {
    const text = readFileSync(FUNCTIONS_ENV, 'utf8');
    if (text.includes(PRODUCTION_REF)) {
      fail(
        'supabase/functions/.env mentions the production project.',
        'Remove that file or delete the hosted URL. This CLI will not merge into it.',
      );
    }
    current = parseEnv(text);
  }
  const next = {
    ...current,
    GRAHAM_CRON_SECRET: CRON_SECRET,
    GRAHAM_OPERATOR_SECRET: OPERATOR_SECRET,
    GRAHAM_ALLOW_FIXTURE_IMPORT: '1',
    EXPO_PUSH_URL: CAPTURE_URL,
    OPENAI_BASE_URL,
    OPENAI_API_KEY: OPENAI_LOCAL_KEY,
  };
  const lines = [
    '# Written by control-graham. Local verification only. Gitignored.',
    ...Object.entries(next).map(([key, value]) => `${key}=${value}`),
    '',
  ];
  writeFileSync(FUNCTIONS_ENV, lines.join('\n'));
}

function edgeEnv(name) {
  const result = spawnSync(
    'docker',
    ['exec', 'supabase_edge_runtime_graham-watch', 'printenv', name],
    { encoding: 'utf8' },
  );
  return result.status === 0 ? result.stdout.trim() : null;
}

function relaxLegacyForward() {
  // Docker on this image writes nft rules and also leaves an iptables-legacy
  // FORWARD policy of DROP. Container-to-container IPv4 then times out, and
  // GoTrue's migrate never reaches Postgres. GitHub-hosted runners do not
  // have that leftover policy. Setting it to ACCEPT is a no-op there.
  const listed = spawnSync('iptables-legacy', ['-S', 'FORWARD'], { encoding: 'utf8' });
  if (listed.status !== 0 || !listed.stdout.includes('-P FORWARD DROP')) return;
  const updated = spawnSync('sudo', ['iptables-legacy', '-P', 'FORWARD', 'ACCEPT'], { encoding: 'utf8' });
  if (updated.status !== 0) {
    fail(
      'Docker cannot forward IPv4 between containers.',
      'iptables-legacy FORWARD is DROP. Run: sudo iptables-legacy -P FORWARD ACCEPT. Then run up again.',
      { detail: updated.stderr },
    );
  }
  note('Set iptables-legacy FORWARD to ACCEPT so local Supabase containers can reach Postgres.');
}

function runSupabase(args) {
  const result = spawnSync('supabase', args, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 15 * 60 * 1000,
  });
  return result;
}

async function waitForApi(status) {
  const deadline = Date.now() + 60_000;
  let last = null;
  while (Date.now() < deadline) {
    last = await api(status.url, '/rest/v1/dealers?select=id&limit=1', { key: status.serviceKey });
    if (last.ok) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  fail(
    'The local API is up but a dealers read failed.',
    'Migrations or seed may still be applying. Run doctor, then up again.',
    { detail: last },
  );
}

async function commandUp(dryRun) {
  const plan = {
    command: 'up',
    exclude: EXCLUDED,
    functionEnv: {
      GRAHAM_ALLOW_FIXTURE_IMPORT: '1',
      EXPO_PUSH_URL: CAPTURE_URL,
      OPENAI_BASE_URL,
      GRAHAM_CRON_SECRET: 'set locally, not printed',
      GRAHAM_OPERATOR_SECRET: 'set locally, not printed',
    },
  };
  if (dryRun) {
    ok({ ...plan, dryRun: true });
    return;
  }
  if (spawnSync('docker', ['info'], { encoding: 'utf8' }).status !== 0) {
    fail('Docker is not running.', 'Start Docker, then run up again. supabase start needs it.');
  }
  relaxLegacyForward();
  writeFunctionEnv();
  const running = stack();
  const envMatches = running
    && edgeEnv('EXPO_PUSH_URL') === CAPTURE_URL
    && edgeEnv('GRAHAM_ALLOW_FIXTURE_IMPORT') === '1'
    && edgeEnv('GRAHAM_OPERATOR_SECRET') === OPERATOR_SECRET
    && edgeEnv('OPENAI_BASE_URL') === OPENAI_BASE_URL
    && edgeEnv('OPENAI_API_KEY') === OPENAI_LOCAL_KEY;
  if (!envMatches) {
    if (running) {
      note('Restarting the local stack so the edge runtime picks up the capture URL.');
      const stopped = runSupabase(['stop']);
      if (stopped.status !== 0) {
        fail('supabase stop failed.', 'Read the detail. Do not stop containers by image name.', {
          detail: `${stopped.stderr}`.slice(-2000),
        });
      }
    }
    note(`Starting local Supabase without ${EXCLUDED.join(', ')}.`);
    const started = runSupabase(['start', '-x', EXCLUDED.join(',')]);
    if (started.status !== 0) {
      fail(
        'supabase start failed.',
        'The log tail is in detail. Verification excludes studio and realtime; the database job in CI still starts the full stack.',
        { detail: `${started.stdout}\n${started.stderr}`.slice(-4000) },
      );
    }
  }
  const status = requireStack();
  await waitForApi(status);
  startCapture();
  const pointed = spawnSync(process.execPath, ['scripts/env.mjs', 'local'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (pointed.status !== 0) {
    fail(
      'Could not point the app at the local stack.',
      'npm run env -- local writes .env.local from supabase status. Run it after the stack is healthy.',
      { detail: pointed.stderr },
    );
  }
  writeState({ webPid: readState().webPid ?? null });
  ok({
    ...plan,
    url: status.url,
    capture: CAPTURE_URL,
    ready: true,
  });
}

async function commandSeed(dryRun) {
  if (dryRun) {
    ok({
      command: 'seed',
      dryRun: true,
      users: Object.values(PEOPLE).map((who) => who.email),
      shop: SHOP.name,
      shelf: 'SHELF-1',
      pushToken: PUSH_TOKEN,
    });
    return;
  }
  const status = requireStack();
  const ids = {};
  for (const [name, who] of Object.entries(PEOPLE)) {
    ids[name] = await ensureUser(status, who);
  }
  const shop = await ensureShop(status, ids.dealer);
  const shelf = await ensureShelf(status, shop.id, ids.dealer);
  const token = await registerToken(status, PEOPLE.buyer);
  ok({
    command: 'seed',
    users: {
      buyer: { id: ids.buyer, email: PEOPLE.buyer.email, pushToken: token },
      quiet: { id: ids.quiet, email: PEOPLE.quiet.email, pushToken: null },
      dealer: { id: ids.dealer, email: PEOPLE.dealer.email },
    },
    dealer: { id: shop.id, name: shop.name, permission: shop.permission ?? 'approved' },
    shelfListingId: shelf.id,
  });
}

async function commandSignIn(userName, dryRun) {
  const who = person(userName);
  if (dryRun) {
    ok({ command: 'sign-in', dryRun: true, email: who.email });
    return;
  }
  const status = requireStack();
  const session = await signIn(status, who);
  ok({
    command: 'sign-in',
    email: session.email,
    userId: session.userId,
    accessToken: session.accessToken,
  });
}

async function dealerIdOf(status, name) {
  if (/^[0-9a-f-]{36}$/i.test(name)) return name;
  const key = name.trim().toLowerCase();
  if (key !== 'dealer' && key !== 'bench' && key !== 'test bench') {
    fail('Unknown dealer.', 'Use dealer, which is the Test Bench shop created by seed.');
  }
  const found = await api(
    status.url,
    `/rest/v1/dealers?website=eq.${encodeURIComponent(SHOP.website)}&select=id,name`,
    { key: status.serviceKey },
  );
  const id = found.body?.[0]?.id;
  if (!id) fail('Test Bench does not exist yet.', 'Run seed before follow.');
  return id;
}

async function commandFollow(userName, dealerName, dryRun) {
  const who = person(userName);
  if (dryRun) {
    ok({ command: 'follow', dryRun: true, user: who.email, dealer: dealerName });
    return;
  }
  const status = requireStack();
  const session = await signIn(status, who);
  const dealerId = await dealerIdOf(status, dealerName);
  const followed = await api(status.url, '/rest/v1/dealer_follows', {
    key: status.anonKey,
    token: session.accessToken,
    method: 'POST',
    prefer: 'resolution=ignore-duplicates,return=representation',
    body: { user_id: session.userId, dealer_id: dealerId },
  });
  if (!followed.ok && followed.status !== 409) {
    fail(
      `${who.email} could not follow the shop.`,
      'Follow inserts dealer_follows as that user. The shop must be approved. Run seed first.',
      { status: followed.status, detail: followed.body },
    );
  }
  const row = await api(
    status.url,
    `/rest/v1/dealer_follows?user_id=eq.${session.userId}&dealer_id=eq.${dealerId}&select=created_at`,
    { key: status.anonKey, token: session.accessToken },
  );
  ok({
    command: 'follow',
    user: who.email,
    userId: session.userId,
    dealerId,
    followedAt: row.body?.[0]?.created_at ?? null,
  });
}

async function commandImport(dryRun) {
  const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  if (dryRun) {
    ok({ command: 'import', dryRun: true, fixture, openai: false });
    return;
  }
  const status = requireStack();
  const session = await signIn(status, PEOPLE.dealer);
  const dealerId = await dealerIdOf(status, 'dealer');
  const result = await api(status.url, '/functions/v1/import-listings', {
    key: status.anonKey,
    token: session.accessToken,
    method: 'POST',
    body: { action: 'fixture', dealerId, listings: [fixture] },
  });
  if (!result.ok) {
    fail(
      'Fixture import failed.',
      'import-listings action "fixture" is local-only. Run up so GRAHAM_ALLOW_FIXTURE_IMPORT=1 is on the edge runtime, then seed so the dealer owns Test Bench.',
      { status: result.status, detail: result.body },
    );
  }
  ok({ command: 'import', dealerId, ...result.body });
}

function readPushes() {
  try {
    const parsed = JSON.parse(readFileSync(PUSHES, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function commandNotify(dryRun) {
  if (dryRun) {
    ok({
      command: 'notify-drops',
      dryRun: true,
      postsTo: 'local functions/v1/notify-drops',
      pushTarget: CAPTURE_URL,
      realExpo: false,
    });
    return;
  }
  const status = requireStack();
  if (edgeEnv('EXPO_PUSH_URL') !== CAPTURE_URL) {
    fail(
      'notify-drops is not pointed at the capture server.',
      `Run up. The edge runtime must have EXPO_PUSH_URL=${CAPTURE_URL}. A hosted URL is refused by the function.`,
    );
  }
  mkdirSync(RUN, { recursive: true });
  writeFileSync(PUSHES, '[]\n');
  const response = await fetch(`${status.url}/functions/v1/notify-drops`, {
    method: 'POST',
    headers: {
      apikey: status.anonKey,
      Authorization: `Bearer ${status.serviceKey}`,
      'Content-Type': 'application/json',
      'x-graham-cron-secret': CRON_SECRET,
    },
    body: '{}',
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    fail(
      'notify-drops refused the call.',
      'Send the service-role JWT and x-graham-cron-secret. The local secret is written by up. Do not call the hosted function.',
      { status: response.status, detail: body },
    );
  }
  const captured = readPushes().flatMap((entry) => entry.messages ?? []);
  ok({ command: 'notify-drops', response: body, captured });
}

async function commandDropsStatus(userName) {
  const who = person(userName);
  const status = requireStack();
  const session = await signIn(status, who);
  const notes = await api(
    status.url,
    `/rest/v1/drop_notifications?user_id=eq.${session.userId}&select=id,title,body,status,destination,dealer_id,listing_ids,notified_on`,
    { key: status.anonKey, token: session.accessToken },
  );
  const unseen = await api(status.url, '/rest/v1/rpc/unseen_drop_count', {
    key: status.anonKey,
    token: session.accessToken,
    method: 'POST',
    body: {},
  });
  if (!notes.ok || !unseen.ok) {
    fail(
      `Could not read drops for ${who.email}.`,
      'Both reads run as that user. A 401 means sign-in failed. Run seed if the account is missing.',
      { notes: notes.body, unseen: unseen.body },
    );
  }
  const captured = readPushes()
    .flatMap((entry) => entry.messages ?? [])
    .filter((message) => !who.token || message.to === who.token);
  ok({
    command: 'drops-status',
    user: who.email,
    userId: session.userId,
    notifications: notes.body ?? [],
    unseen: unseen.body,
    captured: who.token ? captured : captured.filter((message) => message.to === who.token),
  });
}

function webUp() {
  const state = readState();
  if (state.webPid && commandLine(state.webPid).includes('web-server.mjs')) {
    return state.webPid;
  }
  return null;
}

function newestMtime(dir) {
  let newest = 0;
  if (!existsSync(dir)) return newest;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) newest = Math.max(newest, newestMtime(full));
    else newest = Math.max(newest, statSync(full).mtimeMs);
  }
  return newest;
}

function exportIsStale() {
  const indexHtml = path.join(WEB_DIR, 'index.html');
  if (!existsSync(indexHtml)) return true;
  return statSync(indexHtml).mtimeMs < newestMtime(path.join(ROOT, 'src'));
}

async function stopWebServer() {
  const existing = webUp();
  if (!existing) return;
  try {
    process.kill(existing, 'SIGTERM');
  } catch {
  }
  writeState({ webPid: null });
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      await fetch(`http://127.0.0.1:${WEB_PORT}/`);
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  fail(
    'The previous web server is still answering.',
    'The export is older than src. verify-drops restarts it so the proof is this build. Stop the process on port 8091 and rerun.',
  );
}

async function commandWeb(dryRun) {
  if (dryRun) {
    ok({ command: 'web', dryRun: true, port: WEB_PORT, dir: WEB_DIR });
    return;
  }
  requireStack();
  if (exportIsStale()) {
    await stopWebServer();
    rmSync(WEB_DIR, { recursive: true, force: true });
  }
  const existing = webUp();
  if (existing) {
    ok({ command: 'web', url: `http://127.0.0.1:${WEB_PORT}`, pid: existing, reused: true });
    return;
  }
  mkdirSync(RUN, { recursive: true });
  if (!existsSync(path.join(WEB_DIR, 'index.html'))) {
    note('Exporting the Expo web build. The first export compiles the app.');
    const exported = spawnSync(
      'npx',
      ['expo', 'export', '--platform', 'web', '--output-dir', WEB_DIR],
      { cwd: ROOT, encoding: 'utf8', timeout: 15 * 60 * 1000, env: { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1' } },
    );
    if (exported.status !== 0 || !existsSync(path.join(WEB_DIR, 'index.html'))) {
      fail(
        'The Expo web export failed.',
        'The app must point at the local stack (`up` writes .env.local). The tail of the export is in detail.',
        { detail: `${exported.stdout}\n${exported.stderr}`.slice(-4000) },
      );
    }
  }
  const child = spawn(process.execPath, [path.join(SKILL, 'web-server.mjs'), WEB_DIR, String(WEB_PORT)], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  writeState({ webPid: child.pid });
  const deadline = Date.now() + 15_000;
  let ready = false;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${WEB_PORT}/`);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // The process is still binding the port.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!ready) {
    fail('The web server did not answer.', `It should listen on 127.0.0.1:${WEB_PORT}. Run doctor.`);
  }
  ok({ command: 'web', url: `http://127.0.0.1:${WEB_PORT}`, pid: child.pid, reused: false });
}

async function mailpitCode(email, since) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const list = await fetch('http://127.0.0.1:54324/api/v1/messages');
    if (list.ok) {
      const payload = await list.json();
      const matches = (payload.messages ?? []).filter((message) => {
        const addressed = (message.To ?? []).some(
          (entry) => (entry.Address ?? '').toLowerCase() === email.toLowerCase(),
        );
        const created = Date.parse(message.Created);
        return addressed && (Number.isNaN(created) || created >= since - 2000);
      });
      matches.sort((a, b) => Date.parse(b.Created) - Date.parse(a.Created));
      const match = matches[0];
      if (match) {
        const detail = await fetch(`http://127.0.0.1:54324/api/v1/message/${match.ID}`);
        const body = await detail.json();
        const text = `${body.Text ?? ''}\n${body.HTML ?? ''}`;
        const code = text.match(/your code:[\s\S]*?(\d{6})/i)?.[1] ?? text.match(/\b(\d{6})\b/)?.[1];
        if (code) return code;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return null;
}

const DROPS_BUTTON = /New from dealers you follow, [1-9]/;
const MESSAGES_TAB = /Messages, [1-9]/;
const WATCH_NAME = 'Fixture Drop, 1968';

async function loadChromium() {
  try {
    const { chromium } = await import('playwright');
    return chromium;
  } catch {
    fail(
      'Playwright is not installed.',
      'From the repo root: npm install --save-dev playwright && npx playwright install chromium',
    );
  }
}

async function pageText(page) {
  return page.locator('body').innerText().catch(() => '');
}

async function shoot(page, file) {
  mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  await page.screenshot({ path: path.resolve(file), fullPage: true });
}

async function dismissTaste(page) {
  const skip = page.getByRole('button', { name: 'Skip', exact: true });
  const visible = await skip.isVisible().catch(() => false);
  if (!visible) {
    const appeared = await skip
      .waitFor({ state: 'visible', timeout: 4_000 })
      .then(() => true)
      .catch(() => false);
    if (!appeared) return;
  }
  await skip.click();
  await skip.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
}

async function ensureSignedIn(page, email) {
  await dismissTaste(page);
  const gate = page.getByRole('button', { name: 'Log in or create an account' });
  const emailDoor = page.getByRole('button', { name: 'Continue with email' });
  const buy = page.getByRole('tab', { name: 'Buy' });
  try {
    await Promise.race([
      gate.waitFor({ state: 'visible', timeout: 30_000 }),
      emailDoor.waitFor({ state: 'visible', timeout: 30_000 }),
      buy.waitFor({ state: 'visible', timeout: 30_000 }),
    ]);
  } catch (error) {
    fail(
      'The web export did not show sign-in or the tab bar.',
      'The page should offer Log in or create an account, Continue with email, or the Buy tab when a session is already stored.',
      { url: page.url(), text: (await pageText(page)).slice(0, 800), cause: error instanceof Error ? error.message : String(error) },
    );
  }
  const gateOpen = await gate.isVisible().catch(() => false);
  const doorOpen = await emailDoor.isVisible().catch(() => false);
  if (!gateOpen && !doorOpen) return;

  if (gateOpen) await gate.click();
  await emailDoor.click();
  await page.getByPlaceholder('you@example.com').fill(email);
  const since = Date.now();
  await page.getByRole('button', { name: 'Send me a code' }).click();
  const code = await mailpitCode(email, since);
  if (!code) {
    fail(
      'Mailpit did not receive a sign-in code.',
      'The local stack includes mailpit on port 54324. Run up, then seed, then screenshot again.',
    );
  }
  const field = page.getByLabel('Sign-in code');
  if ((await field.inputValue().catch(() => '')).trim().length !== 6) {
    await field.fill(code);
    await page.getByRole('button', { name: 'Continue' }).click();
  }
  // Continue stores the session, then the sheet goes back to Buy.
  // Clicking a tab before that storage lands dismisses the sheet instead.
  try {
    await page.waitForFunction(
      () =>
        Object.keys(localStorage).some((key) => {
          const value = localStorage.getItem(key) ?? '';
          return key.includes('auth-token') && value.includes('access_token');
        }),
      { timeout: 20_000 },
    );
  } catch {
    fail(
      'The sign-in code was not accepted.',
      'Mailpit has the code. The field is Sign-in code and the button is Continue. If the page says a code was already sent, wait and use the newest Mailpit message.',
      { url: page.url(), text: (await pageText(page)).slice(0, 800) },
    );
  }
  await gate.waitFor({ state: 'hidden', timeout: 20_000 });
  await buy.waitFor({ state: 'visible', timeout: 20_000 });
}

async function openMessages(page) {
  const tab = page.getByRole('tab', { name: MESSAGES_TAB });
  try {
    await tab.first().waitFor({ state: 'visible', timeout: 20_000 });
  } catch (error) {
    const failed = path.join(evidenceDir(), 'messages-tab-missing.png');
    await shoot(page, failed).catch(() => undefined);
    fail(
      'The Messages tab did not show the unseen count.',
      'The count sits on Messages, not Profile. Sign-in returns to Buy, and the tab name includes the count once the drops query resolves.',
      { url: page.url(), text: (await pageText(page)).slice(0, 800), failed, cause: error instanceof Error ? error.message : String(error) },
    );
  }
  const badge = page.getByRole('button', { name: DROPS_BUTTON });
  if (!(await badge.isVisible().catch(() => false))) await tab.first().click();
  try {
    await badge.waitFor({ state: 'visible', timeout: 20_000 });
  } catch (error) {
    const failed = path.join(evidenceDir(), 'messages-row-missing.png');
    await shoot(page, failed).catch(() => undefined);
    fail(
      'Messages did not show the drops row.',
      'The button is New from dealers you follow, N. It is the first row of the inbox.',
      { url: page.url(), text: (await pageText(page)).slice(0, 800), failed, cause: error instanceof Error ? error.message : String(error) },
    );
  }
  const profileBadge = await page.getByRole('tab', { name: /Profile, [1-9]/ }).count();
  if (profileBadge) {
    fail('Profile still wears the drops count.', 'The unseen badge belongs on the Messages tab.');
  }
  return {
    badgeLabel: (await badge.getAttribute('aria-label')) ?? (await badge.innerText()),
    tabLabel: await tab.first().getAttribute('aria-label'),
  };
}

async function openDealerProfile(page) {
  await page.getByRole('tab', { name: 'Profile', exact: true }).click();
  try {
    await page.getByText('Your shop', { exact: true }).waitFor({ state: 'visible', timeout: 20_000 });
    await page.getByText('Test Bench', { exact: true }).first().waitFor({ state: 'visible' });
    await page.getByRole('tab', { name: 'Deal', exact: true }).waitFor({ state: 'visible' });
  } catch (error) {
    const failed = path.join(evidenceDir(), 'dealer-profile-missing.png');
    await shoot(page, failed).catch(() => undefined);
    fail(
      'Profile did not show the claimed shop.',
      'The dealer sees Your shop, Test Bench, and a Deal tab in place of Messages.',
      { url: page.url(), text: (await pageText(page)).slice(0, 800), failed, cause: error instanceof Error ? error.message : String(error) },
    );
  }
  return { shop: 'Test Bench', tab: 'Deal' };
}

async function openProfile(page) {
  await page.getByRole('tab', { name: 'Profile', exact: true }).click();
  const shop = page.getByRole('button', { name: 'Test Bench, verified' });
  try {
    await shop.waitFor({ state: 'visible', timeout: 20_000 });
  } catch (error) {
    const failed = path.join(evidenceDir(), 'profile-following-missing.png');
    await shoot(page, failed).catch(() => undefined);
    fail(
      'Profile did not show the Following list.',
      'The shops stay on Profile. The drops row and the N new count do not.',
      { url: page.url(), text: (await pageText(page)).slice(0, 800), failed, cause: error instanceof Error ? error.message : String(error) },
    );
  }
  const drops = await page.getByRole('button', { name: /New from dealers you follow/ }).isVisible().catch(() => false);
  const profileBadge = await page.getByRole('tab', { name: /Profile, [1-9]/ }).count();
  const fresh = await page.getByText(/^\d+ new$/).isVisible().catch(() => false);
  if (drops || profileBadge || fresh) {
    fail(
      'Profile still shows Drops.',
      'The unseen row, the tab count, and the per-shop N new label now live with Messages.',
      { url: page.url(), text: (await pageText(page)).slice(0, 800), drops, profileBadge, fresh },
    );
  }
  return {
    messagesTab: await page.getByRole('tab', { name: MESSAGES_TAB }).first().getAttribute('aria-label'),
    profileTab: 'Profile',
    following: 'Test Bench, verified',
  };
}

async function waitForWatch(page) {
  // The feed stays mounted under the dealer-scoped one, so the title can match twice.
  const title = page.getByText('New watches', { exact: true }).filter({ visible: true });
  const watch = page.getByRole('button', { name: WATCH_NAME }).filter({ visible: true });
  await title.first().waitFor({ state: 'visible', timeout: 20_000 });
  await watch.first().waitFor({ state: 'visible' });
}

async function commandScreenshot(route, file, userName) {
  if (!route?.startsWith('/')) {
    fail('screenshot needs a route.', 'Example: screenshot /messages artifacts/messages.png --as buyer');
  }
  if (!file) fail('screenshot needs an output path.', 'Pass the png path after the route.');
  const who = person(userName ?? 'buyer');
  if (!webUp()) {
    fail('The web build is not being served.', 'Run the web command first. screenshot does not start a second server.');
  }
  const chromium = await loadChromium();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(90_000);
  const target = `http://127.0.0.1:${WEB_PORT}${route}`;
  const pathOnly = route.split('?')[0];
  try {
    await page.goto(target, { waitUntil: 'domcontentloaded' });
    let detail = {};
    // Shop and inquiry are modals with no tab bar. A signed-in cold load of
    // those URLs is sent back to Buy, so capture the sheet on the direct load.
    if (pathOnly.startsWith('/inquiry/')) {
      const composer = page.getByRole('button', { name: 'Send via Graham' });
      const missing = page.getByText('That watch is no longer available.', { exact: true });
      try {
        await Promise.any([
          composer.waitFor({ state: 'visible', timeout: 30_000 }),
          missing.waitFor({ state: 'visible', timeout: 30_000 }),
        ]);
      } catch (error) {
        fail(
          'The inquiry sheet did not settle.',
          'A readable listing shows Send via Graham. A listing the client cannot read says the watch is no longer available.',
          { url: page.url(), text: (await pageText(page)).slice(0, 800), cause: error instanceof Error ? error.message : String(error) },
        );
      }
      detail = { surface: 'inquiry' };
    } else if (pathOnly.startsWith('/dealer/')) {
      try {
        await page.getByText('Inventory', { exact: true }).waitFor({ state: 'visible', timeout: 20_000 });
      } catch (error) {
        fail(
          'The shop page did not show its inventory.',
          'The dealer route is a modal. The section title is Inventory.',
          { url: page.url(), text: (await pageText(page)).slice(0, 800), cause: error instanceof Error ? error.message : String(error) },
        );
      }
      detail = { surface: 'dealer' };
    } else {
      await ensureSignedIn(page, who.email);
      if (pathOnly === '/messages') detail = await openMessages(page);
      else if (pathOnly === '/profile') {
        detail = who.email === PEOPLE.dealer.email ? await openDealerProfile(page) : await openProfile(page);
      } else if (pathOnly === '/drops') {
        await page.goto(target, { waitUntil: 'domcontentloaded' });
        await waitForWatch(page);
        detail = { url: page.url() };
      } else if (pathOnly === '/community') {
        try {
          await page.getByRole('tab', { name: 'Community', exact: true }).click();
          await page.getByRole('button', { name: 'All posts' }).waitFor({ state: 'visible', timeout: 20_000 });
        } catch (error) {
          const failed = path.join(evidenceDir(), 'community-missing.png');
          await shoot(page, failed).catch(() => undefined);
          fail(
            'Community did not show the post filter.',
            'The signed-in board has a button named All posts.',
            { url: page.url(), text: (await pageText(page)).slice(0, 800), failed, cause: error instanceof Error ? error.message : String(error) },
          );
        }
        detail = { surface: 'community' };
      } else if (pathOnly === '/') {
        await page.getByText(/\d+ watches available/).first().waitFor({ state: 'visible', timeout: 20_000 });
        detail = { surface: 'buy' };
      } else if (pathOnly === '/new') {
        await page.goto(target, { waitUntil: 'domcontentloaded' });
        await page
          .getByText(/New watches appear here after the nightly update\.|watches from |New watches could not be loaded\./)
          .first()
          .waitFor({ state: 'visible', timeout: 20_000 });
        detail = { surface: 'new' };
      } else {
        await page.goto(target, { waitUntil: 'domcontentloaded' });
      }
    }
    await shoot(page, file);
    const badgeLabel = detail.badgeLabel ?? null;
    const unseen = Number(String(badgeLabel ?? '').match(/(\d+)/)?.[1] ?? '0');
    ok({
      command: 'screenshot',
      route,
      path: path.resolve(file),
      user: who.email,
      unseen,
      ...detail,
    });
  } finally {
    await browser.close();
  }
}

async function commandTour(dealerId, dryRun) {
  if (dryRun) {
    ok({
      command: 'tour',
      dryRun: true,
      writes: ['messages.png', 'profile.png', 'drops.png', 'deep-link.png', 'drops-messages.webm'],
    });
    return;
  }
  if (!dealerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dealerId)) {
    fail('tour needs the dealer id.', 'Pass the Test Bench id from follow. The deep link is /drops?dealerId=<id>.');
  }
  if (!webUp()) {
    fail('The web build is not being served.', 'Run the web command first. tour does not start a second server.');
  }
  const evidence = evidenceDir();
  mkdirSync(evidence, { recursive: true });
  const videoDir = path.join(evidence, 'video-tmp');
  rmSync(videoDir, { recursive: true, force: true });
  mkdirSync(videoDir, { recursive: true });
  const files = {
    messages: path.join(evidence, 'messages.png'),
    profile: path.join(evidence, 'profile.png'),
    drops: path.join(evidence, 'drops.png'),
    deepLink: path.join(evidence, 'deep-link.png'),
    video: path.join(evidence, 'drops-messages.webm'),
  };
  const chromium = await loadChromium();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    recordVideo: { dir: videoDir, size: { width: 390, height: 844 } },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(90_000);
  const who = person('buyer');
  let detail = null;
  try {
    await page.goto(`http://127.0.0.1:${WEB_PORT}/messages`, { waitUntil: 'domcontentloaded' });
    await ensureSignedIn(page, who.email);
    const messages = await openMessages(page);
    await page.waitForTimeout(800);
    await shoot(page, files.messages);
    const profile = await openProfile(page);
    await page.waitForTimeout(800);
    await shoot(page, files.profile);
    await page.getByRole('tab', { name: MESSAGES_TAB }).click();
    const row = page.getByRole('button', { name: DROPS_BUTTON });
    await row.waitFor({ state: 'visible' });
    await row.click();
    await page.waitForURL(/\/drops$/, { timeout: 20_000 });
    await waitForWatch(page);
    await page.getByText('From dealers you follow', { exact: true }).filter({ visible: true }).first().waitFor({ state: 'visible' });
    await page.waitForTimeout(800);
    await shoot(page, files.drops);
    // A new document does not restore the session, so this uses the bundle's push.
    const pushed = await page.evaluate((id) => {
      const requireModule = window.__r;
      if (typeof requireModule !== 'function') return false;
      for (let moduleId = 0; moduleId < 3000; moduleId += 1) {
        let loaded;
        try {
          loaded = requireModule(moduleId);
        } catch {
          continue;
        }
        if (!loaded || typeof loaded.push !== 'function' || typeof loaded.linkTo !== 'function') continue;
        loaded.push(`/drops?dealerId=${id}`);
        return true;
      }
      return false;
    }, dealerId);
    if (!pushed) {
      fail(
        'The dealer drops route did not open.',
        'The tour pushes /drops?dealerId through the running app. A full page load of that URL does not keep the session.',
      );
    }
    await page.waitForURL(new RegExp(`dealerId=${dealerId}`), { timeout: 20_000 });
    await waitForWatch(page);
    await page.waitForTimeout(800);
    await shoot(page, files.deepLink);
    detail = { messages, profile, deepLink: page.url() };
  } catch (error) {
    const failed = path.join(evidence, 'tour-failed.png');
    await shoot(page, failed).catch(() => undefined);
    if (error && error.code === 'GRAHAM_FAIL') throw error;
    fail(
      'The Messages drops tour did not finish.',
      'messages.png is the badge, profile.png has no drops row, drops.png is the feed, and deep-link.png is /drops?dealerId.',
      { url: page.url(), text: (await pageText(page)).slice(0, 800), failed, cause: error instanceof Error ? error.message : String(error) },
    );
  } finally {
    const video = page.video();
    await context.close();
    await browser.close();
    if (video) {
      const recorded = await video.path();
      if (recorded && existsSync(recorded)) renameSync(recorded, files.video);
    }
    rmSync(videoDir, { recursive: true, force: true });
  }
  if (!detail || !existsSync(files.video)) {
    fail('The tour video was not saved.', 'Playwright writes it when the browser context closes. The png files should still be in the evidence directory.');
  }
  ok({
    command: 'tour',
    user: who.email,
    badgeLabel: detail.messages.badgeLabel,
    tabLabel: detail.messages.tabLabel,
    unseen: Number(String(detail.messages.badgeLabel).match(/(\d+)/)?.[1] ?? '0'),
    profile: detail.profile,
    deepLink: detail.deepLink,
    messages: files.messages,
    profileShot: files.profile,
    drops: files.drops,
    deepLinkShot: files.deepLink,
    video: files.video,
  });
}

async function commandDoctor() {
  const dockerOk = spawnSync('docker', ['info'], { encoding: 'utf8' }).status === 0;
  const supabaseOk = spawnSync('supabase', ['--version'], { encoding: 'utf8' }).status === 0;
  const status = localStatus();
  let local = null;
  let apiOk = false;
  if (status?.url && !String(status.url).includes(PRODUCTION_REF)) {
    try {
      assertLocalUrl(status.url, 'doctor');
      local = { url: status.url };
      const probe = await api(status.url, '/rest/v1/dealers?select=id&limit=1', {
        key: status.serviceKey,
      });
      apiOk = probe.ok;
    } catch {
      local = { url: status.url, refused: true };
    }
  }
  const envText = existsSync(FUNCTIONS_ENV) ? readFileSync(FUNCTIONS_ENV, 'utf8') : '';
  const env = parseEnv(envText);
  const webPid = webUp();
  ok({
    command: 'doctor',
    docker: dockerOk,
    supabaseCli: supabaseOk,
    stack: local ? { url: local.url, apiOk, refused: Boolean(local.refused) } : null,
    functions: {
      cronSecretSet: Boolean(env.GRAHAM_CRON_SECRET),
      operatorSecret: env.GRAHAM_OPERATOR_SECRET ? 'set' : 'missing',
      fixtureImport: env.GRAHAM_ALLOW_FIXTURE_IMPORT === '1',
      expoPushUrl: env.EXPO_PUSH_URL ?? null,
      runtimeExpoPushUrl: edgeEnv('EXPO_PUSH_URL'),
    },
    capture: spawnSync('docker', ['inspect', '-f', '{{.State.Running}}', CAPTURE_NAME], { encoding: 'utf8' }).stdout.trim() === 'true',
    web: webPid ? { pid: webPid, url: `http://127.0.0.1:${WEB_PORT}` } : null,
    evidenceDir: evidenceDir(),
    productionRefBlocked: true,
  });
}

function commandCleanup(dryRun) {
  const state = readState();
  const webPid = state.webPid ?? null;
  const webCmd = webPid ? commandLine(webPid) : '';
  const killWeb = Boolean(webPid && webCmd.includes('web-server.mjs'));
  if (dryRun) {
    ok({
      command: 'cleanup',
      dryRun: true,
      wouldStopSupabase: true,
      wouldRemoveCapture: CAPTURE_NAME,
      wouldRemoveCatalog: CATALOG_NAME,
      wouldKillWebPid: killWeb ? webPid : null,
      keepsEvidence: evidenceDir(),
    });
    return;
  }
  if (killWeb) {
    try {
      process.kill(webPid, 'SIGTERM');
    } catch {
    }
  }
  spawnSync('docker', ['rm', '-f', CAPTURE_NAME], { encoding: 'utf8' });
  spawnSync('docker', ['rm', '-f', CATALOG_NAME], { encoding: 'utf8' });
  const stopped = runSupabase(['stop']);
  writeState({ webPid: null });
  ok({
    command: 'cleanup',
    webStopped: killWeb,
    captureRemoved: true,
    supabaseStopExit: stopped.status,
    evidenceDir: evidenceDir(),
  });
}

function child(args) {
  const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 20 * 60 * 1000,
    env: process.env,
  });
  let body = null;
  try {
    body = JSON.parse(result.stdout);
  } catch {
    body = null;
  }
  if (result.status !== 0 || !body?.ok) {
    fail(`\`${args.join(' ')}\` failed.`, 'The child stderr is the command error. Fix that step and rerun verify-drops.', {
      args,
      status: result.status,
      stderr: result.stderr.slice(-4000),
      stdout: result.stdout.slice(-2000),
    });
  }
  return body;
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)]));
  }
  if (typeof value === 'string' && value.split('.').length === 3 && value.startsWith('eyJ')) {
    return '[redacted-jwt]';
  }
  return value;
}

async function commandVerify(dryRun) {
  if (dryRun) {
    ok({
      command: 'verify-drops',
      dryRun: true,
      steps: ['up', 'seed', 'reset-proof', 'follow buyer', 'follow quiet', 'import', 'notify-drops', 'drops-status', 'web', 'tour', 'cleanup'],
    });
    return;
  }
  const evidence = evidenceDir();
  mkdirSync(evidence, { recursive: true });
  const shot = path.join(evidence, 'messages.png');
  const profileShot = path.join(evidence, 'profile.png');
  const dropsShot = path.join(evidence, 'drops.png');
  const deepShot = path.join(evidence, 'deep-link.png');
  const video = path.join(evidence, 'drops-messages.webm');
  const steps = {};
  steps.up = child(['up']);
  steps.seed = child(['seed']);
  steps.reset = child(['reset-proof']);
  steps.followBuyer = child(['follow', 'buyer', 'dealer']);
  steps.followQuiet = child(['follow', 'quiet', 'dealer']);
  steps.imported = child(['import']);
  steps.notify = child(['notify-drops']);
  steps.buyer = child(['drops-status', 'buyer']);
  steps.quiet = child(['drops-status', 'quiet']);
  steps.web = child(['web']);
  steps.tour = child(['tour', steps.followBuyer.dealerId]);

  const notes = steps.buyer.notifications ?? [];
  const captured = steps.notify.captured ?? [];
  const skipped = steps.notify.response?.skipped ?? {};
  const listingId = steps.imported.listings?.[0]?.id;
  const problems = [];
  if (notes.length !== 1) problems.push(`buyer drop_notifications rows: ${notes.length}, expected 1`);
  if (notes[0]?.title !== 'New watches') problems.push(`title: ${notes[0]?.title}`);
  if (notes[0]?.status !== 'sent') problems.push(`status: ${notes[0]?.status}`);
  if (notes[0]?.dealer_id !== steps.followBuyer.dealerId) problems.push('notification dealer_id does not match Test Bench');
  if (!listingId || !notes[0]?.listing_ids?.includes(listingId)) problems.push('notification does not name the imported listing');
  if (captured.length !== 1) problems.push(`captured pushes: ${captured.length}, expected 1`);
  if (captured[0]?.title !== 'New watches') problems.push(`push title: ${captured[0]?.title}`);
  if (captured[0]?.to !== PUSH_TOKEN) problems.push('push token does not match the seeded buyer');
  if (captured[0]?.data?.kind !== 'drop') problems.push('push data.kind is not drop');
  if (captured[0]?.data?.dealerId !== steps.followBuyer.dealerId) problems.push('push deep link dealerId does not match Test Bench');
  if (captured[0]?.data?.dropNotificationId !== notes[0]?.id) problems.push('push dropNotificationId does not match the row');
  if ((skipped.noTokenWithListings ?? 0) < 1) problems.push(`noTokenWithListings: ${skipped.noTokenWithListings}`);
  if ((steps.quiet.notifications ?? []).length !== 0) problems.push('quiet follower has a drop_notifications row');
  if ((steps.buyer.unseen ?? 0) < 1) problems.push(`buyer unseen: ${steps.buyer.unseen}`);
  if ((steps.tour.unseen ?? 0) < 1) problems.push('messages screenshot badge is not greater than 0');
  if (!String(steps.tour.tabLabel ?? '').startsWith('Messages,')) problems.push(`tab label: ${steps.tour.tabLabel}`);
  if (!String(steps.tour.badgeLabel ?? '').startsWith('New from dealers you follow,')) {
    problems.push(`drops row: ${steps.tour.badgeLabel}`);
  }
  if (steps.tour.profile?.following !== 'Test Bench, verified') problems.push('profile following row changed');
  if (!String(steps.tour.deepLink ?? '').includes(`dealerId=${steps.followBuyer.dealerId}`)) {
    problems.push(`deep link: ${steps.tour.deepLink}`);
  }
  const quietCaptured = (steps.quiet.captured ?? []).length;
  if (quietCaptured !== 0) problems.push('quiet follower was included in a captured push');

  const report = {
    ok: problems.length === 0,
    problems,
    skipped,
    buyer: steps.buyer,
    quiet: { notifications: steps.quiet.notifications, unseen: steps.quiet.unseen },
    notify: steps.notify.response,
    captured,
    tour: steps.tour,
  };
  const reportPath = path.join(evidence, 'report.json');
  writeFileSync(reportPath, JSON.stringify(redact(report), null, 2));
  writeFileSync(path.join(evidence, 'notify.json'), JSON.stringify(redact(steps.notify), null, 2));
  if (problems.length) {
    fail('Drops verification failed.', 'See the evidence report. Do not weaken an assertion to make this pass.', {
      problems,
      reportPath,
    });
  }
  const cleaned = child(['cleanup']);
  const proof = [shot, profileShot, dropsShot, deepShot, video, reportPath];
  const missing = proof.filter((file) => !existsSync(file));
  if (missing.length) {
    fail(
      'Cleanup removed the proof.',
      'Evidence must stay in the evidence directory. cleanup should only stop the stack, the web server, and the capture container.',
      { missing },
    );
  }
  ok({
    command: 'verify-drops',
    passed: true,
    evidence,
    messages: shot,
    profile: profileShot,
    drops: dropsShot,
    deepLink: deepShot,
    video,
    report: reportPath,
    unseen: steps.tour.unseen,
    badgeLabel: steps.tour.badgeLabel,
    tabLabel: steps.tour.tabLabel,
    skipped,
    cleanup: cleaned.command,
  });
}

async function commandReset(dryRun) {
  if (dryRun) {
    ok({ command: 'reset-proof', dryRun: true, deletes: ['DROP-1 listings', 'fixture users drop_notifications'] });
    return;
  }
  const status = requireStack();
  const dealerId = await dealerIdOf(status, 'dealer');
  const ids = [];
  for (const name of ['buyer', 'quiet']) {
    const session = await signIn(status, PEOPLE[name]);
    ids.push(session.userId);
  }
  const notes = await api(
    status.url,
    `/rest/v1/drop_notifications?user_id=in.(${ids.join(',')})`,
    { key: status.serviceKey, method: 'DELETE', prefer: 'return=minimal' },
  );
  const listings = await api(
    status.url,
    `/rest/v1/listings?dealer_id=eq.${dealerId}&reference=eq.DROP-1`,
    { key: status.serviceKey, method: 'DELETE', prefer: 'return=minimal' },
  );
  if (!notes.ok || !listings.ok) {
    fail('Could not reset the drops proof.', 'Both deletes use the local service role.', {
      notes: notes.body,
      listings: listings.body,
    });
  }
  mkdirSync(RUN, { recursive: true });
  writeFileSync(PUSHES, '[]\n');
  ok({ command: 'reset-proof', dealerId, users: ids.length });
}

const BOT_SHOP = 'https://bot-proof.graham.test';
const BOT_WATCH = 'https://bot-proof.graham.test/watches/secret-door';
const BOT_PHOTO = 'https://images.squarespace-cdn.com/content/v1/64d53a504f5aee6d2b32ee14/19e5672c-8f2f-4bc3-ac40-a2c141dc78c7/B0004038.jpg?format=1500w';

function operatorCall(status, body, token) {
  return api(status.url, '/functions/v1/operator-bot', {
    key: status.anonKey,
    token,
    method: 'POST',
    body,
  });
}

async function deckHasBotProof(status) {
  const found = await api(status.url, '/rest/v1/rpc/search_listings_v2', {
    key: status.anonKey,
    method: 'POST',
    body: {
      p_spec: {},
      p_limit: 20,
      p_cursor: null,
      p_exclude_swiped: true,
      p_exclude_own: true,
      p_sort: 'newest',
      p_favorites_first: true,
    },
  });
  const rows = Array.isArray(found.body) ? found.body : [];
  const hit = rows.some((row) => row?.listing?.brand === 'Bot Proof' && row?.listing?.model === 'Secret Door');
  return { ok: found.ok, status: found.status, hit };
}

async function ensureWeb() {
  if (webUp()) return null;
  const child = spawnSync(process.execPath, [process.argv[1], 'web'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 15 * 60 * 1000,
  });
  if (child.status !== 0 || !webUp()) {
    return 'The web build is not being served. The web command did not start, so the deck screenshot was skipped.';
  }
  return null;
}

async function commandVerifyOperator(dryRun) {
  if (dryRun) {
    ok({
      command: 'verify-operator',
      dryRun: true,
      calls: ['import fixture', 'report', 'reject anon', 'reject wrong key', 'reject buyer', 'approve', 'search_listings_v2', 'deck'],
    });
    return;
  }
  const status = requireStack();
  const evidence = evidenceDir();
  mkdirSync(evidence, { recursive: true });
  const cleared = await api(
    status.url,
    `/rest/v1/dealers?website=eq.${encodeURIComponent(BOT_SHOP)}`,
    { key: status.serviceKey, method: 'DELETE', prefer: 'return=minimal' },
  );
  if (!cleared.ok) {
    fail('Could not clear a previous Bot Proof shop.', 'The delete uses the local service role so the proof can start pending.', {
      status: cleared.status,
      body: cleared.body,
    });
  }
  const imported = await operatorCall(status, {
    action: 'import',
    sourceUrl: BOT_SHOP,
    dealerName: 'Bot Proof',
    listings: [{
      brand: 'Bot Proof',
      model: 'Secret Door',
      reference: 'BOT-1',
      year: 1968,
      price_cents: 100000,
      description: 'A fixture watch imported with the operator secret.',
      source_url: BOT_WATCH,
      photo_url: BOT_PHOTO,
    }],
  }, OPERATOR_SECRET);
  if (!imported.ok || imported.body?.permission !== 'pending' || !imported.body?.dealerId) {
    fail(
      'The operator secret did not import a pending fixture shop.',
      'Run up so the edge runtime has GRAHAM_OPERATOR_SECRET and GRAHAM_ALLOW_FIXTURE_IMPORT=1. The hosted function refuses fixture import.',
      { status: imported.status, body: imported.body },
    );
  }
  const dealerId = imported.body.dealerId;
  const report = await operatorCall(status, { action: 'report', dealerId }, OPERATOR_SECRET);
  if (!report.ok || report.body?.permission !== 'pending' || report.body?.listings?.active !== 1) {
    fail('The report did not show a pending shop with one active listing.', 'report reads dealers and listings as the service role.', {
      status: report.status,
      body: report.body,
    });
  }
  const again = await operatorCall(status, {
    action: 'import',
    sourceUrl: BOT_SHOP,
    dealerName: 'Bot Proof',
    listings: [{
      brand: 'Bot Proof',
      model: 'Secret Door',
      reference: 'BOT-1',
      year: 1968,
      price_cents: 100000,
      description: 'A fixture watch imported with the operator secret.',
      source_url: BOT_WATCH,
      photo_url: BOT_PHOTO,
    }],
  }, OPERATOR_SECRET);
  const againReport = await operatorCall(status, { action: 'report', dealerId }, OPERATOR_SECRET);
  if (!again.ok || again.body?.published !== 0 || againReport.body?.listings?.active !== 1 || againReport.body?.permission !== 'pending') {
    fail('A second fixture import duplicated the watch or changed permission.', 'The same source_url for that shop is inserted once, and an approved shop would stay approved.', {
      again: again.body,
      report: againReport.body,
    });
  }
  const hidden = await deckHasBotProof(status);
  if (!hidden.ok || hidden.hit) {
    fail('The pending shop was already on the deck.', 'search_listings_v2 only returns approved shops.', hidden);
  }
  const buyer = await signIn(status, PEOPLE.buyer);
  const rejected = [];
  for (const [name, token] of [
    ['anon', status.anonKey],
    ['wrong', 'sb_secret_wrong'],
    ['buyer', buyer.accessToken],
  ]) {
    const attempt = await operatorCall(status, { action: 'approve', dealerId }, token);
    rejected.push({ name, status: attempt.status, error: attempt.body?.error ?? null });
    if (attempt.status !== 401) {
      fail(`The ${name} token was not rejected.`, 'operator-bot returns 401 unless the bearer is GRAHAM_OPERATOR_SECRET.', {
        rejected,
      });
    }
  }
  const still = await api(status.url, `/rest/v1/dealers?id=eq.${dealerId}&select=permission`, {
    key: status.serviceKey,
  });
  if (still.body?.[0]?.permission !== 'pending') {
    fail('A rejected approve changed the shop.', 'Anon, a wrong key, and a buyer token must leave permission pending.', {
      permission: still.body,
    });
  }
  const approved = await operatorCall(status, { action: 'approve', dealerId }, OPERATOR_SECRET);
  if (!approved.ok || approved.body?.permission !== 'approved') {
    fail('The operator secret did not approve the shop.', 'approve calls bot_set_dealer_permission.', {
      status: approved.status,
      body: approved.body,
    });
  }
  const bumped = await api(status.url, `/rest/v1/listings?dealer_id=eq.${dealerId}&reference=eq.BOT-1`, {
    key: status.serviceKey,
    method: 'PATCH',
    prefer: 'return=minimal',
    body: { created_at: new Date().toISOString() },
  });
  if (!bumped.ok) {
    fail('The fixture watch could not be moved to the front of the deck.', 'Buy sorts newest first. The proof sets created_at so the card is the one on screen.', {
      status: bumped.status,
      body: bumped.body,
    });
  }
  const visible = await deckHasBotProof(status);
  if (!visible.ok || !visible.hit) {
    fail('The approved shop is not on the deck.', 'Anon search_listings_v2 uses the guest arguments from src/data/listings.ts and should return brand Bot Proof.', visible);
  }
  const shot = path.join(evidence, 'operator-deck.png');
  const videoPath = path.join(evidence, 'operator-deck.webm');
  const reportFile = path.join(evidence, 'operator-report.json');
  const httpSummary = {
    dealerId,
    imported: { status: imported.status, permission: imported.body.permission, published: imported.body.published },
    report: report.body,
    repeated: { published: again.body?.published, active: againReport.body?.listings?.active, permission: againReport.body?.permission },
    rejected,
    deckBeforeApprove: hidden.hit,
    deckAfterApprove: visible.hit,
    web: { status: 'pending' },
  };
  writeFileSync(reportFile, `${JSON.stringify(httpSummary, null, 2)}\n`);
  const webReason = await ensureWeb();
  if (webReason) {
    const skipped = { ...httpSummary, web: { status: 'skipped', reason: webReason } };
    writeFileSync(reportFile, `${JSON.stringify(skipped, null, 2)}\n`);
    ok({ command: 'verify-operator', ...skipped, reportFile, operatorSecret: 'set' });
    return;
  }
  const videoDir = path.join(evidence, 'operator-video-tmp');
  rmSync(videoDir, { recursive: true, force: true });
  mkdirSync(videoDir, { recursive: true });
  const chromium = await loadChromium();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    recordVideo: { dir: videoDir, size: { width: 390, height: 844 } },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(90_000);
  try {
    await page.goto(`http://127.0.0.1:${WEB_PORT}/`, { waitUntil: 'domcontentloaded' });
    await ensureSignedIn(page, PEOPLE.buyer.email);
    const card = page.getByText('Bot Proof Secret Door', { exact: true }).first();
    await card.waitFor({ state: 'visible', timeout: 30_000 });
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    await shoot(page, shot);
  } catch (error) {
    const failed = path.join(evidence, 'operator-deck-failed.png');
    await shoot(page, failed).catch(() => undefined);
    if (error && error.code === 'GRAHAM_FAIL') throw error;
    fail(
      'The deck did not show the fixture watch.',
      'After approve, Buy shows Bot Proof Secret Door. The sign-in sheet has to close first.',
      { url: page.url(), text: (await pageText(page)).slice(0, 800), failed, cause: error instanceof Error ? error.message : String(error) },
    );
  } finally {
    const video = page.video();
    await context.close();
    await browser.close();
    if (video) {
      const recorded = await video.path();
      if (recorded && existsSync(recorded)) renameSync(recorded, videoPath);
    }
    rmSync(videoDir, { recursive: true, force: true });
  }
  if (!existsSync(shot) || !existsSync(videoPath)) {
    fail('The deck proof files were not saved.', 'operator-deck.png and operator-deck.webm stay in the evidence directory.');
  }
  const summary = {
    ...httpSummary,
    web: { status: 'captured' },
    shot,
    video: videoPath,
  };
  writeFileSync(reportFile, `${JSON.stringify(summary, null, 2)}\n`);
  ok({ command: 'verify-operator', ...summary, reportFile, operatorSecret: 'set' });
}

function startCatalogShop() {
  spawnSync('docker', ['rm', '-f', CATALOG_NAME], { encoding: 'utf8' });
  const started = spawnSync(
    'docker',
    [
      'run',
      '-d',
      '--name',
      CATALOG_NAME,
      '--network',
      networkName(),
      '-v',
      `${SKILL}:/app:ro`,
      'node:22-alpine',
      'node',
      '/app/shop-server.mjs',
    ],
    { encoding: 'utf8' },
  );
  if (started.status !== 0) {
    fail(
      'The catalogue shop container did not start.',
      'Docker must be running. The edge function reads http://graham-catalog-shop:8799/products.json.',
      { detail: `${started.stderr}\n${started.stdout}`.trim() },
    );
  }
}

async function deckHasWatch(status, brand, model) {
  const found = await api(status.url, '/rest/v1/rpc/search_listings_v2', {
    key: status.anonKey,
    method: 'POST',
    body: {
      p_spec: {},
      p_limit: 20,
      p_cursor: null,
      p_exclude_swiped: false,
      p_exclude_own: true,
      p_sort: 'newest',
      p_favorites_first: false,
    },
  });
  const rows = Array.isArray(found.body) ? found.body : [];
  const hit = rows.some((row) => row?.listing?.brand === brand && row?.listing?.model === model);
  return { ok: found.ok, status: found.status, hit };
}

async function commandVerifyOperatorCatalog(dryRun) {
  if (dryRun) {
    ok({
      command: 'verify-operator-catalog',
      dryRun: true,
      calls: ['shopify products.json', 'queue publish', 'publishBatch', 'approve', 'deck'],
    });
    return;
  }
  const status = requireStack();
  if (edgeEnv('OPENAI_BASE_URL') !== OPENAI_BASE_URL || edgeEnv('OPENAI_API_KEY') !== OPENAI_LOCAL_KEY) {
    fail(
      'The edge runtime is not pointed at the local catalogue stand-in.',
      'Run up. OPENAI_BASE_URL is used only when SUPABASE_URL is local. Hosted import still calls api.openai.com.',
    );
  }
  startCatalogShop();
  const evidence = evidenceDir();
  mkdirSync(evidence, { recursive: true });
  let imported = null;
  for (let pass = 0; pass < 8; pass += 1) {
    imported = await operatorCall(status, {
      action: 'import',
      sourceUrl: `${CATALOG_ORIGIN}/`,
      dealerName: 'Catalog Proof',
    }, OPERATOR_SECRET);
    if (!imported.ok || !imported.body?.dealerId) break;
    const pending = imported.body?.publish?.pending ?? 0;
    if (pending === 0 && imported.body?.catalogue === 'reused') break;
  }
  if (!imported.ok || !imported.body?.dealerId) {
    fail(
      'The operator secret did not import the catalogue shop.',
      'import without a listings array syncs the feed, queues for-sale rows, and runs publishBatch. There is no fixture body.',
      { status: imported.status, body: imported.body },
    );
  }
  const dealerId = imported.body.dealerId;
  if (imported.body.permission !== 'pending') {
    const back = await operatorCall(status, { action: 'unapprove', dealerId }, OPERATOR_SECRET);
    if (!back.ok || back.body?.permission !== 'pending') {
      fail('Could not return the catalogue shop to pending before the deck check.', 'unapprove sets pending.', {
        status: back.status,
        body: back.body,
      });
    }
  }
  const listings = await api(status.url, `/rest/v1/listings?dealer_id=eq.${dealerId}&select=id,brand,model,status,imported_by`, {
    key: status.serviceKey,
  });
  const watch = (listings.body ?? []).find((row) => row.brand === 'Catalog Proof' && row.model === 'Live Door');
  if (!listings.ok || !watch || watch.status !== 'active') {
    fail('Import did not write an active listing.', 'publishBatch calls apply_source_item, the same function the console uses.', {
      status: listings.status,
      body: listings.body,
      publish: imported.body.publish,
    });
  }
  const photos = await api(status.url, `/rest/v1/listing_photos?listing_id=eq.${watch.id}&select=source_url,storage_path,position`, {
    key: status.serviceKey,
  });
  const photoRows = Array.isArray(photos.body) ? photos.body : [];
  if (!photos.ok || photoRows.length < 3) {
    fail('The published listing does not have three photographs.', 'The console skips a watch with fewer than three photos. This feed has three.', {
      status: photos.status,
      body: photos.body,
    });
  }
  const hidden = await deckHasWatch(status, 'Catalog Proof', 'Live Door');
  if (!hidden.ok || hidden.hit) {
    fail('The pending catalogue shop was already on the deck.', 'search_listings_v2 only returns approved shops.', hidden);
  }
  const approved = await operatorCall(status, { action: 'approve', dealerId }, OPERATOR_SECRET);
  if (!approved.ok || approved.body?.permission !== 'approved') {
    fail('The operator secret did not approve the catalogue shop.', 'approve calls bot_set_dealer_permission.', {
      status: approved.status,
      body: approved.body,
    });
  }
  const bumped = await api(status.url, `/rest/v1/listings?id=eq.${watch.id}`, {
    key: status.serviceKey,
    method: 'PATCH',
    prefer: 'return=minimal',
    body: { created_at: new Date().toISOString() },
  });
  if (!bumped.ok) {
    fail('The catalogue watch could not be moved to the front of the deck.', 'Buy sorts newest first.', {
      status: bumped.status,
      body: bumped.body,
    });
  }
  const visible = await deckHasWatch(status, 'Catalog Proof', 'Live Door');
  if (!visible.ok || !visible.hit) {
    fail('The approved catalogue shop is not on the deck.', 'search_listings_v2 as the anon key should return Catalog Proof Live Door.', visible);
  }
  await ensureWeb();
  const shot = path.join(evidence, 'catalog-deck.png');
  const videoPath = path.join(evidence, 'catalog-deck.webm');
  const videoDir = path.join(evidence, 'catalog-video-tmp');
  rmSync(videoDir, { recursive: true, force: true });
  mkdirSync(videoDir, { recursive: true });
  const chromium = await loadChromium();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    recordVideo: { dir: videoDir, size: { width: 390, height: 844 } },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(90_000);
  try {
    await page.goto(`http://127.0.0.1:${WEB_PORT}/`, { waitUntil: 'domcontentloaded' });
    await ensureSignedIn(page, PEOPLE.buyer.email);
    const card = page.getByText('Catalog Proof Live Door', { exact: true }).first();
    await card.waitFor({ state: 'visible', timeout: 30_000 });
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    await shoot(page, shot);
  } catch (error) {
    const failed = path.join(evidence, 'catalog-deck-failed.png');
    await shoot(page, failed).catch(() => undefined);
    if (error && error.code === 'GRAHAM_FAIL') throw error;
    fail(
      'The deck did not show the catalogue watch.',
      'After approve, Buy shows Catalog Proof Live Door.',
      { url: page.url(), text: (await pageText(page)).slice(0, 800), failed, cause: error instanceof Error ? error.message : String(error) },
    );
  } finally {
    const video = page.video();
    await context.close();
    await browser.close();
    if (video) {
      const recorded = await video.path();
      if (recorded && existsSync(recorded)) renameSync(recorded, videoPath);
    }
    rmSync(videoDir, { recursive: true, force: true });
  }
  const reportFile = path.join(evidence, 'catalog-report.json');
  const summary = {
    dealerId,
    imported: {
      status: imported.status,
      permission: imported.body.permission,
      provider: imported.body.provider,
      publish: imported.body.publish,
    },
    listingId: watch.id,
    photos: photoRows.length,
    deckBeforeApprove: hidden.hit,
    deckAfterApprove: visible.hit,
    shot,
    video: videoPath,
  };
  writeFileSync(reportFile, `${JSON.stringify(summary, null, 2)}\n`);
  ok({ command: 'verify-operator-catalog', ...summary, reportFile });
}

function flag(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return { args, value: null };
  const value = args[index + 1];
  if (!value || value.startsWith('--')) fail(`${name} needs a value.`, 'Pass it immediately after the flag.');
  return { args: args.filter((_, item) => item !== index && item !== index + 1), value };
}

const raw = process.argv.slice(2);
const dryRun = raw.includes('--dry-run');
const withoutDry = raw.filter((arg) => arg !== '--dry-run');
const asFlag = flag(withoutDry, '--as');
const [command, ...rest] = asFlag.args;

const RESUME_SITE = 'https://resume-proof.graham.test';
const RESUME_SOURCE = `${RESUME_SITE}/collections/watches`;
const RESUME_COUNT = 240;

async function listingCounts(status) {
  const dealers = await api(status.url, '/rest/v1/dealers?select=id,name,website', {
    key: status.serviceKey,
  });
  if (!dealers.ok) return null;
  const counts = {};
  for (const dealer of dealers.body ?? []) {
    const rows = await api(
      status.url,
      `/rest/v1/listings?dealer_id=eq.${dealer.id}&select=id`,
      { key: status.serviceKey },
    );
    counts[dealer.website] = { name: dealer.name, listings: rows.body?.length ?? -1 };
  }
  return counts;
}

async function commandVerifyPublishResume(dryRun) {
  if (dryRun) {
    ok({
      command: 'verify-publish-resume',
      dryRun: true,
      queued: RESUME_COUNT,
      batch: 2,
      repairs: 'a listing stamped applied with no photographs',
    });
    return;
  }
  const status = requireStack();
  if (edgeEnv('GRAHAM_OPERATOR_SECRET') !== OPERATOR_SECRET) {
    fail(
      'The edge runtime has no local operator secret.',
      'Run up before verify-publish-resume.',
    );
  }
  startCatalogShop();
  const before = await listingCounts(status);
  const dealer = await api(status.url, '/rest/v1/dealers', {
    key: status.serviceKey,
    method: 'POST',
    prefer: 'return=representation',
    body: {
      name: 'Resume Proof',
      website: RESUME_SITE,
      permission: 'pending',
    },
  });
  const dealerId = dealer.body?.[0]?.id;
  if (!dealer.ok || !dealerId) {
    fail('Could not create the resume shop.', 'The insert uses the local service role.', { detail: dealer.body });
  }
  const job = await api(status.url, '/rest/v1/import_jobs', {
    key: status.serviceKey,
    method: 'POST',
    prefer: 'return=minimal',
    body: {
      dealer_id: dealerId,
      source_url: RESUME_SOURCE,
      provider: 'shopify',
      status: 'succeeded',
      finished_at: new Date().toISOString(),
      listings_created: 0,
    },
  });
  if (!job.ok) {
    fail('Could not record a fresh catalogue read.', 'A succeeded import_jobs row is what skips the site.', { detail: job.body });
  }

  const photo = (n) => `${CATALOG_ORIGIN}/photos/${n}.jpg`;
  const broken = await api(status.url, '/rest/v1/listings', {
    key: status.serviceKey,
    method: 'POST',
    prefer: 'return=representation',
    body: {
      dealer_id: dealerId,
      brand: 'Resume',
      model: 'Interrupted',
      price_cents: 120000,
      status: 'active',
    },
  });
  const brokenId = broken.body?.[0]?.id;
  if (!brokenId) fail('Could not store the interrupted listing.', 'It is inserted with the service role and no photographs.', { detail: broken.body });

  const rows = [{
    dealer_id: dealerId,
    provider: 'shopify',
    external_id: 'interrupted',
    source_url: `${RESUME_SITE}/products/interrupted`,
    raw: {
      externalId: 'interrupted',
      sourceUrl: `${RESUME_SITE}/products/interrupted`,
      title: 'Resume Interrupted',
      text: 'A 1968 proof watch whose gallery was never copied.',
      priceCents: 120000,
      currency: 'USD',
      available: true,
      photoUrls: [photo(1), photo(2), photo(3)],
    },
    text_hash: 'interrupted-text',
    content_hash: 'interrupted-content',
    extracted_hash: 'interrupted-text',
    applied_hash: 'interrupted-content',
    photos_hash: null,
    listing_id: brokenId,
    publish: true,
    available: true,
    extracted: {
      brand: 'Resume',
      model: 'Interrupted',
      priceCents: 120000,
      currency: 'USD',
      year: 1968,
    },
    first_seen_at: '2020-01-01T00:00:00.000Z',
  }];
  for (let i = 0; i < RESUME_COUNT; i += 1) {
    const id = `resume-${String(i).padStart(4, '0')}`;
    rows.push({
      dealer_id: dealerId,
      provider: 'shopify',
      external_id: id,
      source_url: `${RESUME_SITE}/products/${id}`,
      raw: {
        externalId: id,
        sourceUrl: `${RESUME_SITE}/products/${id}`,
        title: `Resume ${i}`,
        text: 'A 1968 proof watch.',
        priceCents: 100000 + i,
        currency: 'USD',
        available: true,
        photoUrls: [photo(1), photo(2), photo(3)],
      },
      text_hash: `text-${id}`,
      content_hash: `content-${id}`,
      extracted_hash: null,
      applied_hash: null,
      photos_hash: null,
      listing_id: null,
      publish: true,
      available: true,
      extracted: null,
      first_seen_at: new Date(Date.UTC(2021, 0, 1) + i * 1000).toISOString(),
    });
  }
  for (let i = 0; i < rows.length; i += 40) {
    const inserted = await api(status.url, '/rest/v1/source_items', {
      key: status.serviceKey,
      method: 'POST',
      prefer: 'return=minimal',
      body: rows.slice(i, i + 40),
    });
    if (!inserted.ok) {
      fail('Could not queue the catalogue.', 'source_items are inserted with the service role.', { detail: inserted.body });
    }
  }

  const calls = [];
  let pending = null;
  for (let n = 0; n < 200; n += 1) {
    const started = Date.now();
    const response = await operatorCall(status, { action: 'import', sourceUrl: RESUME_SOURCE }, OPERATOR_SECRET);
    const body = response.body ?? {};
    const publish = body.publish ?? {};
    calls.push({
      status: response.status,
      catalogue: body.catalogue ?? null,
      processed: publish.processed ?? null,
      pending: publish.pending ?? null,
      failed: publish.failed ?? null,
      ms: Date.now() - started,
    });
    if (!response.ok) break;
    pending = publish.pending;
    if (pending === 0 && body.catalogue === 'reused') break;
  }

  const photos = await api(
    status.url,
    `/rest/v1/listing_photos?listing_id=eq.${brokenId}&select=position`,
    { key: status.serviceKey },
  );
  const repaired = await api(
    status.url,
    `/rest/v1/source_items?listing_id=eq.${brokenId}&select=applied_hash,photos_hash`,
    { key: status.serviceKey },
  );
  const queued = await api(status.url, '/rest/v1/rpc/pending_source_item_count', {
    key: status.serviceKey,
    method: 'POST',
    body: { p_dealer_id: dealerId },
  });
  const after = await listingCounts(status);

  const gate = await api(status.url, '/rest/v1/dealers', {
    key: status.serviceKey,
    method: 'POST',
    prefer: 'return=representation',
    body: { name: 'Gallery Gate', website: 'https://gallery-gate.graham.test', permission: 'approved' },
  });
  const gateId = gate.body?.[0]?.id;
  const thin = await api(status.url, '/rest/v1/listings', {
    key: status.serviceKey,
    method: 'POST',
    prefer: 'return=representation',
    body: { dealer_id: gateId, brand: 'Gate', model: 'Thin', price_cents: 100, status: 'active' },
  });
  const thick = await api(status.url, '/rest/v1/listings', {
    key: status.serviceKey,
    method: 'POST',
    prefer: 'return=representation',
    body: { dealer_id: gateId, brand: 'Gate', model: 'Ready', price_cents: 100, status: 'active' },
  });
  const thinId = thin.body?.[0]?.id;
  const thickId = thick.body?.[0]?.id;
  if (thinId) {
    await api(status.url, '/rest/v1/listing_photos', {
      key: status.serviceKey,
      method: 'POST',
      prefer: 'return=minimal',
      body: { listing_id: thinId, position: 0, source_url: photo(1) },
    });
  }
  if (thickId) {
    await api(status.url, '/rest/v1/listing_photos', {
      key: status.serviceKey,
      method: 'POST',
      prefer: 'return=minimal',
      body: [0, 1, 2].map((position) => ({ listing_id: thickId, position, source_url: photo(position + 1) })),
    });
  }
  const anonThin = await api(status.url, `/rest/v1/listings?id=eq.${thinId}&select=id`, { key: status.anonKey });
  const anonThick = await api(status.url, `/rest/v1/listings?id=eq.${thickId}&select=id`, { key: status.anonKey });

  const untouched = Object.keys(before ?? {}).every((website) => {
    if (website === RESUME_SITE || website === 'https://gallery-gate.graham.test') return true;
    return before[website].listings === after?.[website]?.listings;
  });
  const publishCalls = calls.filter((call) => call.catalogue === 'reused');
  const bounded = publishCalls.every((call) => call.processed <= 2 && call.status === 200);
  const repairedPhotos = photos.body?.length ?? 0;
  const stamp = repaired.body?.[0];
  const queueRow = Array.isArray(queued.body) ? queued.body[0] : queued.body;
  const queuePending = typeof queueRow === 'number' ? queueRow : queueRow?.pending;
  const report = {
    command: 'verify-publish-resume',
    dealerId,
    queued: RESUME_COUNT + 1,
    calls: calls.length,
    catalogueReads: calls.filter((call) => call.catalogue === 'read').length,
    maxProcessed: Math.max(0, ...publishCalls.map((call) => call.processed ?? 0)),
    pending,
    queueCount: queuePending,
    repairedPhotos,
    appliedHash: stamp?.applied_hash ?? null,
    photosHash: stamp?.photos_hash ?? null,
    thinVisible: (anonThin.body?.length ?? 0) > 0,
    readyVisible: (anonThick.body?.length ?? 0) === 1,
    untouched,
    bounded,
    errors: calls.filter((call) => call.status !== 200).slice(0, 3),
  };
  const evidence = evidenceDir();
  mkdirSync(evidence, { recursive: true });
  writeFileSync(path.join(evidence, 'publish-resume.json'), JSON.stringify({ ...report, calls }, null, 2));
  const passed = pending === 0
    && bounded
    && repairedPhotos >= 3
    && stamp?.applied_hash
    && stamp?.photos_hash
    && report.thinVisible === false
    && report.readyVisible === true
    && untouched
    && queuePending === 0;
  if (!passed) {
    fail(
      'The resumable publish proof did not hold.',
      'A killed gallery stays queued, each call publishes at most two watches, and a shop with fewer than three photographs stays off the deck.',
      { detail: report },
    );
  }
  ok(report);
}

async function clearBuyerTaste(status) {
  const session = await signIn(status, PEOPLE.buyer);
  const events = await api(
    status.url,
    `/rest/v1/buyer_events?user_id=eq.${session.userId}&kind=in.(save,pass,dealer_click,undo,unsave)&select=listing_id,dealer_id,kind&order=occurred_at.asc,id.asc`,
    { key: status.serviceKey },
  );
  const rows = Array.isArray(events.body) ? events.body : [];
  const stacks = new Map();
  const dealers = new Map();
  for (const row of rows) {
    if (row.dealer_id) dealers.set(row.listing_id, row.dealer_id);
    const stack = stacks.get(row.listing_id) ?? [];
    if (row.kind === 'undo') stack.pop();
    else if (row.kind === 'unsave') {
      const index = stack.lastIndexOf('save');
      if (index >= 0) stack.splice(index, 1);
    } else stack.push(row.kind);
    stacks.set(row.listing_id, stack);
  }
  const payload = [];
  for (const [listingId, stack] of stacks) {
    for (let count = 0; count < stack.length; count += 1) {
      payload.push({
        id: crypto.randomUUID(),
        kind: 'undo',
        surface: 'buy',
        occurred_at: new Date().toISOString(),
        listing_id: listingId,
        dealer_id: dealers.get(listingId),
      });
    }
  }
  if (payload.length === 0) return 0;
  const logged = await api(status.url, '/rest/v1/rpc/log_buyer_events', {
    key: status.anonKey,
    token: session.accessToken,
    method: 'POST',
    body: { p_events: payload },
  });
  if (!logged.ok) {
    fail('The buyer could not clear an earlier taste.', 'Undo events pop the actions the ranker still counts.', {
      status: logged.status,
      detail: logged.body,
    });
  }
  return payload.length;
}

async function scrollGridToNextPage(page) {
  const next = page.waitForResponse((response) => {
    if (!response.url().includes('/rest/v1/rpc/rank_buy_feed')) return false;
    if (response.request().method() !== 'POST') return false;
    let payload = null;
    try {
      payload = response.request().postDataJSON();
    } catch {
      return false;
    }
    return typeof payload?.p_cursor === 'string' && payload.p_cursor.length > 0 && response.ok();
  }, { timeout: 25_000 });
  await page.getByRole('button', { name: 'Grid', exact: true }).click();
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    await page.mouse.wheel(0, 1600);
    await page.evaluate(() => {
      for (const node of document.querySelectorAll('div')) {
        if (node.scrollHeight > node.clientHeight + 40) node.scrollTop = node.scrollHeight;
      }
    });
    const hit = await Promise.race([
      next.then((response) => response),
      page.waitForTimeout(500).then(() => null),
    ]);
    if (hit) {
      const rows = await hit.json();
      if (!Array.isArray(rows) || rows.length === 0) {
        fail('The next Buy page was empty.', 'Scrolling the grid asks rank_buy_feed for the cursor of the first page.');
      }
      return { rows: rows.length, cursor: true };
    }
  }
  const response = await next;
  const rows = await response.json();
  return { rows: Array.isArray(rows) ? rows.length : 0, cursor: true };
}

async function topDeckCard(page) {
  const card = page.locator('[data-testid^="deck-card-"][aria-label]').first();
  await card.waitFor({ state: 'visible', timeout: 20_000 });
  const testId = await card.getAttribute('data-testid');
  const label = await card.getAttribute('aria-label');
  return { id: testId?.replace(/^deck-card-/, '') ?? null, label };
}

async function listingBrand(status, id) {
  const row = await api(
    status.url,
    `/rest/v1/listings?id=eq.${id}&select=brand,brand_key`,
    { key: status.anonKey },
  );
  return row.body?.[0] ?? null;
}

async function signInBuyerOnPage(page, email) {
  const emailDoor = page.getByRole('button', { name: 'Continue with email' });
  if (!(await emailDoor.isVisible().catch(() => false))) {
    await page.goto(`http://127.0.0.1:${WEB_PORT}/sign-in`, { waitUntil: 'domcontentloaded' });
  }
  await emailDoor.waitFor({ state: 'visible', timeout: 20_000 });
  await emailDoor.click();
  await page.getByPlaceholder('you@example.com').fill(email);
  const since = Date.now();
  await page.getByRole('button', { name: 'Send me a code' }).click();
  const code = await mailpitCode(email, since);
  if (!code) {
    fail('Mailpit did not receive a sign-in code.', 'Run up, then seed, then verify-rank again.');
  }
  await page.getByLabel('Sign-in code').fill(code);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForFunction(
    () =>
      Object.keys(localStorage).some((key) => {
        const value = localStorage.getItem(key) ?? '';
        return key.includes('auth-token') && value.includes('access_token');
      }),
    { timeout: 20_000 },
  );
  await page.goto(`http://127.0.0.1:${WEB_PORT}/`, { waitUntil: 'domcontentloaded' });
  await page.getByText(/\d+ watches available/).first().waitFor({ state: 'visible', timeout: 20_000 });
}

async function commandVerifyRank(dryRun) {
  if (dryRun) {
    ok({
      command: 'verify-rank',
      dryRun: true,
      writes: ['guest-taste.png', 'guest-feed.png', 'guest-page.png', 'ranked-feed.png', 'followed-feed.png', 'buyer-page.png', 'rank-buy.webm'],
    });
    return;
  }
  if (!webUp()) {
    fail('The web build is not being served.', 'Run the web command first. verify-rank does not start a second server.');
  }
  const status = requireStack();
  const evidence = evidenceDir();
  mkdirSync(evidence, { recursive: true });
  const files = {
    taste: path.join(evidence, 'guest-taste.png'),
    guest: path.join(evidence, 'guest-feed.png'),
    ranked: path.join(evidence, 'ranked-feed.png'),
    followed: path.join(evidence, 'followed-feed.png'),
    guestPage: path.join(evidence, 'guest-page.png'),
    buyerPage: path.join(evidence, 'buyer-page.png'),
    video: path.join(evidence, 'rank-buy.webm'),
    report: path.join(evidence, 'rank-report.json'),
  };
  const videoDir = path.join(evidence, 'rank-video-tmp');
  rmSync(videoDir, { recursive: true, force: true });
  mkdirSync(videoDir, { recursive: true });
  const chromium = await loadChromium();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    recordVideo: { dir: videoDir, size: { width: 390, height: 844 } },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(90_000);
  page.on('popup', (popup) => {
    void popup.close().catch(() => undefined);
  });

  let report = null;
  try {
    const cleared = await clearBuyerTaste(status);
    await page.goto(`http://127.0.0.1:${WEB_PORT}/`, { waitUntil: 'domcontentloaded' });
    const heading = page.getByText('What should we show you first?', { exact: true });
    await heading.waitFor({ state: 'visible', timeout: 20_000 });
    await shoot(page, files.taste);

    await page.getByRole('checkbox', { name: 'Rolex' }).click();
    await page.getByRole('button', { name: 'See watches', exact: true }).click();
    const close = page.getByRole('button', { name: 'Close', exact: true });
    await close.waitFor({ state: 'visible', timeout: 20_000 });
    await close.click();
    await page.getByText(/\d+ watches available/).first().waitFor({ state: 'visible', timeout: 20_000 });
    const guestTop = await topDeckCard(page);
    const guestBrand = await listingBrand(status, guestTop.id);
    await shoot(page, files.guest);
    await page.waitForTimeout(1000);
    const guestPage = await scrollGridToNextPage(page);
    await shoot(page, files.guestPage);
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: 'One at a time', exact: true }).click();
    await topDeckCard(page);
    await page.waitForTimeout(600);
    if (guestBrand?.brand_key !== 'rolex') {
      fail(
        'The guest deck did not lead with the Rolex pick.',
        'See watches stores the pick and the deck refetches. The top card should be a Rolex.',
        { label: guestTop.label, brand: guestBrand },
      );
    }

    await signInBuyerOnPage(page, PEOPLE.buyer.email);
    let clickedCard = await topDeckCard(page);
    let clickedBrand = await listingBrand(status, clickedCard.id);
    for (let pass = 0; pass < 4 && clickedBrand?.brand_key === 'rolex'; pass += 1) {
      const before = clickedCard.id;
      await page.keyboard.press('ArrowLeft');
      await page.waitForFunction(
        (previous) => {
          const card = document.querySelector('[data-testid^="deck-card-"][aria-label]');
          return card && card.getAttribute('data-testid') !== previous;
        },
        `deck-card-${before}`,
        { timeout: 20_000 },
      );
      clickedCard = await topDeckCard(page);
      clickedBrand = await listingBrand(status, clickedCard.id);
    }
    if (!clickedBrand || clickedBrand.brand_key === 'rolex') {
      fail(
        'The deck stayed on Rolex after the passes.',
        'Passing the Rolex pick should reveal the next brand. That card is the one the proof clicks.',
        { label: clickedCard.label, brand: clickedBrand },
      );
    }
    const logged = page.waitForResponse(
      (response) => response.url().includes('log_buyer_events') && response.request().method() === 'POST',
      { timeout: 20_000 },
    );
    const [loggedResponse] = await Promise.all([
      logged,
      page
        .locator(`[data-testid="deck-card-${clickedCard.id}"]`)
        .getByRole('link', { name: 'View on dealer site' })
        .click(),
    ]);
    if (!loggedResponse.ok()) {
      fail('The dealer click was not logged.', 'Save, pass, and dealer click flush immediately so a reload sees them.', {
        status: loggedResponse.status(),
      });
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByText(/\d+ watches available/).first().waitFor({ state: 'visible', timeout: 20_000 });
    const rankedTop = await topDeckCard(page);
    const rankedBrand = await listingBrand(status, rankedTop.id);
    await shoot(page, files.ranked);
    if (rankedBrand?.brand_key !== clickedBrand.brand_key) {
      fail(
        'The clicked brand did not lead the deck after reload.',
        'A dealer click outweighs the Rolex pick. Reload refetches the ranked page.',
        { clicked: clickedBrand, top: rankedBrand, label: rankedTop.label },
      );
    }

    const session = await signIn(status, PEOPLE.buyer);
    const dealerId = await dealerIdOf(status, 'dealer');
    const followed = await api(status.url, '/rest/v1/dealer_follows', {
      key: status.anonKey,
      token: session.accessToken,
      method: 'POST',
      prefer: 'resolution=ignore-duplicates,return=minimal',
      body: { user_id: session.userId, dealer_id: dealerId },
    });
    if (!followed.ok && followed.status !== 409) {
      fail('The buyer could not follow Test Bench.', 'Run seed so the shop and the buyer exist.', {
        status: followed.status,
        detail: followed.body,
      });
    }
    const dealerSession = await signIn(status, PEOPLE.dealer);
    const imported = await api(status.url, '/functions/v1/import-listings', {
      key: status.anonKey,
      token: dealerSession.accessToken,
      method: 'POST',
      body: {
        action: 'fixture',
        dealerId,
        listings: [JSON.parse(readFileSync(FIXTURE, 'utf8'))],
      },
    });
    if (!imported.ok) {
      fail('Fixture import failed.', 'The local import-listings function must allow action fixture.', {
        status: imported.status,
        detail: imported.body,
      });
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByText(/\d+ watches available/).first().waitFor({ state: 'visible', timeout: 20_000 });
    const followedTop = await topDeckCard(page);
    const followedBrand = await listingBrand(status, followedTop.id);
    await shoot(page, files.followed);
    await page.waitForTimeout(1000);
    const buyerPage = await scrollGridToNextPage(page);
    await shoot(page, files.buyerPage);
    await page.waitForTimeout(1000);
    if (followedBrand?.brand_key !== 'fixture' || !String(followedTop.label).startsWith('Fixture')) {
      fail(
        'The followed shop did not lead the deck.',
        'The fixture watch has three photos. A follow outweighs one click, so Fixture Drop is first after reload.',
        { label: followedTop.label, brand: followedBrand, import: imported.body },
      );
    }

    report = {
      command: 'verify-rank',
      guest: { label: guestTop.label, brand: guestBrand.brand },
      clicked: { label: clickedCard.label, brand: clickedBrand.brand },
      ranked: { label: rankedTop.label, brand: rankedBrand.brand },
      followed: { label: followedTop.label, brand: followedBrand.brand, dealerId },
      guestPage,
      buyerPage,
      cleared,
    };
    writeFileSync(files.report, JSON.stringify(report, null, 2));
  } catch (error) {
    const failed = path.join(evidence, 'rank-failed.png');
    await shoot(page, failed).catch(() => undefined);
    fail(
      error instanceof Error ? error.message : String(error),
      'The rank proof drives the guest sheet, a dealer click, and a followed shop. The failed screenshot is rank-failed.png.',
      { url: page.url(), text: (await pageText(page)).slice(0, 800), failed },
    );
  } finally {
    const video = page.video();
    await context.close();
    await browser.close();
    if (video) {
      const recorded = await video.path();
      if (recorded && existsSync(recorded)) renameSync(recorded, files.video);
    }
    rmSync(videoDir, { recursive: true, force: true });
  }
  if (!report || !existsSync(files.video)) {
    fail('The rank video was not saved.', 'Playwright writes it when the context closes. The png files stay in the evidence directory.');
  }
  ok({ ...report, files });
}

const commands = {
  doctor: () => commandDoctor(),
  up: () => commandUp(dryRun),
  seed: () => commandSeed(dryRun),
  'sign-in': () => commandSignIn(rest[0], dryRun),
  follow: () => commandFollow(rest[0], rest[1], dryRun),
  import: () => commandImport(dryRun),
  'notify-drops': () => commandNotify(dryRun),
  'drops-status': () => commandDropsStatus(rest[0]),
  web: () => commandWeb(dryRun),
  screenshot: () => commandScreenshot(rest[0], rest[1], asFlag.value),
  tour: () => commandTour(rest[0], dryRun),
  cleanup: () => commandCleanup(dryRun),
  'reset-proof': () => commandReset(dryRun),
  'verify-drops': () => commandVerify(dryRun),
  'verify-operator': () => commandVerifyOperator(dryRun),
  'verify-operator-catalog': () => commandVerifyOperatorCatalog(dryRun),
  'verify-publish-resume': () => commandVerifyPublishResume(dryRun),
  'verify-rank': () => commandVerifyRank(dryRun),
};

const run = commands[command];
if (!run) {
  fail(
    `Unknown command "${command ?? ''}".`,
    'Commands: doctor, up, seed, sign-in <user>, follow <user> <dealer>, import, notify-drops, drops-status <user>, web, screenshot <route> <path> --as <user>, tour <dealerId>, reset-proof, verify-drops, verify-operator, verify-operator-catalog, verify-publish-resume, verify-rank, cleanup. Add --dry-run on up, seed, sign-in, follow, import, notify-drops, web, tour, cleanup, reset-proof, verify-drops, verify-operator, verify-operator-catalog, verify-publish-resume, verify-rank.',
  );
}

Promise.resolve(run()).catch((error) => {
  fail(error instanceof Error ? error.message : String(error), 'The stack trace is in detail.', {
    detail: error instanceof Error ? error.stack : null,
  });
});
