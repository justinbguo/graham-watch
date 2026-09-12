import { withSupabase } from 'npm:@supabase/server@^1';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@^2';

import { createClient } from 'npm:@supabase/supabase-js@^2';

import { extractListings } from './extract.ts';
import { copyPhotos } from './photos.ts';
import { resolveProvider, scrape } from './scrape.ts';

const MAX_LISTINGS_PER_IMPORT = 40;
const MAX_PHOTOS_PER_LISTING = 6;

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
  dealerId?: string
): Promise<string> {
  if (dealerId) return dealerId;

  const host = new URL(sourceUrl).hostname.replace(/^www\./, '');
  const website = `https://${host}`;

  const { data: existing } = await supabase
    .from('dealers')
    .select('id')
    .eq('website', website)
    .maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await supabase
    .from('dealers')
    .insert({ name: host, website, created_by: userId, permission: 'pending' })
    .select('id')
    .single();

  if (error || !data) throw new Error(error?.message ?? 'Could not create a dealer.');
  return data.id;
}

async function runImport(
  supabase: SupabaseClient,
  jobId: string,
  userId: string,
  dealerId: string,
  sourceUrl: string
) {
  try {
    await supabase.from('import_jobs').update({ status: 'running' }).eq('id', jobId);

    const { markdown } = await scrape(sourceUrl);
    const extracted = (await extractListings(markdown, sourceUrl)).slice(
      0,
      MAX_LISTINGS_PER_IMPORT
    );

    let created = 0;
    for (const item of extracted) {
      const { data: listing, error } = await supabase
        .from('listings')
        .insert({
          dealer_id: dealerId,
          imported_by: userId,
          import_job_id: jobId,
          source_url: item.source_url ?? sourceUrl,
          brand: item.brand,
          model: item.model,
          reference: item.reference,
          year: item.year,
          movement: item.movement,
          case_size_mm: item.case_size_mm,
          condition: item.condition,
          has_box: item.has_box,
          has_papers: item.has_papers,
          price_cents: item.price_cents,
          currency: item.currency ?? 'USD',
          description: item.description,
        })
        .select('id')
        .single();

      if (error || !listing) continue;
      created += 1;

      const sourceUrls = item.photo_urls
        .filter((url) => url.startsWith('http'))
        .slice(0, MAX_PHOTOS_PER_LISTING);

      if (sourceUrls.length) {
        const photos = await copyPhotos(storage(), listing.id, sourceUrls);
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
    let dealerId: string;
    try {
      const body = await req.json();
      sourceUrl = assertPublicHttpUrl(String(body?.sourceUrl ?? ''));
      dealerId = await resolveDealer(ctx.supabase, userId, sourceUrl, body?.dealerId);
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : 'Bad request.' },
        { status: 400 }
      );
    }

    const provider = resolveProvider();
    const { data: job, error } = await ctx.supabase
      .from('import_jobs')
      .insert({
        user_id: userId,
        dealer_id: dealerId,
        source_url: sourceUrl,
        provider,
        status: 'queued',
      })
      .select('*')
      .single();

    if (error || !job) {
      return Response.json({ error: error?.message ?? 'Could not queue import.' }, { status: 500 });
    }

    // Scraping plus extraction takes far longer than a request should. Hand the
    // job back now; the client follows progress on import_jobs over Realtime.
    EdgeRuntime.waitUntil(runImport(ctx.supabase, job.id, userId, dealerId, sourceUrl));

    return Response.json({ job });
  }),
};
