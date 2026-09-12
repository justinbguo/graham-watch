import { withSupabase } from 'npm:@supabase/server@^1';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@^2';

import { createClient } from 'npm:@supabase/supabase-js@^2';

import { extractFields, extractListings, type ExtractedFields } from './extract.ts';
import { copyPhotos } from './photos.ts';
import { mapPool } from './pool.ts';
import { resolveProvider, scrape } from './scrape.ts';
import { fetchShopifyItems } from './shopify.ts';
import { productKey, type SourceItem } from './source.ts';
import { fetchSquarespaceItems } from './squarespace.ts';
import { canonicalBrand } from './taxonomy.ts';

const MAX_LISTINGS_PER_IMPORT = 40;

// A sweep costs one feed read and no OpenAI, so it looks at the whole shop.
const MAX_SWEEP_ITEMS = 250;
const MAX_PHOTOS_PER_LISTING = 6;

// A card people tap through needs more than one angle. Below three photos a
// listing reads as an afterthought, so it does not enter the deck at all.
const MIN_PHOTOS_PER_LISTING = 3;

// Each item is one OpenAI round trip. Four at a time keeps a ten-watch import
// under ten seconds without tripping rate limits on a new account.
const EXTRACT_CONCURRENCY = 4;

let adminClient: SupabaseClient | null = null;

/**
 * Copying photos into storage is a server action. The request-scoped client runs
 * as the signed-in user, who has no write access to the bucket by design, so
 * uploads go through the service role instead.
 */
function storage(): SupabaseClient {
  adminClient ??= createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );
  return adminClient;
}

function assertPublicHttpUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('That is not a valid URL.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http and https URLs can be imported.');
  }
  // Block SSRF against the cluster's own network.
  if (/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|\[?::1)/i.test(url.hostname)) {
    throw new Error('That host cannot be imported.');
  }
  return url.toString();
}

// Imported shops rarely have an account, so a dealer row is created from the
// hostname. It starts 'pending' and stays invisible to other users until it is
// approved out-of-band, which is what keeps un-permissioned inventory private.
async function resolveDealer(
  supabase: SupabaseClient,
  userId: string,
  sourceUrl: string,
  dealerId?: string,
  name?: string,
  email?: string
): Promise<string> {
  if (dealerId) return dealerId;

  const host = new URL(sourceUrl).hostname.replace(/^www\./, '');
  const website = `https://${host}`;

  // Not contact_email: that column is revoked from `authenticated`, and asking
  // for it fails the whole select, which used to leave every re-import inserting
  // a dealer that already exists.
  const { data: existing } = await supabase
    .from('dealers')
    .select('id, name')
    .eq('website', website)
    .maybeSingle();

  if (existing) {
    // Dealers imported before we could read the shop's real name are stuck with
    // their hostname on every card. Re-running the import repairs that.
    if (name && existing.name === host) {
      await supabase.from('dealers').update({ name }).eq('id', existing.id);
    }
    // Fill an address we could not find the first time without ever reading the
    // one already there — the `is null` filter is what makes this not overwrite.
    if (email) {
      await supabase
        .from('dealers')
        .update({ contact_email: email })
        .eq('id', existing.id)
        .is('contact_email', null);
    }
    return existing.id;
  }

  const { data, error } = await supabase
    .from('dealers')
    // The hostname is a poor name to show on a card, but it is the only one we
    // have when the caller cannot read the shop's own.
    .insert({
      name: name || host,
      website,
      contact_email: email ?? null,
      created_by: userId,
      permission: 'pending',
    })
    .select('id')
    .single();

  if (error || !data) throw new Error(error?.message ?? 'Could not create a dealer.');
  return data.id;
}

type PreparedListing = {
  fields: ExtractedFields;
  sourceUrl: string;
  photoUrls: string[];
};

/**
 * Two ways in. If the site will hand us its own structured data we take it and
 * ask the model only to type the prose. Otherwise we scrape the page and ask the
 * model to find the watches too, which is the same job with worse inputs.
 */
const ADAPTERS: Record<
  string,
  (url: string, limit: number, minPhotos: number) => Promise<SourceItem[] | null>
> = {
  shopify: fetchShopifyItems,
  squarespace: fetchSquarespaceItems,
};

/** The first adapter that recognises the shop, with the shop's own stock state intact. */
async function adapterItems(
  sourceUrl: string,
  limit: number
): Promise<{ provider: string; items: SourceItem[] } | null> {
  for (const [name, run] of Object.entries(ADAPTERS)) {
    const items = await run(sourceUrl, limit, MIN_PHOTOS_PER_LISTING);
    if (items?.length) return { provider: name, items };
  }
  return null;
}

/**
 * Reconcile the deck against what the shop still has. An import only ever adds,
 * so without this a watch that sold the week after we read it stays on offer
 * forever — and the first a buyer hears of it is a dealer's reply.
 *
 * Only a listing the feed still carries and marks unavailable is retired. An
 * item missing from the feed is not evidence of a sale: the adapter stops at
 * `limit`, so absence usually just means we did not read that far.
 */
async function runSweep(
  supabase: SupabaseClient,
  dealerId: string,
  sourceUrl: string,
  limit: number
): Promise<{ checked: number; sold: number }> {
  const found = await adapterItems(sourceUrl, limit);
  if (!found) throw new Error('That shop does not publish stock state we can read.');

  const stock = new Map(found.items.map((item) => [productKey(item.sourceUrl), item.available]));

  const { data: rows } = await supabase
    .from('listings')
    .select('id, source_url, sold_at')
    .eq('dealer_id', dealerId);

  const checked: string[] = [];
  const sold: string[] = [];

  for (const row of rows ?? []) {
    if (!row.source_url) continue;
    const available = stock.get(productKey(row.source_url));
    // Absent from the feed is not evidence of a sale: the read stops at `limit`,
    // so a watch we never reached would otherwise be retired for being deep in
    // the catalog.
    if (available === undefined) continue;
    checked.push(row.id);
    if (!available && !row.sold_at) sold.push(row.id);
  }

  const now = new Date().toISOString();
  if (checked.length) {
    await supabase.from('listings').update({ availability_checked_at: now }).in('id', checked);
  }
  if (sold.length) {
    await supabase.from('listings').update({ sold_at: now }).in('id', sold);
  }

  return { checked: checked.length, sold: sold.length };
}

async function prepare(
  sourceUrl: string,
  limit: number
): Promise<{ provider: string; listings: PreparedListing[]; sold: number }> {
  const found = await adapterItems(sourceUrl, limit);

  if (found) {
    const adapter = found.provider;
    // A sold watch would cost an OpenAI call to type and then be thrown away.
    // Drop it here, where the shop's own answer is still in hand.
    const items = found.items.filter((item) => item.available);
    const sold = found.items.length - items.length;
    const failures: unknown[] = [];

    const prepared = await mapPool(items, EXTRACT_CONCURRENCY, async (item) => {
      try {
        const fields = await extractFields(item.title, item.text, item.sourceUrl);
        if (!fields) return null;
        return {
          // The shop's own price and currency are facts. The model only ever saw
          // prose, so it does not get to overrule them.
          fields: {
            ...fields,
            price_cents: item.priceCents ?? fields.price_cents,
            currency: item.currency ?? fields.currency,
          },
          sourceUrl: item.sourceUrl,
          photoUrls: item.photoUrls,
        };
      } catch (error) {
        failures.push(error);
        return null;
      }
    });

    const listings = prepared.filter((item): item is PreparedListing => item !== null);
    // One flaky item should not sink the batch, but a misconfigured key fails
    // every item identically and must be reported rather than read as "0 found".
    if (!listings.length && failures.length) throw failures[0];

    return { provider: adapter, listings, sold };
  }

  const { markdown, provider } = await scrape(sourceUrl);
  const extracted = await extractListings(markdown, sourceUrl);

  return {
    provider,
    // The page path has no stock field to read; the extractor is told to ignore
    // anything the page marks sold, which is a weaker guarantee than a feed.
    sold: 0,
    listings: extracted
      .map((item) => ({
        fields: item,
        sourceUrl: item.source_url ?? sourceUrl,
        photoUrls: item.photo_urls.filter((url) => url.startsWith('http')),
      }))
      .filter((item) => item.photoUrls.length >= MIN_PHOTOS_PER_LISTING)
      .slice(0, limit),
  };
}

async function runImport(
  supabase: SupabaseClient,
  jobId: string,
  userId: string,
  dealerId: string,
  sourceUrl: string,
  limit: number
) {
  try {
    await supabase.from('import_jobs').update({ status: 'running' }).eq('id', jobId);

    const { provider, listings, sold } = await prepare(sourceUrl, limit);
    await supabase.from('import_jobs').update({ provider }).eq('id', jobId);

    // The same fetch that found new stock also says what is gone, so retire the
    // sold ones now rather than waiting for a separate sweep.
    const retired = await runSweep(supabase, dealerId, sourceUrl, limit).catch(() => null);

    // Re-running an import is the normal way to pick up new stock, so the same
    // product URL must not land in the deck twice.
    const { data: seen } = await supabase
      .from('listings')
      .select('source_url')
      .eq('dealer_id', dealerId);
    const known = new Set((seen ?? []).map((row) => productKey(row.source_url)));

    let created = 0;
    let skipped = 0;

    for (const item of listings.slice(0, MAX_LISTINGS_PER_IMPORT)) {
      if (known.has(productKey(item.sourceUrl))) {
        skipped += 1;
        continue;
      }
      known.add(productKey(item.sourceUrl));

      const { data: listing, error } = await supabase
        .from('listings')
        .insert({
          dealer_id: dealerId,
          imported_by: userId,
          import_job_id: jobId,
          source_url: item.sourceUrl,
          ...canonicalBrand(item.fields.brand),
          model: item.fields.model,
          reference: item.fields.reference,
          year: item.fields.year,
          caliber: item.fields.caliber,
          winding: item.fields.winding,
          case_size_mm: item.fields.case_size_mm,
          case_material: item.fields.case_material,
          dial_color: item.fields.dial_color,
          style: item.fields.style,
          complications: item.fields.complications ?? [],
          condition: item.fields.condition,
          has_box: item.fields.has_box,
          has_papers: item.fields.has_papers,
          price_cents: item.fields.price_cents,
          currency: item.fields.currency ?? 'USD',
          description: item.fields.description,
        })
        .select('id')
        .single();

      if (error || !listing) continue;
      created += 1;

      const photoUrls = item.photoUrls.slice(0, MAX_PHOTOS_PER_LISTING);
      if (photoUrls.length) {
        const photos = await copyPhotos(storage(), listing.id, photoUrls);
        await supabase
          .from('listing_photos')
          .insert(photos.map((photo) => ({ ...photo, listing_id: listing.id })));
      }
    }

    await supabase
      .from('import_jobs')
      .update({
        status: 'succeeded',
        listings_created: created,
        error:
          [
            skipped ? `Skipped ${skipped} already imported.` : null,
            sold ? `Skipped ${sold} sold.` : null,
            retired?.sold ? `Retired ${retired.sold} that have since sold.` : null,
          ]
            .filter(Boolean)
            .join(' ') || null,
        finished_at: new Date().toISOString(),
      })
      .eq('id', jobId);
  } catch (error) {
    await supabase
      .from('import_jobs')
      .update({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        finished_at: new Date().toISOString(),
      })
      .eq('id', jobId);
  }
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req: Request, ctx: any) => {
    const userId = ctx.userClaims?.id ?? ctx.jwtClaims?.sub;
    if (!userId) return Response.json({ error: 'Not signed in.' }, { status: 401 });

    let sourceUrl: string;
    let limit: number;
    let dryRun: boolean;
    let sweep: boolean;
    let dealerName: string | undefined;
    let dealerEmail: string | undefined;
    let requestedDealerId: string | undefined;
    try {
      const body = await req.json();
      const requested = Number(body?.limit ?? MAX_LISTINGS_PER_IMPORT);

      sourceUrl = assertPublicHttpUrl(String(body?.sourceUrl ?? ''));
      limit = Math.min(
        Math.max(Number.isFinite(requested) ? Math.trunc(requested) : MAX_LISTINGS_PER_IMPORT, 1),
        MAX_LISTINGS_PER_IMPORT
      );
      dryRun = Boolean(body?.dryRun);
      sweep = Boolean(body?.sweep);
      // A sweep reads stock and nothing else, so it can afford the whole shop
      // where an import has to stop at what it can pay to extract.
      if (sweep) limit = MAX_SWEEP_ITEMS;
      dealerName = typeof body?.dealerName === 'string' ? body.dealerName.trim() : undefined;
      dealerEmail = typeof body?.dealerEmail === 'string' ? body.dealerEmail.trim() : undefined;
      requestedDealerId = typeof body?.dealerId === 'string' ? body.dealerId : undefined;
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : 'Bad request.' },
        { status: 400 }
      );
    }

    // A preview has to leave nothing behind, so it runs before any dealer row
    // exists and answers in the request rather than queueing a job.
    if (dryRun) {
      try {
        const { provider, listings } = await prepare(sourceUrl, limit);
        return Response.json({
          provider,
          listings: listings.map((item) => ({
            ...item.fields,
            source_url: item.sourceUrl,
            photo_count: item.photoUrls.length,
          })),
        });
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : 'Preview failed.' },
          { status: 502 }
        );
      }
    }

    let dealerId: string;
    try {
      dealerId = await resolveDealer(
        ctx.supabase,
        userId,
        sourceUrl,
        requestedDealerId,
        dealerName,
        dealerEmail
      );
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : 'Bad request.' },
        { status: 400 }
      );
    }

    // A sweep touches no OpenAI and writes one column, so it answers in the
    // request instead of queueing a job the operator would have to follow.
    if (sweep) {
      try {
        const result = await runSweep(ctx.supabase, dealerId, sourceUrl, limit);
        return Response.json(result);
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : 'Sweep failed.' },
          { status: 502 }
        );
      }
    }

    const { data: job, error } = await ctx.supabase
      .from('import_jobs')
      .insert({
        user_id: userId,
        dealer_id: dealerId,
        source_url: sourceUrl,
        provider: resolveProvider(),
        status: 'queued',
      })
      .select('*')
      .single();

    if (error || !job) {
      return Response.json({ error: error?.message ?? 'Could not queue import.' }, { status: 500 });
    }

    // Scraping plus extraction takes far longer than a request should. Hand the
    // job back now; the client follows progress on import_jobs over Realtime.
    EdgeRuntime.waitUntil(runImport(ctx.supabase, job.id, userId, dealerId, sourceUrl, limit));

    return Response.json({ job });
  }),
};
