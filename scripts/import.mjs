/**
 * Run a listing import from the terminal.
 *
 *   npm run import -- https://dealer.example.com/watches
 *   npm run import -- https://dealer.example.com/watches --limit 10
 *
 * Importing is an operator job, not something a buyer does, so it lives here
 * rather than in the app. For a dealer you have not imported before, prefer
 * `npm run dealers -- add <domain>`, which finds the catalog and previews it.
 */

import { runImport } from './_import.mjs';
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
console.log(`Importing ${sourceUrl} as ${operator.email}${limit ? `, up to ${limit}` : ''}`);

try {
  const job = await runImport({
    sourceUrl,
    limit,
    token: operator.token,
    onProgress: (current) => process.stdout.write(`\r  ${current.status}…    `),
  });

  process.stdout.write('\r');
  console.log(`Done via ${job.provider}. ${job.listings_created} listing(s) created.`);
  if (job.error) console.log(job.error);
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
