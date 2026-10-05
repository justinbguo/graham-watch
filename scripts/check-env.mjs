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
import { APP_ENV, APP_LOCAL, LOCAL_HOSTS, localStatus, parseEnvFile } from './_env.mjs';

// Expo's precedence for the files this repo uses: .env.local wins over .env.
const ENV_FILES = [APP_ENV, APP_LOCAL];

function resolveEnv() {
  return ENV_FILES.reduce((merged, file) => ({ ...merged, ...parseEnvFile(file) }), {});
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
    'Run `npm run env -- local` after `npm run db:start`, or put the hosted pair in .env.',
  ]);
}

let host;
try {
  host = new URL(url).hostname;
} catch {
  fail([`EXPO_PUBLIC_SUPABASE_URL is not a URL: ${url}`]);
}

// Which backend the app is about to talk to, before Metro's output buries it.
// Nothing on screen distinguishes a local deck from a hosted one, and an empty
// deck looks the same either way — so the answer belongs here, on every start.
function announce(where) {
  console.log(`  app → ${where}`);
}

if (!LOCAL_HOSTS.has(host)) {
  announce(`hosted · ${host}`);
  process.exit(0);
}

const status = localStatus();
if (!status) {
  fail([
    `The app points at the local stack (${url}) but it is not running.`,
    'Start it with `npm run db:start`, or `npm run env -- hosted`.',
  ]);
}

if (!status.anonKeys.includes(key)) {
  fail([
    `EXPO_PUBLIC_SUPABASE_URL points at the local stack (${url}),`,
    'but EXPO_PUBLIC_SUPABASE_ANON_KEY belongs to a different project.',
    '',
    `  key in use:  ${key.slice(0, 28)}...`,
    `  local key:   ${status.anonKey.slice(0, 28)}...`,
    '',
    'The local stack accepts the wrong key instead of rejecting it, so this',
    'shows up as an app with no data rather than an auth error.',
    '',
    'Fix: `npm run env -- local` rewrites .env.local from the running stack.',
  ]);
}

announce('local');
