/**
 * Which Graham: the one switch every surface reads.
 *
 * The app, the operator scripts, and the operator UI each hold their own env
 * file, and three files that can disagree is how the simulator shows a local
 * deck while `npm run dealers` writes to production. So one fact decides for
 * all of them: `.env.local` at the repo root exists → local; absent → hosted.
 * `npm run env` moves the switch and rewrites the other files to match.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

export const APP_ENV = '.env';
export const APP_LOCAL = '.env.local';
export const OPERATOR_HOSTED = 'scripts/.env.operator.local';
export const OPERATOR_UI_ENV = 'operator/.env.local';

export const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '10.0.2.2']);

export function parseEnvFile(path) {
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

export function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function isLocalUrl(url) {
  return LOCAL_HOSTS.has(hostOf(url));
}

/**
 * `local` or `hosted`. GRAHAM_TARGET overrides the file so one command can
 * cross over — `npm run snapshot` reads hosted while the app stays local.
 */
export function target() {
  const forced = process.env.GRAHAM_TARGET;
  if (forced === 'local' || forced === 'hosted') return forced;
  if (forced) throw new Error(`GRAHAM_TARGET must be local or hosted, not "${forced}".`);
  return existsSync(APP_LOCAL) ? 'local' : 'hosted';
}

/** Keys from the running local stack, or null when `supabase start` is not up. */
export function localStatus() {
  let output;
  try {
    output = execFileSync('supabase', ['status', '-o', 'env'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
  const values = {};
  for (const line of output.split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)="?([^"]*)"?$/);
    if (match) values[match[1]] = match[2];
  }
  if (!values.API_URL) return null;
  return {
    url: values.API_URL,
    // Newer CLIs print PUBLISHABLE_KEY beside the legacy ANON_KEY; both work.
    anonKey: values.PUBLISHABLE_KEY ?? values.ANON_KEY,
    anonKeys: [values.ANON_KEY, values.PUBLISHABLE_KEY].filter(Boolean),
    serviceKey: values.SERVICE_ROLE_KEY,
    dbUrl: values.DB_URL,
  };
}
