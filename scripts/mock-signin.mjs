#!/usr/bin/env node
/**
 * Print a one-time sign-in code for a fixture @graham.test user on hosted.
 * Local sign-in still auto-reads Mailpit; this is for production Supabase.
 *
 *   npm run mock:signin -- gold@graham.test
 */
import { config, describeTarget, serviceKey } from './_supabase.mjs';

const FIXTURE_ALIASES = {
  ada: 'ada@graham.test',
  bea: 'bea@graham.test',
  dealer: 'dealer@graham.test',
  desk: 'dealer@graham.test',
  gold: 'gold@graham.test',
  goldfinger: 'gold@graham.test',
};

function resolveEmail(raw) {
  const token = raw?.trim().toLowerCase();
  if (!token) return null;
  if (token.includes('@')) return token;
  return FIXTURE_ALIASES[token] ?? null;
}

const email = resolveEmail(process.argv[2]);
if (!email) {
  console.error(
    '\n  Usage: npm run mock:signin -- <email>\n' +
      '         npm run mock:signin -- gold\n' +
      '\n' +
      '  Put `--` before the address so npm passes it to the script.\n' +
      '  Short names: ada, bea, dealer, gold\n'
  );
  process.exit(1);
}
if (!email.endsWith('@graham.test')) {
  console.error('\n  Only @graham.test fixture addresses are allowed.\n');
  process.exit(1);
}

const URL = config().url;
const SERVICE = serviceKey();

const adminHeaders = {
  apikey: SERVICE,
  Authorization: `Bearer ${SERVICE}`,
  'Content-Type': 'application/json',
};

async function admin(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${URL}${path}`, {
    method,
    headers: adminHeaders,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed };
}

const link = await admin('/auth/v1/admin/generate_link', {
  method: 'POST',
  body: { type: 'magiclink', email },
});

if (link.status >= 400) {
  console.error(
    `\n  Could not generate a sign-in link for ${email} on ${describeTarget()}.\n` +
      `  Run npm run mock:users -- --yes first.\n\n` +
      `  ${link.status} ${JSON.stringify(link.body)}\n`
  );
  process.exit(1);
}

const otp =
  link.body?.email_otp ??
  link.body?.properties?.email_otp ??
  link.body?.otp ??
  null;

console.log(`\n  ${describeTarget()}\n`);
console.log(`  ${email}\n`);
if (otp) {
  console.log(`  Enter this code in the app: ${otp}\n`);
} else {
  console.log('  This stack did not return email_otp. Open the magic link instead:\n');
  console.log(`  ${link.body?.action_link ?? JSON.stringify(link.body)}\n`);
}
