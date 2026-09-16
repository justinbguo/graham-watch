#!/usr/bin/env node
/**
 * Refuses to start the app with a local Supabase URL beside a key from some
 * other project.
 *
 * The pairing cannot be checked by inspecting the key alone: a hosted and a
 * local publishable key are both `sb_publishable_<random>`, so the only way to
 * know is to ask the running stack what its keys are. The local stack accepts a
 * foreign publishable key today — REST and GoTrue both answer 200 — so the
 * symptom is not an auth error, it is an app that looks empty and healthy.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '10.0.2.2']);

// Expo's precedence for the files this repo uses: .env.local wins over .env.
const ENV_FILES = ['.env', '.env.local'];

function parseEnvFile(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return {};
  }
  const values = {};
  for (const line of raw.split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
  return values;
}

function resolveEnv() {
  return ENV_FILES.reduce((merged, file) => ({ ...merged, ...parseEnvFile(file) }), {});
}

function parseStatus(raw) {
  const values = {};
  for (const line of raw.split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)="?([^"]*)"?$/);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

function fail(lines) {
  console.error(`\n  Environment check failed.\n\n${lines.map((l) => `  ${l}`).join('\n')}\n`);
  process.exit(1);
}

if (process.env.EXPO_PUBLIC_DEMO === '1') process.exit(0);

const env = resolveEnv();
const url = env.EXPO_PUBLIC_SUPABASE_URL;
const key = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  fail([
    'EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY is missing.',
    'Copy .env.example to .env and fill it in, or run `npm run demo`.',
  ]);
}

let host;
try {
  host = new URL(url).hostname;
} catch {
  fail([`EXPO_PUBLIC_SUPABASE_URL is not a URL: ${url}`]);
}

if (!LOCAL_HOSTS.has(host)) process.exit(0);

let status;
try {
  status = parseStatus(
    execFileSync('supabase', ['status', '-o', 'env'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  );
} catch {
  fail([
    `The app points at the local stack (${url}) but it is not running.`,
    'Start it with `npm run db:start`, or delete .env.local to use hosted.',
  ]);
}

const localKeys = [status.ANON_KEY, status.PUBLISHABLE_KEY].filter(Boolean);
if (!localKeys.includes(key)) {
  fail([
    `EXPO_PUBLIC_SUPABASE_URL points at the local stack (${url}),`,
    'but EXPO_PUBLIC_SUPABASE_ANON_KEY belongs to a different project.',
    '',
    `  key in use:  ${key.slice(0, 28)}...`,
    `  local key:   ${(status.PUBLISHABLE_KEY ?? '').slice(0, 28)}...`,
    '',
    'The local stack accepts the wrong key instead of rejecting it, so this',
    'shows up as an app with no data rather than an auth error.',
    '',
    'Fix: put both lines in .env.local, from `supabase status -o env`.',
  ]);
}
