/**
 * Run a listing import from the terminal.
 *
 *   npm run import -- https://dealer.example.com/watches
 *   npm run import -- https://dealer.example.com/watches --limit 10
 *
 * Importing is an operator job, not something a buyer does, so it lives here
 * rather than in the app. This calls the same `import-listings` edge function
 * the app used to, then follows the job row until it finishes.
 */

import { request, signInOperator } from './_supabase.mjs';

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

const started = await request('/functions/v1/import-listings', {
  token: operator.token,
  method: 'POST',
  body: { sourceUrl, limit },
});

if (!started.ok) {
  console.error(`Failed to queue: ${started.body?.error ?? started.status}`);
  process.exit(1);
}

const jobId = started.body.job.id;
console.log(`Queued job ${jobId}`);

const TIMEOUT_MS = 180_000;
const deadline = Date.now() + TIMEOUT_MS;
let job = started.body.job;

while (job.status === 'queued' || job.status === 'running') {
  if (Date.now() > deadline) {
    console.error(`Gave up after ${TIMEOUT_MS / 1000}s. Job ${jobId} is still ${job.status}.`);
    process.exit(1);
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const polled = await request(`/rest/v1/import_jobs?id=eq.${jobId}`, { token: operator.token });
  job = polled.body?.[0] ?? job;
  process.stdout.write(`\r  ${job.status}…    `);
}

process.stdout.write('\r');

if (job.status === 'failed') {
  console.error(`Import failed: ${job.error}`);
  if (/openai|api key/i.test(job.error ?? '')) {
    console.error('Set a real OPENAI_API_KEY in supabase/functions/.env, then restart the');
    console.error('stack so the function picks it up:  npm run db:stop && npm run db:start');
  }
  process.exit(1);
}

console.log(`Done via ${job.provider}. ${job.listings_created} listing(s) created.`);
if (job.error) console.log(job.error);
console.log('They stay invisible to other users until you approve the dealer:');
console.log('  npm run dealers');
