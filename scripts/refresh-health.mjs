/**
 * What the nightly job says about each shop after the refresh itself.
 *
 * A shop that failed, a shop whose read came back empty, a shop with live
 * watches and no photographs, or a shop with nothing new for a week, is a
 * warning on the job. It is not a failed job. One broken shop must not hide
 * the others, and a stable catalogue must not turn the check red.
 *
 * Quiet means a successful run where nothing was added, changed, or
 * published. Seven of those in a row is the flag. A skipped run (the
 * function refused a shop that is no longer approved) is ignored, so it
 * neither counts nor breaks the streak.
 */

export const QUIET_NIGHTS = 7;

export function isSchemaMiss(body, status) {
  return status === 404 && (body?.code === 'PGRST202' || body?.code === 'PGRST205');
}

/** The row the refresh script inserts. `skipped` here is the boolean, not the listing count. */
export function refreshRunRow(shop) {
  return {
    dealer_id: shop.dealerId,
    ok: Boolean(shop.ok) && !shop.publishError && !shop.fatal,
    skipped: Boolean(shop.skipped),
    fatal: Boolean(shop.fatal),
    error: shop.error ?? shop.publishError ?? null,
    found: Number(shop.found ?? 0),
    changed: Number(shop.changed ?? 0),
    added: Number(shop.added ?? 0),
    retired: Number(shop.retired ?? 0),
    relisted: Number(shop.relisted ?? 0),
    published: Number(shop.published ?? 0),
    skipped_listings: Number(shop.listingsSkipped ?? 0),
    pending: Number(shop.pending ?? 0),
    complete: shop.complete ?? null,
    http_status: shop.status ?? null,
  };
}

/**
 * @returns {true | false | null} null means this run does not count
 */
export function quietVerdict(run) {
  if (!run || run.skipped) return null;
  if (!run.ok || run.error || run.publishError) return false;
  const moved = Number(run.added ?? 0) + Number(run.changed ?? 0) + Number(run.published ?? 0);
  return moved === 0;
}

export function quietStreak(runsNewestFirst) {
  // One night, even if the workflow was started twice that day. The newest
  // run of a UTC day wins because the list is already newest first.
  const nights = [];
  const seen = new Set();
  for (const run of runsNewestFirst) {
    const day = run?.finished_at ? String(run.finished_at).slice(0, 10) : null;
    if (day) {
      if (seen.has(day)) continue;
      seen.add(day);
    }
    nights.push(run);
  }

  let streak = 0;
  for (const run of nights) {
    const verdict = quietVerdict(run);
    if (verdict === null) continue;
    if (!verdict) break;
    streak += 1;
  }
  return streak;
}

function photoNumbers(photos) {
  if (!photos) return null;
  const missing = Number(photos.missing_photos ?? photos.missingPhotos ?? 0);
  if (!Number.isFinite(missing) || missing <= 0) return null;
  return {
    missing,
    count: Number(photos.photo_count ?? photos.photoCount ?? 0),
    listings: Number(photos.published_listings ?? photos.publishedListings ?? missing),
  };
}

export function shopFlags(shop, runsNewestFirst, photos) {
  if (shop.skipped) return [];

  const flags = [];
  if (!shop.ok) {
    flags.push({ kind: 'error', detail: shop.error ?? 'Refresh failed.' });
  } else if (shop.publishError || shop.fatal) {
    flags.push({ kind: 'error', detail: shop.publishError ?? shop.error ?? 'Refresh failed.' });
  }

  if (shop.ok && !shop.publishError && !shop.fatal && Number(shop.found ?? 0) === 0) {
    const retired = Number(shop.retired ?? 0);
    flags.push({
      kind: 'empty',
      detail:
        retired > 0
          ? `catalogue read returned 0 listings and retired ${retired}`
          : 'catalogue read returned 0 listings',
    });
  }

  const gap = photoNumbers(photos);
  if (gap) {
    flags.push({
      kind: 'photos',
      detail: `${gap.missing} published listing(s) missing photos (${gap.count} photos across ${gap.listings} live listing(s))`,
    });
  }

  const streak = quietStreak(runsNewestFirst);
  if (streak >= QUIET_NIGHTS) {
    flags.push({
      kind: 'quiet',
      detail: `0 new or updated listings for ${streak} nights`,
    });
  }

  return flags;
}

const GROUPS = [
  ['error', 'errors'],
  ['empty', 'empty catalogue'],
  ['photos', 'missing photos'],
  ['quiet', `quiet for ${QUIET_NIGHTS}+ nights`],
];

export function healthReport(entries, notes = []) {
  const lines = ['Shop health'];
  const warnings = [];
  let flagged = 0;

  for (const [kind, title] of GROUPS) {
    const rows = [];
    for (const entry of entries) {
      for (const flag of entry.flags) {
        if (flag.kind !== kind) continue;
        const line = `${entry.label} — ${flag.detail}`;
        rows.push(line);
        warnings.push({ title: 'ShopHealth', message: `${entry.label}: ${flag.detail}` });
      }
    }
    if (!rows.length) continue;
    flagged += rows.length;
    lines.push(`  ${title} (${rows.length})`);
    for (const row of rows) lines.push(`    ${row}`);
  }

  if (flagged === 0) lines.push('  nothing to flag');
  for (const note of notes) lines.push(`  note: ${note}`);

  return { text: lines.join('\n'), warnings, flagged };
}
