/**
 * List and permission dealers from the terminal.
 *
 *   npm run dealers                       list every dealer
 *   npm run dealers -- approve <id|host>  publish their listings
 *   npm run dealers -- revoke  <id|host>  pull them back
 *
 * Approval is deliberately impossible from the app: RLS blocks a user from
 * approving a dealer they created, so nobody can publish a shop's inventory by
 * importing it. That makes approving an operator action, and this is the tool.
 */

import { config, request, serviceKey } from './_supabase.mjs';

const [command, target] = process.argv.slice(2);
const key = serviceKey();

async function list() {
  const { body } = await request('/rest/v1/dealers?select=*,listings(count)&order=created_at.desc', {
    token: key,
  });

  if (!Array.isArray(body) || body.length === 0) {
    console.log('No dealers yet. Run `npm run import -- <url>` first.');
    return;
  }

  console.log('');
  for (const dealer of body) {
    const count = dealer.listings?.[0]?.count ?? 0;
    const mark = dealer.permission === 'approved' ? '●' : '○';
    console.log(`  ${mark} ${dealer.permission.padEnd(9)} ${String(count).padStart(3)} listings  ${dealer.name}`);
    console.log(`    ${dealer.website ?? 'no website'}  ${dealer.id}`);
  }
  console.log('\n  ● live in the deck   ○ hidden from everyone but the importer\n');
}

async function setPermission(permission) {
  if (!target) {
    console.error(`Usage: npm run dealers -- ${permission === 'approved' ? 'approve' : 'revoke'} <id|host>`);
    process.exit(1);
  }

  const isUuid = /^[0-9a-f-]{36}$/i.test(target);
  const filter = isUuid ? `id=eq.${target}` : `website=ilike.*${target}*`;

  const { body, ok, status } = await request(`/rest/v1/dealers?${filter}`, {
    token: key,
    method: 'PATCH',
    body: { permission },
    prefer: 'return=representation',
  });

  if (!ok) {
    console.error(`Failed (${status}): ${body?.message ?? ''}`);
    process.exit(1);
  }
  if (!body?.length) {
    console.error(`No dealer matched "${target}".`);
    process.exit(1);
  }

  for (const dealer of body) {
    console.log(`${dealer.name} → ${dealer.permission}`);
  }
}

console.log(`${config().isLocal ? 'local' : config().url}`);

switch (command) {
  case undefined:
  case 'list':
    await list();
    break;
  case 'approve':
    await setPermission('approved');
    break;
  case 'revoke':
    await setPermission('revoked');
    break;
  default:
    console.error(`Unknown command "${command}". Try: list, approve, revoke.`);
    process.exit(1);
}
