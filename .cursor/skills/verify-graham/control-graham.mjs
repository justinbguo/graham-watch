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
const CAPTURE_NAME = 'graham-push-capture';
const CAPTURE_URL = `http://${CAPTURE_NAME}:8799/push`;
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
    GRAHAM_ALLOW_FIXTURE_IMPORT: '1',
    EXPO_PUSH_URL: CAPTURE_URL,
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
      GRAHAM_CRON_SECRET: 'set locally, not printed',
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
  const envMatches = running && edgeEnv('EXPO_PUSH_URL') === CAPTURE_URL && edgeEnv('GRAHAM_ALLOW_FIXTURE_IMPORT') === '1';
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

async function ensureSignedIn(page, email) {
  const gate = page.getByRole('button', { name: 'Log in or create an account' });
  const buy = page.getByRole('tab', { name: 'Buy' });
  try {
    await Promise.race([
      gate.waitFor({ state: 'visible', timeout: 30_000 }),
      buy.waitFor({ state: 'visible', timeout: 30_000 }),
    ]);
  } catch (error) {
    fail(
      'The web export did not show sign-in or the tab bar.',
      'The page should offer Log in or create an account, or the Buy tab when a session is already stored.',
      { url: page.url(), text: (await pageText(page)).slice(0, 800), cause: error instanceof Error ? error.message : String(error) },
    );
  }
  if (!(await gate.isVisible().catch(() => false))) return;

  await gate.click();
  await page.getByRole('button', { name: 'Continue with email' }).click();
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
  try {
    await page.goto(target, { waitUntil: 'domcontentloaded' });
    await ensureSignedIn(page, who.email);
    const pathOnly = route.split('?')[0];
    let detail = {};
    if (pathOnly === '/messages') detail = await openMessages(page);
    else if (pathOnly === '/profile') detail = await openProfile(page);
    else if (pathOnly === '/drops') {
      await page.goto(target, { waitUntil: 'domcontentloaded' });
      await waitForWatch(page);
      detail = { url: page.url() };
    } else {
      await page.goto(target, { waitUntil: 'domcontentloaded' });
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
};

const run = commands[command];
if (!run) {
  fail(
    `Unknown command "${command ?? ''}".`,
    'Commands: doctor, up, seed, sign-in <user>, follow <user> <dealer>, import, notify-drops, drops-status <user>, web, screenshot <route> <path> --as <user>, tour <dealerId>, reset-proof, verify-drops, cleanup. Add --dry-run on up, seed, follow, import, notify-drops, web, tour, cleanup, reset-proof, verify-drops.',
  );
}

Promise.resolve(run()).catch((error) => {
  fail(error instanceof Error ? error.message : String(error), 'The stack trace is in detail.', {
    detail: error instanceof Error ? error.stack : null,
  });
});
