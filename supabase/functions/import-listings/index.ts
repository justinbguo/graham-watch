import { withSupabase } from 'npm:@supabase/server@^1';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@^2';

import { createClient } from 'npm:@supabase/supabase-js@^2';

import { extractFields, extractListings, type ExtractedFields } from './extract.ts';
import { copyPhotos } from './photos.ts';
import { mapPool } from './pool.ts';
import { resolveProvider, scrape } from './scrape.ts';
import { fetchShopifyItems } from './shopify.ts';
import type { SourceItem } from './source.ts';
import { fetchSquarespaceItems } from './squarespace.ts';

const MAX_LISTINGS_PER_IMPORT = 40;
const MAX_PHOTOS_PER_LISTING = 6;

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
  name?: string
): Promise<string> {
  if (dealerId) return dealerId;

  const host = new URL(sourceUrl).hostname.replace(/^www\./, '');
  const website = `https://${host}`;

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
    return existing.id;
  }

  const { data, error } = await supabase
    .from('dealers')
    // The hostname is a poor name to show on a card, but it is the only one we
    // have when the caller cannot read the shop's own.
    .insert({ name: name || host, website, created_by: userId, permission: 'pending' })
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
const ADAPTERS: Record<string, (url: string, limit: number) => Promise<SourceItem[] | null>> = {
  shopify: fetchShopifyItems,
  squarespace: fetchSquarespaceItems,
};

async function prepare(
  sourceUrl: string,
  limit: number
): Promise<{ provider: string; listings: PreparedListing[] }> {
  let items: SourceItem[] | null = null;
  let adapter = '';

  for (const [name, run] of Object.entries(ADAPTERS)) {
    items = await run(sourceUrl, limit);
    if (items?.length) {
      adapter = name;
      break;
    }
  }

  if (items?.length) {
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

    return { provider: adapter, listings };
  }

  const { markdown, provider } = await scrape(sourceUrl);
  const extracted = await extractListings(markdown, sourceUrl);

  return {
    provider,
    listings: extracted.slice(0, limit).map((item) => ({
      fields: item,
      sourceUrl: item.source_url ?? sourceUrl,
      photoUrls: item.photo_urls.filter((url) => url.startsWith('http')),
    })),
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

    const { provider, listings } = await prepare(sourceUrl, limit);
    await supabase.from('import_jobs').update({ provider }).eq('id', jobId);

    // Re-running an import is the normal way to pick up new stock, so the same
    // product URL must not land in the deck twice.
    const { data: seen } = await supabase
      .from('listings')
      .select('source_url')
      .eq('dealer_id', dealerId);
    const known = new Set((seen ?? []).map((row) => row.source_url));

    let created = 0;
    let skipped = 0;

    for (const item of listings.slice(0, MAX_LISTINGS_PER_IMPORT)) {
      if (known.has(item.sourceUrl)) {
        skipped += 1;
        continue;
      }
      known.add(item.sourceUrl);

      const { data: listing, error } = await supabase
        .from('listings')
        .insert({
          dealer_id: dealerId,
          imported_by: userId,
          import_job_id: jobId,
          source_url: item.sourceUrl,
          brand: item.fields.brand,
          model: item.fields.model,
          reference: item.fields.reference,
          year: item.fields.year,
          movement: item.fields.movement,
          case_size_mm: item.fields.case_size_mm,
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
        error: skipped ? `Skipped ${skipped} already imported.` : null,
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
    let dealerName: string | undefined;
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
      dealerName = typeof body?.dealerName === 'string' ? body.dealerName.trim() : undefined;
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
        dealerName
      );
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : 'Bad request.' },
        { status: 400 }
      );
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
