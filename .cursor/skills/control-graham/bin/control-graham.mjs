#!/usr/bin/env node
/**
 * Agent control surface for Graham verification.
 *
 * `up` starts an owned Expo web Metro plus a keeper process that holds one
 * Playwright page and speaks JSON-lines over a Unix socket. Every drive
 * command is forwarded to that keeper so demo in-memory swipe state survives
 * across commands. `cleanup` stops only what this run started; artifacts stay.
 *
 *   node .cursor/skills/control-graham/bin/control-graham.mjs <command> [args]
 */
import { spawn, execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  openSync,
  closeSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { createRequire } from 'node:module';
import net from 'node:net';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(__dirname, '..');
const REPO_ROOT = resolve(SKILL_ROOT, '../../..');
const RUNS_DIR = join(SKILL_ROOT, '.runs');
const ARTIFACTS_DIR = join(SKILL_ROOT, 'artifacts');
const ACTIVE_PATH = join(RUNS_DIR, 'active.json');

const FIXTURE_ALIASES = {
  ada: 'ada@graham.test',
  bea: 'bea@graham.test',
  dealer: 'dealer@graham.test',
  desk: 'dealer@graham.test',
  gold: 'gold@graham.test',
  goldfinger: 'gold@graham.test',
};

const require = createRequire(join(SKILL_ROOT, 'package.json'));

function die(message, code = 1) {
  console.error(`control-graham: ${message}`);
  process.exit(code);
}

function usage() {
  console.log(`control-graham — agent control surface for Graham

Environment
  up [--mode demo|local] [--port N] [--headed]   Start Metro+web + browser keeper. Default: demo.
  doctor                                         Read-only health check for the active run.
  info                                           Print active run metadata.
  seed                                           Local only: db:reset + mock:users.
  signin <alias|email>                           Fixture sign-in code helper.
  cleanup                                        Stop Metro/keeper this run started. Keeps artifacts.

Inspection
  snapshot [--path file]                         Accessibility tree of the page.
  screenshot [--path file]                       PNG of the page.
  console                                        Browser console messages.
  network-summary                                Request counts by status class / type.

Navigation
  home                                           Go to /.
  goto <path>                                    Go to a route path.

Interaction
  press <key>                                    Keyboard (ArrowLeft / ArrowRight / s / …).
  click --name <accessible name>                 Click by accessible name.
  aria-click --role <role> --name <name>         Click by role + name.
  type --name <name> --text <text>               Type into a field (appends).
  fill --name <name> --value <text>              Clear and fill a field.
  eval <js>                                      page.evaluate; print JSON.
  wait-settle [--ms N]                           Network idle-ish + calm.

Never drive an instance you did not start with \`up\`.`);
}

function ensureDirs() {
  mkdirSync(RUNS_DIR, { recursive: true });
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

function readActive() {
  if (!existsSync(ACTIVE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(ACTIVE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function writeActive(state) {
  ensureDirs();
  writeFileSync(ACTIVE_PATH, JSON.stringify(state, null, 2) + '\n');
  mkdirSync(join(RUNS_DIR, state.id), { recursive: true });
  writeFileSync(join(RUNS_DIR, state.id, 'state.json'), JSON.stringify(state, null, 2) + '\n');
}

function clearActive() {
  if (existsSync(ACTIVE_PATH)) rmSync(ACTIVE_PATH);
}

function artifactPath(state, name) {
  const dir = join(ARTIFACTS_DIR, state.id);
  mkdirSync(dir, { recursive: true });
  return join(dir, name);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') {
      out._.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) out[key] = true;
      else {
        out[key] = next;
        i++;
      }
    } else out._.push(a);
  }
  return out;
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
    server.on('error', reject);
  });
}

function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForHttp(url, { timeoutMs = 180_000 } = {}) {
  const start = Date.now();
  let lastErr = '';
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { redirect: 'manual' });
      if (res.status < 500) return;
      lastErr = `status ${res.status}`;
    } catch (err) {
      lastErr = err.message;
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${url} (${lastErr})`);
}

function localStackUp() {
  try {
    execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

function chromePath() {
  for (const candidate of [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ]) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return null;
}

function askKeeper(state, payload, { timeoutMs = 60_000 } = {}) {
  return new Promise((resolveAsk, reject) => {
    const socketPath = state.socketPath;
    if (!socketPath || !existsSync(socketPath)) {
      reject(new Error('Keeper socket missing. Re-run `up`.'));
      return;
    }
    const client = net.createConnection(socketPath);
    let buf = '';
    const timer = setTimeout(() => {
      client.destroy();
      reject(new Error(`Keeper timed out after ${timeoutMs}ms for ${payload.op}`));
    }, timeoutMs);
    client.on('connect', () => client.write(JSON.stringify(payload) + '\n'));
    client.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      const nl = buf.indexOf('\n');
      if (nl === -1) return;
      clearTimeout(timer);
      const line = buf.slice(0, nl);
      try {
        resolveAsk(JSON.parse(line));
      } catch (err) {
        reject(err);
      }
      client.end();
    });
    client.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function cmdUp(args) {
  ensureDirs();
  const existing = readActive();
  if (existing && pidAlive(existing.metroPid)) {
    die(`Active run ${existing.id} still owns port ${existing.port}. cleanup first.`);
  }
  if (existing?.socketPath && existsSync(existing.socketPath)) {
    try {
      rmSync(existing.socketPath);
    } catch {
      /* */
    }
  }

  const mode = args.mode === 'local' ? 'local' : 'demo';
  if (mode === 'local' && !localStackUp()) {
    die('mode=local needs Colima + `npm run db:start`. Use --mode demo without Docker.');
  }

  const port = Number(args.port) || (await freePort());
  const id = `run-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}-${port}`;
  const runDir = join(RUNS_DIR, id);
  mkdirSync(runDir, { recursive: true });
  mkdirSync(join(ARTIFACTS_DIR, id), { recursive: true });

  if (mode === 'local') {
    execFileSync('npm', ['run', 'env', '--', 'local'], { cwd: REPO_ROOT, stdio: 'inherit' });
  }

  const metroLog = join(runDir, 'metro.log');
  writeFileSync(metroLog, '');
  const env = {
    ...process.env,
    EXPO_PUBLIC_DEMO: mode === 'demo' ? '1' : '0',
    CI: '1',
    BROWSER: 'none',
  };
  const metroFd = openSync(metroLog, 'a');
  const metro = spawn('npx', ['expo', 'start', '--web', '--port', String(port)], {
    cwd: REPO_ROOT,
    env,
    stdio: ['ignore', metroFd, metroFd],
    detached: true,
  });
  metro.unref();
  try {
    closeSync(metroFd);
  } catch {
    /* */
  }

  const url = `http://127.0.0.1:${port}`;
  try {
    await waitForHttp(url);
  } catch (err) {
    try {
      process.kill(-metro.pid, 'SIGTERM');
    } catch {
      /* */
    }
    die(`Metro did not become ready: ${err.message}. See ${metroLog}`);
  }

  // Wait until the web bundle has been produced at least once.
  const bundleStart = Date.now();
  while (Date.now() - bundleStart < 120_000) {
    const log = readFileSync(metroLog, 'utf8');
    if (/Web Bundled|Bundled \d+ms/i.test(log)) break;
    await sleep(500);
  }

  // macOS sun_path is 104 bytes. The run directory already exceeds that, so a
  // socket there is truncated on bind and the client cannot find it.
  const socketPath = join(tmpdir(), `graham-keeper-${port}.sock`);
  const headed = Boolean(args.headed);
  const executablePath = chromePath();
  const keeperPath = join(runDir, 'keeper.mjs');
  writeFileSync(
    keeperPath,
    `import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { writeFileSync, appendFileSync, existsSync, unlinkSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
const require = createRequire(${JSON.stringify(join(SKILL_ROOT, 'package.json'))});
const { chromium } = require('playwright');

const url = ${JSON.stringify(url)};
const socketPath = ${JSON.stringify(socketPath)};
const readyPath = ${JSON.stringify(join(runDir, 'browser.ready'))};
const consolePath = ${JSON.stringify(join(runDir, 'console.log'))};
const networkPath = ${JSON.stringify(join(runDir, 'network.ndjson'))};
const headed = ${JSON.stringify(headed)};
const executablePath = ${JSON.stringify(executablePath)};

if (existsSync(socketPath)) unlinkSync(socketPath);

const browser = await chromium.launch({
  headless: !headed,
  executablePath: executablePath || undefined,
  channel: executablePath ? undefined : 'chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.on('console', (msg) => appendFileSync(consolePath, \`[\${msg.type()}] \${msg.text()}\\n\`));
page.on('requestfinished', async (req) => {
  try {
    const res = await req.response();
    appendFileSync(networkPath, JSON.stringify({
      t: Date.now(), method: req.method(), url: req.url(),
      status: res?.status() ?? 0, resourceType: req.resourceType(),
    }) + '\\n');
  } catch {}
});

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
// Expo web paints a shell, then hydrates the RN tree after the bundle fetch.
for (let i = 0; i < 60; i++) {
  const text = await page.locator('body').innerText().catch(() => '');
  if (/Buy|Wishlist|Omega|Rolex|Speedmaster|GRAHAM|Log in/i.test(text)) break;
  await sleep(1000);
}
writeFileSync(readyPath, 'ok\\n');

async function handle(msg) {
  const op = msg.op;
  if (op === 'doctor') {
    const title = await page.title();
    const body = await page.locator('body').innerText().catch(() => '');
    const looksLikeGraham = /Buy|Wishlist|Omega|Rolex|Speedmaster|GRAHAM|Log in|Vintage/i.test(body);
    return { ok: true, title, url: page.url(), bodySample: body.slice(0, 400), looksLikeGraham };
  }
  if (op === 'home') {
    await page.goto(url + '/', { waitUntil: 'domcontentloaded' });
    await sleep(800);
    return { ok: true, url: page.url() };
  }
  if (op === 'goto') {
    const path = msg.path || '/';
    const target = path.startsWith('http') ? path : url.replace(/\\/$/, '') + (path.startsWith('/') ? path : '/' + path);
    await page.goto(target, { waitUntil: 'domcontentloaded' });
    await sleep(800);
    return { ok: true, url: page.url() };
  }
  if (op === 'press') {
    await page.keyboard.press(msg.key);
    await sleep(400);
    return { ok: true, key: msg.key };
  }
  if (op === 'click') {
    const name = msg.name;
    const loc = page.getByRole('button', { name: new RegExp(name, 'i') })
      .or(page.getByRole('tab', { name: new RegExp(name, 'i') }))
      .or(page.getByRole('link', { name: new RegExp(name, 'i') }))
      .or(page.getByLabel(new RegExp(name, 'i')));
    await loc.first().click({ timeout: 15000 });
    await sleep(400);
    return { ok: true, name };
  }
  if (op === 'aria-click') {
    await page.getByRole(msg.role, { name: new RegExp(msg.name, 'i') }).first().click({ timeout: 15000 });
    await sleep(400);
    return { ok: true, role: msg.role, name: msg.name };
  }
  if (op === 'type' || op === 'fill') {
    const nameRe = new RegExp(msg.name, 'i');
    // The Buy door is a button with the same name as the search field. getByLabel
    // hits that hidden button first, and fill cannot type into it.
    const textbox = page.getByRole('textbox', { name: nameRe });
    const loc = (await textbox.count()) > 0 ? textbox : page.getByLabel(nameRe);
    if (op === 'type') {
      await loc.first().click({ timeout: 15000 });
      await page.keyboard.type(String(msg.text), { delay: 20 });
      return { ok: true, name: msg.name, text: msg.text };
    }
    await loc.first().fill(String(msg.value), { timeout: 15000 });
    return { ok: true, name: msg.name, value: msg.value };
  }
  if (op === 'eval') {
    const result = await page.evaluate((e) => eval(e), msg.expr);
    return { ok: true, result };
  }
  if (op === 'wait-settle') {
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await sleep(msg.ms || 1500);
    return { ok: true, waitedMs: msg.ms || 1500 };
  }
  if (op === 'snapshot') {
    const snapshot = await page.locator('body').ariaSnapshot();
    writeFileSync(msg.path, snapshot + '\\n');
    return { ok: true, path: msg.path, bytes: snapshot.length };
  }
  if (op === 'screenshot') {
    await page.screenshot({ path: msg.path, fullPage: false });
    return { ok: true, path: msg.path };
  }
  if (op === 'shutdown') {
    setTimeout(async () => { try { await browser.close(); } catch {} process.exit(0); }, 50);
    return { ok: true, shuttingDown: true };
  }
  return { ok: false, error: 'unknown op ' + op };
}

const server = createServer((socket) => {
  let buf = '';
  socket.on('data', async (chunk) => {
    buf += chunk.toString('utf8');
    const nl = buf.indexOf('\\n');
    if (nl === -1) return;
    const line = buf.slice(0, nl);
    buf = buf.slice(nl + 1);
    let msg;
    try { msg = JSON.parse(line); } catch (err) {
      socket.write(JSON.stringify({ ok: false, error: String(err) }) + '\\n');
      return;
    }
    try {
      const result = await handle(msg);
      socket.write(JSON.stringify(result) + '\\n');
    } catch (err) {
      socket.write(JSON.stringify({ ok: false, error: err.message, stack: err.stack }) + '\\n');
    }
  });
});
server.listen(socketPath);
process.on('SIGTERM', async () => { try { await browser.close(); } catch {} process.exit(0); });
process.on('SIGINT', async () => { try { await browser.close(); } catch {} process.exit(0); });
`,
  );

  const errFd = openSync(join(runDir, 'keeper.err.log'), 'a');
  const keeper = spawn(process.execPath, [keeperPath], {
    cwd: REPO_ROOT,
    detached: true,
    stdio: ['ignore', 'ignore', errFd],
  });
  keeper.unref();
  try {
    closeSync(errFd);
  } catch {
    /* */
  }

  const readyFile = join(runDir, 'browser.ready');
  const keepStart = Date.now();
  while (!existsSync(readyFile) && Date.now() - keepStart < 180_000) {
    await sleep(500);
  }
  if (!existsSync(readyFile)) {
    const errLog = existsSync(join(runDir, 'keeper.err.log'))
      ? readFileSync(join(runDir, 'keeper.err.log'), 'utf8')
      : '';
    try {
      process.kill(-metro.pid, 'SIGTERM');
    } catch {
      /* */
    }
    try {
      process.kill(keeper.pid, 'SIGTERM');
    } catch {
      /* */
    }
    die(`Browser keeper failed to become ready.\n${errLog}\nSee ${runDir}`);
  }

  const state = {
    id,
    mode,
    port,
    url,
    metroPid: metro.pid,
    metroLog,
    keeperPid: keeper.pid,
    socketPath,
    headed,
    startedAt: new Date().toISOString(),
    repo: REPO_ROOT,
  };
  writeActive(state);
  console.log(
    JSON.stringify(
      {
        ok: true,
        id: state.id,
        mode: state.mode,
        url: state.url,
        metroPid: state.metroPid,
        keeperPid: state.keeperPid,
        artifacts: join(ARTIFACTS_DIR, state.id),
      },
      null,
      2,
    ),
  );
}

async function cmdDoctor() {
  const state = readActive();
  if (!state) die('No active run.');
  const metroOk = pidAlive(state.metroPid);
  const keeperOk = pidAlive(state.keeperPid);
  let httpOk = false;
  let httpStatus = null;
  try {
    const res = await fetch(state.url, { redirect: 'manual' });
    httpStatus = res.status;
    httpOk = res.status < 500;
  } catch (err) {
    httpStatus = err.message;
  }
  let page = null;
  try {
    page = await askKeeper(state, { op: 'doctor' });
  } catch (err) {
    page = { ok: false, error: err.message };
  }
  const report = {
    id: state.id,
    mode: state.mode,
    url: state.url,
    metroAlive: metroOk,
    keeperAlive: keeperOk,
    httpOk,
    httpStatus,
    pageOk: Boolean(page?.ok),
    title: page?.title ?? null,
    looksLikeGraham: page?.looksLikeGraham === true,
    bodySample: page?.bodySample ?? page?.error ?? null,
    ownedByThisRun: metroOk && keeperOk,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!metroOk || !keeperOk || !httpOk || !report.pageOk || !report.looksLikeGraham) process.exit(2);
}

function cmdInfo() {
  const state = readActive();
  if (!state) die('No active run.');
  console.log(
    JSON.stringify(
      {
        ...state,
        metroAlive: pidAlive(state.metroPid),
        keeperAlive: pidAlive(state.keeperPid),
        artifacts: join(ARTIFACTS_DIR, state.id),
      },
      null,
      2,
    ),
  );
}

function cmdSeed() {
  const state = readActive();
  const mode = state?.mode ?? 'local';
  if (mode === 'demo') {
    die('seed is a no-op in demo (fixtures in src/lib/demo.ts). Use --mode local.');
  }
  if (!localStackUp()) die('Local Supabase is not running.');
  execFileSync('npm', ['run', 'db:reset'], { cwd: REPO_ROOT, stdio: 'inherit' });
  execFileSync('npm', ['run', 'mock:users'], { cwd: REPO_ROOT, stdio: 'inherit' });
  console.log(
    JSON.stringify(
      {
        ok: true,
        seeded: true,
        fixtures: ['ada', 'bea', 'dealer', 'gold'],
        note: 'Local codes auto-fill from Mailpit; or use signin <alias>.',
      },
      null,
      2,
    ),
  );
}

function cmdSignin(args) {
  const raw = args._[0];
  if (!raw) die('Usage: signin <ada|bea|dealer|gold|email>');
  const email = raw.includes('@') ? raw : FIXTURE_ALIASES[raw.toLowerCase()];
  if (!email?.endsWith('@graham.test')) die('Only @graham.test fixture aliases/addresses.');
  try {
    const out = execFileSync('npm', ['run', 'mock:signin', '--', email], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    console.log(out);
  } catch (err) {
    console.error(err.stderr?.toString?.() || err.message);
    process.exit(1);
  }
}

async function cmdCleanup() {
  const state = readActive();
  if (!state) {
    console.log(JSON.stringify({ ok: true, cleaned: false, reason: 'no active run' }));
    return;
  }
  try {
    await askKeeper(state, { op: 'shutdown' }, { timeoutMs: 5_000 });
  } catch {
    /* */
  }
  for (const pid of [state.keeperPid, state.metroPid]) {
    if (pidAlive(pid)) {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        /* */
      }
    }
  }
  if (state.metroPid) {
    try {
      process.kill(-state.metroPid, 'SIGTERM');
    } catch {
      /* */
    }
  }
  await sleep(800);
  for (const pid of [state.keeperPid, state.metroPid]) {
    if (pidAlive(pid)) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        /* */
      }
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        /* */
      }
    }
  }
  if (state.socketPath && existsSync(state.socketPath)) {
    try {
      rmSync(state.socketPath);
    } catch {
      /* */
    }
  }
  clearActive();
  console.log(
    JSON.stringify(
      {
        ok: true,
        cleaned: true,
        id: state.id,
        artifactsKept: join(ARTIFACTS_DIR, state.id),
      },
      null,
      2,
    ),
  );
}

async function forward(op, fields = {}) {
  const state = readActive();
  if (!state) die('No active run. Start with `up`.');
  if (!pidAlive(state.keeperPid)) die('Keeper is dead. cleanup, then up.');
  const result = await askKeeper(state, { op, ...fields });
  if (!result.ok) die(result.error || JSON.stringify(result));
  console.log(JSON.stringify(result, null, 2));
  return result;
}

async function cmdSnapshot(args) {
  const state = readActive();
  if (!state) die('No active run.');
  const path = args.path || artifactPath(state, 'snapshot.aria.yml');
  await forward('snapshot', { path });
}

async function cmdScreenshot(args) {
  const state = readActive();
  if (!state) die('No active run.');
  const path = args.path || artifactPath(state, 'screenshot.png');
  await forward('screenshot', { path });
}

function cmdConsole() {
  const state = readActive();
  if (!state) die('No active run.');
  const log = join(RUNS_DIR, state.id, 'console.log');
  if (!existsSync(log)) return;
  process.stdout.write(readFileSync(log, 'utf8'));
}

function cmdNetworkSummary() {
  const state = readActive();
  if (!state) die('No active run.');
  const file = join(RUNS_DIR, state.id, 'network.ndjson');
  if (!existsSync(file)) {
    console.log(JSON.stringify({ total: 0, byStatus: {}, byType: {} }, null, 2));
    return;
  }
  const byStatus = {};
  const byType = {};
  let total = 0;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    total++;
    const row = JSON.parse(line);
    const bucket =
      row.status >= 500 ? '5xx' : row.status >= 400 ? '4xx' : row.status >= 300 ? '3xx' : '2xx';
    byStatus[bucket] = (byStatus[bucket] || 0) + 1;
    byType[row.resourceType] = (byType[row.resourceType] || 0) + 1;
  }
  console.log(JSON.stringify({ total, byStatus, byType }, null, 2));
}

const COMMANDS = {
  up: cmdUp,
  doctor: cmdDoctor,
  info: async () => cmdInfo(),
  seed: async () => cmdSeed(),
  signin: async (a) => cmdSignin(a),
  cleanup: cmdCleanup,
  snapshot: cmdSnapshot,
  screenshot: cmdScreenshot,
  home: async () => forward('home'),
  goto: async (a) => forward('goto', { path: a._[0] }),
  press: async (a) => {
    if (!a._[0]) die('Usage: press <key>');
    return forward('press', { key: a._[0] });
  },
  click: async (a) => {
    if (!a.name) die('Usage: click --name <name>');
    return forward('click', { name: a.name });
  },
  'aria-click': async (a) => {
    if (!a.role || !a.name) die('Usage: aria-click --role <role> --name <name>');
    return forward('aria-click', { role: a.role, name: a.name });
  },
  type: async (a) => {
    const text = a.text ?? a._[0];
    if (!a.name || text == null) die('Usage: type --name <field> --text <text>');
    return forward('type', { name: a.name, text });
  },
  fill: async (a) => {
    const value = a.value ?? a.text ?? a._[0];
    if (!a.name || value == null) die('Usage: fill --name <field> --value <text>');
    return forward('fill', { name: a.name, value });
  },
  eval: async (a) => {
    const expr = a._.join(' ');
    if (!expr) die('Usage: eval <js>');
    return forward('eval', { expr });
  },
  'wait-settle': async (a) => forward('wait-settle', { ms: Number(a.ms) || 1500 }),
  console: async () => cmdConsole(),
  'network-summary': async () => cmdNetworkSummary(),
  help: async () => usage(),
  '--help': async () => usage(),
};

const argv = process.argv.slice(2);
const command = argv[0] || 'help';
const args = parseArgs(argv.slice(1));
if (!COMMANDS[command]) {
  usage();
  die(`Unknown command: ${command}`);
}
COMMANDS[command](args).catch((err) => die(err.stack || err.message));
