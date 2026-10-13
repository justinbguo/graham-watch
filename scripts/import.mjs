/**
 * Run a listing import from the terminal.
 *
 *   npm run import -- https://dealer.example.com/watches
 *   npm run import -- https://dealer.example.com/watches --limit 10
 *
 * Two steps, because they cost very different things. Reading the catalogue is
 * HTTP and covers the whole shop. Typing a watch is a model call, so only the
 * ones picked here are typed, in batches that survive a failure — which is why
 * a shop with hundreds of watches now imports at all.
 *
 * For a dealer you have not imported before, prefer `npm run dealers -- add
 * <domain>`, which finds the catalog and previews it first.
 */

import { choose, publishAll, syncCatalog } from './_import.mjs';
import { signInOperator } from './_supabase.mjs';

const args = process.argv.slice(2);
const sourceUrl = args.find((arg) => arg.startsWith('http'));

const limitFlag = args.indexOf('--limit');
const limit = limitFlag === -1 ? undefined : Number(args[limitFlag + 1]);

if (!sourceUrl || (limitFlag !== -1 && !Number.isInteger(limit))) {
  console.error('Usage: npm run import -- <url> [--limit <n>]');
  process.exit(1);
}

const operator = await signInOperator();
console.log(`Reading ${sourceUrl} as ${operator.email}`);

try {
  const synced = await syncCatalog({ sourceUrl, token: operator.token });

  console.log(
    `  ${synced.found} watches via ${synced.provider}: ${synced.added} new, ${synced.changed} changed, ${synced.adopted} matched to listings we had, ${synced.retired} retired.`
  );
  if (!synced.complete) {
    console.log('  Stopped at the read limit. Run it again to read further.');
  }

  const picked = await choose({ dealerId: synced.dealerId, limit, token: operator.token });
  if (!picked && !synced.changed) {
    console.log('\nNothing new to publish.');
    process.exit(0);
  }

  console.log(`\nTyping ${picked} new watch(es)${synced.changed ? ` and ${synced.changed} changed` : ''}…`);

  const totals = await publishAll({
    dealerId: synced.dealerId,
    token: operator.token,
    onProgress: (current) =>
      process.stdout.write(`\r  ${current.published} published, ${current.pending} left…    `),
  });

  process.stdout.write('\r');
  console.log(`Done. ${totals.published} published, ${totals.skipped} skipped, ${totals.failed} failed.`);
  console.log('They stay invisible to other users until you approve the dealer:');
  console.log('  npm run dealers');
} catch (error) {
  process.stdout.write('\r');
  console.error(`Import failed: ${error.message}`);
  if (/openai|api key/i.test(error.message)) {
    console.error('Set a real OPENAI_API_KEY in supabase/functions/.env, then restart the');
    console.error('stack so the function picks it up:  npm run db:stop && npm run db:start');
  }
  process.exit(1);
}
