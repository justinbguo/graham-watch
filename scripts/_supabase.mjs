/**
 * Shared plumbing for the operator scripts.
 *
 * Reads SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY from the
 * environment when they are set, so the same scripts point at a hosted project.
 * Otherwise it falls back to whatever `supabase start` is running locally.
 */

import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { relative } from 'node:path';

let cached;

// The same test the operator UI makes (operator/src/supabase.ts). "Local" is a
// property of the address, not of how the address was found: seed.sql documents
// exporting SUPABASE_URL to aim these scripts at the local stack, and reading
// that as production would label it wrong and gate it for nothing.
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

function isLocalUrl(url) {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

function localStatus() {
  const output = execSync('supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return Object.fromEntries(
    output
      .split('\n')
      .filter((line) => line.includes('='))
      .map((line) => {
        const [key, ...rest] = line.split('=');
        return [key.trim(), rest.join('=').trim().replace(/^"|"$/g, '')];
      })
  );
}

export function config() {
  if (cached) return cached;

  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    cached = {
      url: process.env.SUPABASE_URL,
      anonKey: process.env.SUPABASE_ANON_KEY,
      serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      isLocal: isLocalUrl(process.env.SUPABASE_URL),
    };
    return cached;
  }

  let status;
  try {
    status = localStatus();
  } catch {
    throw new Error(
      'No Supabase found. Run `npm run db:start`, or set SUPABASE_URL and SUPABASE_ANON_KEY to target a hosted project.'
    );
  }

  cached = {
    url: status.API_URL,
    anonKey: status.ANON_KEY,
    serviceKey: status.SERVICE_ROLE_KEY,
    isLocal: isLocalUrl(status.API_URL),
  };
  return cached;
}

/**
 * A one-line answer to "which project is about to change?".
 *
 * `npm run dealers` loads scripts/.env.operator.local, which holds hosted keys,
 * so every operator command writes to production unless it is overridden. The
 * bare URL was not enough — a project ref reads as noise above a list of shops,
 * and the word missing from it was the one that matters.
 */
export function describeTarget() {
  const { url, isLocal } = config();
  if (isLocal) return 'local';

  try {
    return `PRODUCTION · ${new URL(url).hostname}`;
  } catch {
    // This line only ever labels somebody else's output; never let it throw.
    return `PRODUCTION · ${url}`;
  }
}

export async function request(path, { token, method = 'GET', body, prefer } = {}) {
  const { url, anonKey } = config();
  const response = await fetch(`${url}${path}`, {
    method,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token ?? anonKey}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (response.status === 404 && SCHEMA_CACHE_MISS.has(parsed?.code)) {
    parsed.message = `${parsed.message}\n${whichProject()}`;
  }

  return { status: response.status, ok: response.ok, body: parsed };
}

/**
 * PostgREST reports an absent table or function as a 404 against its schema
 * cache, which reads like a broken script. It almost always means this project
 * has not had a migration applied — and since `npm run dealers` loads
 * scripts/.env.operator.local, the project being asked is usually hosted while
 * the one holding the migration is local. Say which is which.
 */
const SCHEMA_CACHE_MISS = new Set(['PGRST202', 'PGRST205']);

function whichProject() {
  const { url, isLocal } = config();

  if (isLocal) {
    return `  ${url} has not had that migration applied. Run: npm run db:reset`;
  }

  const line = `  ${url} has not had that migration applied.`;

  // `node -e` and the REPL have no entry script. This runs while reporting
  // somebody else's error, so it must never be the thing that throws.
  const entry = process.argv[1];
  if (!entry) return line;

  const within = relative(process.cwd(), entry);
  const script = within.startsWith('..') ? entry : within;
  const args = process.argv.slice(2).join(' ');

  return [line, `  For the local stack instead: node ${script}${args ? ` ${args}` : ''}`].join('\n');
}

export function serviceKey() {
  const { serviceKey } = config();
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for this command.');
  }
  return serviceKey;
}

/**
 * Imports are attributed to a real user, because the edge function runs as one
 * and `listings.imported_by` points at a profile. Locally we create that
 * operator on demand. Hosted projects derive a strong operator password from
 * the service key unless an explicit password is supplied.
 */
export async function signInOperator() {
  const { url, anonKey, isLocal, serviceKey } = config();
  const email = process.env.GRAHAM_OPERATOR_EMAIL ?? 'operator@graham.local';
  const password =
    process.env.GRAHAM_OPERATOR_PASSWORD ??
    (isLocal
      ? 'graham-operator'
      : serviceKey
        ? createHash('sha256').update(serviceKey).digest('hex')
        : '');

  if (!password) {
    throw new Error('GRAHAM_OPERATOR_PASSWORD or SUPABASE_SERVICE_ROLE_KEY is required.');
  }

  const signIn = async () => {
    const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return response.json();
  };

  let session = await signIn();

  if (!session.access_token && serviceKey) {
    await fetch(`${url}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    session = await signIn();
  }

  if (!session.access_token) {
    throw new Error(
      `Could not sign in as ${email}. Set GRAHAM_OPERATOR_EMAIL and GRAHAM_OPERATOR_PASSWORD.`
    );
  }

  return { token: session.access_token, id: session.user.id, email };
}
