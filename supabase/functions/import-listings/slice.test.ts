import { assertEquals } from 'jsr:@std/assert@1';

import { PAGES_PER_CALL, syncCatalog } from './catalog.ts';
import type { Json, TextResponse } from './source.ts';

const DEALER = '532fe88e-95c2-437e-a1bc-5cc6a4eb3b57';
const ORIGIN = 'https://shop.example';
const BREADCRUMB = 'Jewelry & Watches > Watches, Parts & Accessories > Watches > Wristwatches';

type Row = {
  id: string;
  dealer_id: string;
  external_id: string;
  content_hash: string;
  available: boolean;
  hold_reason: string | null;
  last_seen_at: string;
  publish: boolean;
  raw: { title?: string; available?: boolean; holdReason?: string };
};

function memory() {
  const rows: Row[] = [];
  const writes: number[] = [];
  const availability: Array<{ count: number; complete: boolean }> = [];
  return {
    rows,
    writes,
    availability,
    from(table: string) {
      if (table !== 'source_items') throw new Error(table);
      const filters: Array<(row: Row) => boolean> = [];
      let patch: Partial<Row> | null = null;
      const chain = {
        select() {
          return chain;
        },
        eq(column: keyof Row, value: unknown) {
          filters.push((row) => row[column] === value);
          return chain;
        },
        gte(column: keyof Row, value: string) {
          filters.push((row) => String(row[column]) >= value);
          return chain;
        },
        lt(column: keyof Row, value: string) {
          filters.push((row) => String(row[column]) < value);
          return chain;
        },
        not(column: keyof Row, operator: string, value: null) {
          if (operator === 'is' && value === null) {
            filters.push((row) => row[column] != null);
          }
          return chain;
        },
        in(column: keyof Row, values: unknown[]) {
          const allowed = new Set(values);
          filters.push((row) => allowed.has(row[column]));
          return chain;
        },
        or(expression: string) {
          const checks = expression.split(',').map((part) => {
            const [column, op, raw] = part.split('.');
            return (row: Row) => op === 'eq' && String(row[column as keyof Row]) === raw;
          });
          filters.push((row) => checks.some((check) => check(row)));
          return chain;
        },
        order() {
          return chain;
        },
        range(from: number, to: number) {
          const matched = rows.filter((row) => filters.every((keep) => keep(row)));
          return Promise.resolve({ data: matched.slice(from, to + 1), error: null });
        },
        upsert(batch: Array<Omit<Row, 'id' | 'publish'> & { publish?: boolean }>) {
          for (const incoming of batch) {
            const index = rows.findIndex(
              (row) => row.dealer_id === incoming.dealer_id && row.external_id === incoming.external_id,
            );
            if (index === -1) {
              rows.push({ id: crypto.randomUUID(), publish: false, ...incoming });
            } else {
              rows[index] = { ...rows[index], ...incoming, id: rows[index].id };
            }
          }
          return Promise.resolve({ error: null });
        },
        update(next: Partial<Row>) {
          patch = next;
          return chain;
        },
        then(resolve: (value: { error: null }) => void, reject?: (reason: unknown) => void) {
          try {
            if (patch) {
              const matched = rows.filter((row) => filters.every((keep) => keep(row)));
              writes.push(matched.length);
              for (const row of matched) Object.assign(row, patch);
            }
            resolve({ error: null });
          } catch (error) {
            reject?.(error);
          }
        },
      };
      return chain;
    },
    rpc(name: string, args?: { p_seen_ids?: string[]; p_read_complete?: boolean }) {
      if (name === 'adopt_existing_listings') return Promise.resolve({ data: 0, error: null });
      if (name === 'sync_source_availability') {
        availability.push({
          count: args?.p_seen_ids?.length ?? 0,
          complete: args?.p_read_complete === true,
        });
        return Promise.resolve({ data: { retired: 0, relisted: 0 }, error: null });
      }
      return Promise.resolve({ data: null, error: { message: name } });
    },
  };
}

function watch(id: number, fields: Record<string, unknown> = {}): Json {
  return {
    id,
    title: `Explorer ${id}`,
    handle: `explorer-${id}`,
    vendor: 'Rolex',
    product_type: BREADCRUMB,
    images: [{ src: `https://cdn.shop.example/${id}.jpg` }],
    variants: [{ available: true, price: '1000.00', sku: `SKU-${id}` }],
    body_html: '<p>A wristwatch.</p>',
    ...fields,
  };
}

function shop(pages: Json[][]) {
  const fetchText = async (url: URL, _accept: string): Promise<TextResponse> => {
    if (url.pathname === '/robots.txt') {
      return { status: 200, body: 'User-agent: *\nAllow: /\n' };
    }
    if (url.pathname === '/meta.json') {
      return { status: 200, body: JSON.stringify({ currency: 'USD', name: 'Bench' }) };
    }
    const page = Number(url.searchParams.get('page') ?? '1');
    return { status: 200, body: JSON.stringify({ products: pages[page - 1] ?? [] }) };
  };
  return fetchText;
}

async function syncPage(
  db: ReturnType<typeof memory>,
  pages: Json[][],
  page: number,
  pageSize: number,
) {
  return await syncCatalog(db as never, DEALER, ORIGIN, 10_000, {
    startPage: page,
    maxPages: PAGES_PER_CALL,
    pageSize,
    fetchText: shop(pages),
    pause: async () => {},
  });
}

Deno.test('a refresh adds a for-sale watch the shop did not have last time', async () => {
  const db = memory();
  const first = await syncPage(db, [[watch(1)]], 1, 10);
  assertEquals(first.added, 1);
  assertEquals(first.forSale, 1);
  assertEquals(db.rows[0].hold_reason, null);
  assertEquals(db.rows[0].available, true);

  const again = await syncPage(db, [[watch(1)]], 1, 10);
  assertEquals(again.added, 0);
  assertEquals(db.rows.length, 1);

  const grown = await syncPage(db, [[watch(1), watch(2)]], 1, 10);
  assertEquals(grown.added, 1);
  assertEquals(grown.forSale, 2);
  assertEquals(db.rows.map((row) => row.external_id).sort(), ['shopify:1', 'shopify:2']);
});

Deno.test('an 800-watch feed finishes a page at a time and a retry adds nothing', async () => {
  const pageSize = 250;
  const total = 800;
  const pages: Json[][] = [];
  for (let id = 1; id <= total; id += pageSize) {
    pages.push(Array.from({ length: Math.min(pageSize, total - id + 1) }, (_, index) => watch(id + index)));
  }

  const db = memory();
  const seen = new Set<string>();
  const readAt = new Date().toISOString();
  let calls = 0;
  let page = 1;
  let peak = 0;
  for (;;) {
    calls += 1;
    const result = await syncCatalog(db as never, DEALER, ORIGIN, 10_000, {
      startPage: page,
      maxPages: PAGES_PER_CALL,
      pageSize,
      fetchText: shop(pages),
      pause: async () => {},
      readAt,
    });
    peak = Math.max(peak, result.found);
    for (const row of db.rows) seen.add(row.external_id);
    assertEquals(result.found <= pageSize, true);
    if (result.nextPage == null) break;
    page = result.nextPage;
    if (calls > 10) throw new Error('the feed did not end');
  }

  assertEquals(calls, 4);
  assertEquals(peak, pageSize);
  assertEquals(seen.size, total);
  assertEquals(db.rows.length, total);
  assertEquals(db.rows.every((row) => row.hold_reason == null && row.available), true);

  let replayed = 0;
  page = 1;
  const retryAt = readAt;
  for (;;) {
    const result = await syncCatalog(db as never, DEALER, ORIGIN, 10_000, {
      startPage: page,
      maxPages: PAGES_PER_CALL,
      pageSize,
      fetchText: shop(pages),
      pause: async () => {},
      readAt: retryAt,
    });
    replayed += result.added;
    if (result.nextPage == null) break;
    page = result.nextPage;
  }
  assertEquals(replayed, 0);
  assertEquals(db.rows.length, total);
  assertEquals(db.rows.every((row) => row.available), true);
});

Deno.test('a shop under the availability chunk still retires in one call', async () => {
  const db = memory();
  await syncPage(db, [[watch(1), watch(2), watch(3)]], 1, 10);
  assertEquals(db.availability, [{ count: 3, complete: true }]);
});

Deno.test('queued holds are unpublished in bounded writes and a rerun writes none', async () => {
  const total = 250;
  const pages = [Array.from({ length: total }, (_, index) => watch(index + 1, { product_type: 'Straps' }))];
  const db = memory();
  await syncPage(db, pages, 1, total);
  assertEquals(db.rows.length, total);
  assertEquals(db.rows.every((row) => row.hold_reason != null), true);
  for (const row of db.rows) row.publish = true;
  db.writes.length = 0;

  await syncPage(db, pages, 1, total);
  assertEquals(db.rows.every((row) => row.publish === false), true);
  assertEquals(db.writes.length > 1, true);
  assertEquals(db.writes.every((count) => count > 0 && count <= 100), true);
  assertEquals(db.writes.reduce((sum, count) => sum + count, 0), total);

  db.writes.length = 0;
  await syncPage(db, pages, 1, total);
  assertEquals(db.writes, []);
  assertEquals(db.rows.every((row) => row.publish === false), true);
});

Deno.test('a catalogue larger than one availability call still marks the read complete once', async () => {
  const pageSize = 250;
  const total = 2001;
  const pages: Json[][] = [];
  for (let id = 1; id <= total; id += pageSize) {
    pages.push(Array.from({ length: Math.min(pageSize, total - id + 1) }, (_, index) => watch(id + index)));
  }
  const db = memory();
  await syncCatalog(db as never, DEALER, ORIGIN, 10_000, {
    pageSize,
    fetchText: shop(pages),
    pause: async () => {},
  });
  assertEquals(db.rows.length, total);
  assertEquals(db.availability.length > 1, true);
  assertEquals(db.availability.every((call) => call.count <= 2000), true);
  const finished = db.availability.filter((call) => call.complete);
  assertEquals(finished, [{ count: 1, complete: true }]);
});
