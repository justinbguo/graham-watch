import { withSupabase } from 'npm:@supabase/server@^1';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@^2';

import { extractListings } from './extract.ts';
import { scrape } from './scrape.ts';

const MAX_LISTINGS_PER_IMPORT = 40;
const MAX_PHOTOS_PER_LISTING = 6;

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

async function runImport(
  supabase: SupabaseClient,
  jobId: string,
  userId: string,
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
          seller_id: userId,
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

      const photos = item.photo_urls
        .filter((url) => url.startsWith('http'))
        .slice(0, MAX_PHOTOS_PER_LISTING)
        .map((url, position) => ({ listing_id: listing.id, url, position }));

      if (photos.length) await supabase.from('listing_photos').insert(photos);
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
    try {
      const body = await req.json();
      sourceUrl = assertPublicHttpUrl(String(body?.sourceUrl ?? ''));
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : 'Bad request.' },
        { status: 400 }
      );
    }

    const provider = Deno.env.get('SCRAPE_PROVIDER') ?? 'fetch';
    const { data: job, error } = await ctx.supabase
      .from('import_jobs')
      .insert({ user_id: userId, source_url: sourceUrl, provider, status: 'queued' })
      .select('*')
      .single();

    if (error || !job) {
      return Response.json({ error: error?.message ?? 'Could not queue import.' }, { status: 500 });
    }

    // Scraping plus extraction takes far longer than a request should. Hand the
    // job back now; the client follows progress on import_jobs over Realtime.
    EdgeRuntime.waitUntil(runImport(ctx.supabase, job.id, userId, sourceUrl));

    return Response.json({ job });
  }),
};
