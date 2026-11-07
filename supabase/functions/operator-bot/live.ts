import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@^2';

import { MAX_CATALOG_ITEMS, readCatalog, syncCatalog } from '../import-listings/catalog.ts';
import { discover } from '../import-listings/discover.ts';
import { fixtureImportAllowed } from '../import-listings/fixture.ts';
import { DEFAULT_BATCH, publishBatch, queuePublish } from '../import-listings/publish.ts';
import { catalogueComplete, type SkippedItem, type SourceItem } from '../import-listings/source.ts';

import { FixtureImportOff, OperatorError, type FixtureWatch, type OperatorDeps } from './handler.ts';

let adminClient: SupabaseClient | null = null;

function admin(): SupabaseClient {
  adminClient ??= createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
  return adminClient;
}

const NEW_SHOPS_PER_HOUR = 200;
const PUBLISH_PASSES = 5;

async function publishQueued(dealerId: string) {
  const totals = { processed: 0, published: 0, skipped: 0, failed: 0, pending: 0 };
  for (let pass = 0; pass < PUBLISH_PASSES; pass += 1) {
    const batch = await publishBatch(admin(), admin(), dealerId, DEFAULT_BATCH);
    totals.processed += batch.processed;
    totals.published += batch.published;
    totals.skipped += batch.skipped;
    totals.failed += batch.failed;
    totals.pending = batch.pending;
    if (batch.pending === 0 || batch.processed === 0) break;
  }
  return totals;
}

async function assertBudget() {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const [previews, introduced] = await Promise.all([
    admin()
      .from('import_jobs')
      .select('id', { count: 'exact', head: true })
      .is('user_id', null)
      .is('dealer_id', null)
      .gte('created_at', since),
    admin()
      .from('dealers')
      .select('id', { count: 'exact', head: true })
      .is('created_by', null)
      .gte('created_at', since),
  ]);
  if (previews.error || introduced.error || previews.count == null || introduced.count == null) {
    throw new OperatorError('Could not check the import budget. Try again shortly.', 429);
  }
  if (previews.count + introduced.count >= NEW_SHOPS_PER_HOUR) {
    throw new OperatorError(
      `That is this hour's limit of ${NEW_SHOPS_PER_HOUR} new shops. Shops already added are unaffected.`,
      429,
    );
  }
}

async function meter(
  sourceUrl: string,
  dealerId: string | null,
  status: 'succeeded' | 'failed',
  provider: string,
  error?: string,
) {
  const { error: failed } = await admin().from('import_jobs').insert({
    user_id: null,
    dealer_id: dealerId,
    source_url: sourceUrl,
    provider,
    status,
    error: error ?? null,
    finished_at: new Date().toISOString(),
  });
  if (failed) console.error('could not write the import ledger', failed.message);
}

function websiteOf(sourceUrl: string) {
  const host = new URL(sourceUrl).hostname.replace(/^www\./, '');
  return { host, website: `https://${host}` };
}

async function ensureDealer(sourceUrl: string, name?: string, email?: string) {
  const { host, website } = websiteOf(sourceUrl);
  const existing = await admin()
    .from('dealers')
    .select('id, permission')
    .eq('website', website)
    .maybeSingle();
  if (existing.error) throw new OperatorError(existing.error.message, 502);
  if (existing.data) return existing.data;

  await assertBudget();
  const inserted = await admin()
    .from('dealers')
    .insert({
      name: name || host,
      website,
      contact_email: email ?? null,
      permission: 'pending',
      created_by: null,
    })
    .select('id, permission')
    .single();

  if (inserted.error?.code === '23505') {
    const raced = await admin()
      .from('dealers')
      .select('id, permission')
      .eq('website', website)
      .maybeSingle();
    if (raced.data) return raced.data;
  }
  if (inserted.error || !inserted.data) {
    throw new OperatorError(inserted.error?.message ?? 'Could not create a dealer.', 502);
  }
  return inserted.data;
}

function counts(items: SourceItem[], skipped: SkippedItem[]) {
  const forSale = items.filter((item) => item.available).length;
  return {
    read: items.length + skipped.length,
    for_sale: forSale,
    sold: items.length - forSale,
    skipped: skipped.length,
  };
}

function permissionFailure(error: { message: string; code?: string }) {
  if (error.code === 'P0002' || /no such shop/i.test(error.message)) {
    return new OperatorError('No such shop.', 404);
  }
  if (error.code === '22023' || /revoked shop stays revoked/i.test(error.message)) {
    return new OperatorError(error.message, 400);
  }
  return new OperatorError(error.message, 400);
}

async function audit(row: {
  action: string;
  targetType: string;
  targetId: string | null;
  before: unknown;
  after: unknown;
}) {
  const { error } = await admin().rpc('record_bot_action', {
    p_action: row.action,
    p_target_type: row.targetType,
    p_target_id: row.targetId,
    p_before: row.before,
    p_after: row.after,
  });
  if (error) throw new OperatorError(error.message, 502);
}

export function liveDeps(): OperatorDeps {
  return {
    env: Deno.env,
    async discover(domain) {
      await assertBudget();
      try {
        const found = await discover(domain);
        await meter(found.catalogUrl, null, 'succeeded', 'discover');
        return found;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not read that site.';
        await meter(domain, null, 'failed', 'discover', message);
        throw new OperatorError(message, 502);
      }
    },
    async inspect(sourceUrl) {
      await assertBudget();
      try {
        const found = await readCatalog(sourceUrl, MAX_CATALOG_ITEMS);
        await meter(sourceUrl, null, 'succeeded', found.provider);
        return {
          provider: found.provider,
          complete: catalogueComplete(found, MAX_CATALOG_ITEMS),
          counts: counts(found.items, found.skipped),
          listings: found.items.slice(0, 20).map((item) => ({
            source_url: item.sourceUrl,
            title: item.title,
            price_cents: item.priceCents,
            available: item.available,
          })),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Inspect failed.';
        await meter(sourceUrl, null, 'failed', 'inspect', message);
        throw new OperatorError(message, 502);
      }
    },
    async importCatalog(input) {
      const dealer = await ensureDealer(input.sourceUrl, input.dealerName, input.dealerEmail);
      try {
        const result = await syncCatalog(admin(), dealer.id, input.sourceUrl, MAX_CATALOG_ITEMS);
        await queuePublish(admin(), dealer.id);
        const publish = await publishQueued(dealer.id);
        await meter(input.sourceUrl, dealer.id, 'succeeded', result.provider);
        return { dealerId: dealer.id, permission: dealer.permission, ...result, publish };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Import failed.';
        await meter(input.sourceUrl, dealer.id, 'failed', 'catalog', message);
        throw new OperatorError(message, 502);
      }
    },
    async importFixture(input) {
      if (!fixtureImportAllowed(Deno.env)) throw new FixtureImportOff();
      const dealer = await ensureDealer(input.sourceUrl, input.dealerName);
      const urls = input.listings.map((listing) => listing.sourceUrl);
      const existing = await admin()
        .from('listings')
        .select('id, source_url')
        .eq('dealer_id', dealer.id)
        .in('source_url', urls);
      if (existing.error) throw new OperatorError(existing.error.message, 502);
      const have = new Set((existing.data ?? []).map((row) => row.source_url));
      const fresh = input.listings.filter((listing) => !have.has(listing.sourceUrl));
      let inserted: { id: string; brand: string; model: string | null; source_url: string | null }[] = [];
      if (fresh.length > 0) {
        const rows = fresh.map((listing: FixtureWatch) => ({
          dealer_id: dealer.id,
          imported_by: null,
          brand: listing.brand,
          model: listing.model,
          reference: listing.reference,
          year: listing.year,
          price_cents: listing.priceCents,
          description: listing.description,
          currency: 'USD',
          status: 'active' as const,
          sold_at: null,
          source_url: listing.sourceUrl,
        }));
        const write = await admin()
          .from('listings')
          .insert(rows)
          .select('id, brand, model, source_url');
        if (write.error || !write.data) {
          throw new OperatorError(write.error?.message ?? 'Could not insert listings.', 502);
        }
        inserted = write.data;
        const photos = fresh.flatMap((listing) => {
          if (!listing.photoUrl) return [];
          const saved = inserted.find((row) => row.source_url === listing.sourceUrl);
          if (!saved) return [];
          return [{ listing_id: saved.id, position: 0, source_url: listing.photoUrl }];
        });
        if (photos.length > 0) {
          const photoWrite = await admin().from('listing_photos').insert(photos);
          if (photoWrite.error) throw new OperatorError(photoWrite.error.message, 502);
        }
      }
      await meter(input.sourceUrl, dealer.id, 'succeeded', 'fixture');
      return {
        dealerId: dealer.id,
        permission: dealer.permission,
        published: inserted.length,
        listings: inserted,
      };
    },
    async setPermission(dealerId, permission) {
      const { data, error } = await admin().rpc('bot_set_dealer_permission', {
        p_dealer_id: dealerId,
        p_permission: permission,
      });
      if (error) throw permissionFailure(error);
      return { dealerId, permission: data };
    },
    async report(dealerId) {
      const dealer = await admin()
        .from('dealers')
        .select('id, name, website, permission')
        .eq('id', dealerId)
        .maybeSingle();
      if (dealer.error) throw new OperatorError(dealer.error.message, 502);
      if (!dealer.data) throw new OperatorError('No such shop.', 404);

      const [active, total, job] = await Promise.all([
        admin()
          .from('listings')
          .select('id', { count: 'exact', head: true })
          .eq('dealer_id', dealerId)
          .eq('status', 'active')
          .is('sold_at', null),
        admin()
          .from('listings')
          .select('id', { count: 'exact', head: true })
          .eq('dealer_id', dealerId),
        admin()
          .from('import_jobs')
          .select('id, status, source_url, provider, error, listings_created, created_at, finished_at')
          .eq('dealer_id', dealerId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (active.error || total.error || job.error) {
        throw new OperatorError('Could not read the shop.', 502);
      }
      return {
        dealerId: dealer.data.id,
        name: dealer.data.name,
        website: dealer.data.website,
        permission: dealer.data.permission,
        listings: { active: active.count ?? 0, total: total.count ?? 0 },
        latestJob: job.data,
      };
    },
    audit,
  };
}
