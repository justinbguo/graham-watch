/**
 * How the nightly refresh spends edge-function requests.
 *
 * An isolate gets two seconds of CPU and 256MB, then the platform kills the
 * request with HTTP 546. Reading every shop in one request is what did that
 * on 23 Oct 2026, after about two minutes, with no shop printed. Each call
 * here is one shop and one phase: `sync` reads the catalogue, `publish`
 * publishes a couple of watches. The queue lives in `source_items`, so a
 * watch this run does not reach is still there tomorrow.
 *
 * `bounded` is set by a function that actually stops after one slice. A
 * deploy from before that drains the shop inside the sync call and leaves
 * the field off, and calling publish on top of that would do the work twice.
 */

/**
 * One call publishes two watches. 30 calls left Grand Caliber with 378
 * for-sale watches and no listing after the 8 Nov 2026 read, and Danny's
 * with 104. 400 calls is 800 watches, above either shop's for-sale count.
 */
export const MAX_PUBLISH_CALLS = 400;

/** Shopify pages per catalogue request. Eight pages is 2,000 products. */
export const SYNC_PAGE_BUDGET = 8;

const MAX_SYNC_SLICES = 8;

export function refreshExitCode(results) {
  if (results.some((shop) => shop.fatal)) return 1;
  if (results.length > 0 && results.every((shop) => !shop.ok)) return 1;
  return 0;
}

/** What to print when the job itself goes red. A publish-time key rejection has no `error` of its own. */
export function refreshFailureReason(results) {
  const fatal = results.find((shop) => shop.fatal);
  if (!fatal) return 'Every shop failed.';
  return fatal.error ?? fatal.publishError ?? 'Refresh failed.';
}

function errorOf(body, status) {
  let detail = `HTTP ${status}`;
  if (body && typeof body === 'object') detail = body.error ?? body.message ?? detail;
  else if (typeof body === 'string' && body) detail = body;
  return status ? `${detail} (HTTP ${status})` : detail;
}

function firstResult(body) {
  const row = Array.isArray(body?.results) ? body.results[0] : null;
  return row && typeof row === 'object' ? row : null;
}

export function formatShop(shop) {
  const label = shop.website ?? shop.dealerId;
  if (shop.skipped) return [`${label}`, '  skipped; it is not an approved shop'];
  if (!shop.ok) return [`${label}`, `  failed: ${shop.error}`];

  const lines = [
    label,
    `  read ${shop.found}, ${shop.changed} changed, ${shop.added} new, ${shop.retired} retired, ${shop.relisted} relisted, ${shop.published} published${
      shop.complete ? '' : ', incomplete read'
    }${Number(shop.listingsSkipped) > 0 ? `, ${shop.listingsSkipped} skipped` : ''}`,
  ];
  if (shop.publishError) lines.push(`  publish stopped: ${shop.publishError}`);
  if (shop.pending > 0) {
    lines.push(`  ${shop.pending} still waiting; the next run continues them`);
  }
  return lines;
}

/**
 * @param {{ id: string, name?: string, website?: string }} dealer
 * @param {(body: { dealerId: string, phase: 'sync' | 'publish' }) => Promise<{ ok: boolean, status: number, body: unknown }>} invoke
 */
export async function refreshDealer(dealer, invoke, maxPublishCalls = MAX_PUBLISH_CALLS) {
  const website = dealer.website ?? dealer.id;
  const readAt = new Date().toISOString();
  let carry;
  let sync = null;
  let page = 1;
  for (let slice = 0; slice < MAX_SYNC_SLICES; slice += 1) {
    sync = await invoke({
      dealerId: dealer.id,
      phase: 'sync',
      page,
      pageBudget: SYNC_PAGE_BUDGET,
      readAt,
      ...(carry ? { carry } : {}),
    });
    if (!sync.ok) break;
    const row = firstResult(sync.body);
    if (!row?.ok || typeof row.nextPage !== 'number') break;
    carry = row.carry;
    page = row.nextPage;
  }
  if (!sync) {
    return {
      ok: false,
      fatal: false,
      skipped: false,
      dealerId: dealer.id,
      website,
      name: dealer.name ?? null,
      error: 'Refresh failed.',
      status: 0,
      found: 0,
      changed: 0,
      added: 0,
      retired: 0,
      relisted: 0,
      published: 0,
      listingsSkipped: 0,
      pending: 0,
      complete: false,
      publishError: null,
    };
  }

  if (!sync.ok) {
    return {
      ok: false,
      fatal: sync.status === 401 || sync.status === 503,
      skipped: false,
      dealerId: dealer.id,
      website,
      name: dealer.name ?? null,
      error: errorOf(sync.body, sync.status),
      status: sync.status,
      found: 0,
      changed: 0,
      added: 0,
      retired: 0,
      relisted: 0,
      published: 0,
      listingsSkipped: 0,
      pending: 0,
      complete: false,
      publishError: null,
    };
  }

  if (Array.isArray(sync.body?.results) && sync.body.results.length === 0) {
    return {
      ok: true,
      fatal: false,
      skipped: true,
      dealerId: dealer.id,
      website,
      name: dealer.name ?? null,
      error: null,
      status: sync.status,
      found: 0,
      changed: 0,
      added: 0,
      retired: 0,
      relisted: 0,
      published: 0,
      listingsSkipped: 0,
      pending: 0,
      complete: true,
      publishError: null,
    };
  }

  const row = firstResult(sync.body);
  if (!row?.ok) {
    return {
      ok: false,
      fatal: false,
      skipped: false,
      dealerId: dealer.id,
      website: row?.website ?? website,
      name: row?.name ?? dealer.name ?? null,
      error: row?.error ?? 'Refresh failed.',
      status: sync.status,
      found: 0,
      changed: 0,
      added: 0,
      retired: 0,
      relisted: 0,
      published: 0,
      listingsSkipped: 0,
      pending: 0,
      complete: false,
      publishError: null,
    };
  }

  const shop = {
    ok: true,
    fatal: false,
    skipped: false,
    dealerId: dealer.id,
    website: row.website ?? website,
    name: row.name ?? dealer.name ?? null,
    error: null,
    status: sync.status,
    found: Number(row.found ?? 0),
    changed: Number(row.changed ?? 0),
    added: Number(row.added ?? 0),
    retired: Number(row.retired ?? 0),
    relisted: Number(row.relisted ?? 0),
    published: Number(row.published ?? 0),
    listingsSkipped: Number(row.skipped ?? 0),
    pending: Number(row.pending ?? 0),
    complete: row.complete !== false,
    publishError: null,
  };

  // An older function already tried to publish everything inside the sync.
  if (sync.body?.bounded !== true || shop.pending <= 0) return shop;

  for (let call = 0; call < maxPublishCalls && shop.pending > 0; call += 1) {
    const before = shop.pending;
    const published = await invoke({ dealerId: dealer.id, phase: 'publish' });
    if (!published.ok) {
      shop.publishError = errorOf(published.body, published.status);
      shop.fatal = published.status === 401 || published.status === 503;
      return shop;
    }

    const step = firstResult(published.body);
    if (!step?.ok) {
      shop.publishError = step?.error ?? 'Publish failed.';
      return shop;
    }

    shop.published += Number(step.published ?? 0);
    shop.listingsSkipped += Number(step.skipped ?? 0);
    const next = Number(step.pending ?? 0);
    const processed = Number(step.processed ?? 0);
    shop.pending = next;
    if (processed === 0 || next >= before) return shop;
  }

  return shop;
}

export async function runRefresh(dealers, invoke, maxPublishCalls = MAX_PUBLISH_CALLS) {
  const results = [];
  for (const dealer of dealers) {
    const shop = await refreshDealer(dealer, invoke, maxPublishCalls);
    results.push(shop);
    if (shop.fatal) break;
  }
  return { results, exitCode: refreshExitCode(results) };
}
