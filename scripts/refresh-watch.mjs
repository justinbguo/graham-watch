/**
 * Did the nightly refresh record anything in the last 24 hours?
 *
 * Catalogue refresh already fails, and GitHub mails that failure, when the
 * job itself goes red. It cannot mail when the schedule never started, or
 * when it died before the ledger write: there is no red job to mail about.
 * This runs two hours later. An empty or stale ledger exits 1, which is the
 * same GitHub failure mail. No new secret and no new service.
 *
 *   node scripts/refresh-watch.mjs
 *
 * Uses the service role the catalogue job already has. It only reads.
 */

import { describeTarget, request, serviceKey } from './_supabase.mjs';
import { isSchemaMiss, watchFailure } from './refresh-health.mjs';

const key = serviceKey();
console.log(describeTarget());

const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const recent = await request(
  `/rest/v1/refresh_runs?select=finished_at&finished_at=gte.${encodeURIComponent(since)}&order=finished_at.desc&limit=1`,
  { token: key }
);

if (!recent.ok) {
  const detail = recent.body?.message ?? recent.body?.error ?? JSON.stringify(recent.body);
  if (isSchemaMiss(recent.body, recent.status)) {
    console.error(
      'refresh_runs is not on this database. Apply the migrations with npm run db:push (after a dump).'
    );
  } else {
    console.error(`Could not read the refresh ledger (${recent.status}): ${detail}`);
  }
  process.exit(1);
}

const recentRows = Array.isArray(recent.body) ? recent.body : [];
const approved = await request(
  '/rest/v1/dealers?select=id&permission=eq.approved&website=not.is.null&limit=1',
  { token: key }
);
if (!approved.ok) {
  const detail = approved.body?.message ?? approved.body?.error ?? JSON.stringify(approved.body);
  console.error(`Could not list approved shops (${approved.status}): ${detail}`);
  process.exit(1);
}
const approvedWithWebsite = Array.isArray(approved.body) ? approved.body.length : 0;
// limit=1, so a row means "at least one". The watch only needs that.
const failure = watchFailure({
  approvedWithWebsite: approvedWithWebsite > 0 ? 1 : 0,
  finishedAts: recentRows.map((row) => row.finished_at),
});
if (!failure) {
  if (recentRows[0]?.finished_at) console.log(`Refresh recorded at ${recentRows[0].finished_at}.`);
  else console.log('No approved shop with a website. Nothing for the nightly job to record.');
  process.exit(0);
}

const latest = await request(
  '/rest/v1/refresh_runs?select=finished_at&order=finished_at.desc&limit=1',
  { token: key }
);
const latestAt = Array.isArray(latest.body) ? latest.body[0]?.finished_at : null;
if (latestAt) {
  console.error(`${failure} The newest row is ${latestAt}.`);
} else {
  console.error(
    'The refresh ledger is empty. The nightly job has not recorded a run, so the operator console cannot show one.'
  );
}
process.exit(1);
