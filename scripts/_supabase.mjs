/**
 * Shared plumbing for the operator scripts.
 *
 * Which project they talk to is decided in this order:
 *
 * 1. SUPABASE_URL / SUPABASE_ANON_KEY exported in the shell.
 * 2. The repo switch (`npm run env`): `.env.local` present → the running local
 *    stack; absent → the hosted trio in scripts/.env.operator.local.
 *    GRAHAM_TARGET=local|hosted overrides the file for one command.
 */

import { createHash } from 'node:crypto';

import { OPERATOR_HOSTED, isLocalUrl, localStatus, parseEnvFile, target } from './_env.mjs';

let cached;

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

  if (target() === 'local') {
    const status = localStatus();
    if (!status) {
      throw new Error(
        'The repo is switched to local but the stack is not running. `npm run db:start`, or `npm run env -- hosted`.'
      );
    }
    cached = { url: status.url, anonKey: status.anonKey, serviceKey: status.serviceKey, isLocal: true };
    return cached;
  }

  const hosted = parseEnvFile(OPERATOR_HOSTED);
  if (!hosted.SUPABASE_URL || !hosted.SUPABASE_ANON_KEY) {
    throw new Error(
      `The repo is switched to hosted but ${OPERATOR_HOSTED} is missing SUPABASE_URL or SUPABASE_ANON_KEY. Copy scripts/.env.operator.example there, or \`npm run env -- local\`.`
    );
  }
  cached = {
    url: hosted.SUPABASE_URL,
    anonKey: hosted.SUPABASE_ANON_KEY,
    serviceKey: hosted.SUPABASE_SERVICE_ROLE_KEY,
    // "Local" is a property of the address, not of which file named it.
    isLocal: isLocalUrl(hosted.SUPABASE_URL),
  };
  return cached;
}

/**
 * A one-line answer to "which project is about to change?".
 *
 * With the repo switched to hosted, every operator command writes to
 * production. The bare URL was not enough — a project ref reads as noise above
 * a list of shops, and the word missing from it was the one that matters.
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
 * has not had a migration applied — usually hosted, while the one holding the
 * migration is local. Say which is which.
 */
const SCHEMA_CACHE_MISS = new Set(['PGRST202', 'PGRST205']);

function whichProject() {
  const { url, isLocal } = config();

  if (isLocal) {
    return `  ${url} has not had that migration applied. Run: npm run db:reset`;
  }

  return [
    `  ${url} has not had that migration applied.`,
    '  For the local stack instead: npm run env -- local',
  ].join('\n');
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
