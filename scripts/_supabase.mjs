/**
 * Shared plumbing for the operator scripts.
 *
 * Reads SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY from the
 * environment when they are set, so the same scripts point at a hosted project.
 * Otherwise it falls back to whatever `supabase start` is running locally.
 */

import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';

let cached;

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
      isLocal: false,
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
    isLocal: true,
  };
  return cached;
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
  return { status: response.status, ok: response.ok, body: parsed };
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
