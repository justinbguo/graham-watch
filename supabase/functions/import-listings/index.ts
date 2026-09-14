import { withSupabase } from 'npm:@supabase/server@^1';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@^2';

import { createClient } from 'npm:@supabase/supabase-js@^2';

import { MAX_CATALOG_ITEMS, adapterItems, readCatalog, syncCatalog } from './catalog.ts';
import { DEFAULT_BATCH, MAX_BATCH, publishBatch } from './publish.ts';
import { resolveProvider } from './scrape.ts';
import type { SourceItem } from './source.ts';

let adminClient: SupabaseClient | null = null;

/**
 * Server-side work the caller must not be able to do directly: writing photos
 * into the bucket, and writing the `import_jobs` ledger that meters what each
 * account has spent. The request-scoped client runs as the signed-in user, who
 * has neither grant by design.
 */
function admin(): SupabaseClient {
  adminClient ??= createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );
  return adminClient;
}

/**
 * How many shops one account may introduce per hour.
 *
 * This meters the two actions that spend money on a URL nobody here owns yet:
 * a preview, and a sync that creates a dealer. Refreshing a shop you already
 * own is not counted, so a nightly sweep over every dealer and a dealer
 * reloading their own catalogue are both unaffected. An operator adding a shop
 * by hand spends two.
 */
const NEW_SHOPS_PER_HOUR = 10;

async function assertBudget(userId: string) {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  // Only the priced actions count. A preview belongs to no shop, so it is the
  // ledger rows with no dealer; introducing a shop is the dealer row itself.
  // Counting every job instead would have a sweep over fifteen dealers spend
  // the whole hour's budget on refreshes that cost nothing.
  const [previews, introduced] = await Promise.all([
    admin()
      .from('import_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('dealer_id', null)
      .gte('created_at', since),
    admin()
      .from('dealers')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', userId)
      .gte('created_at', since),
  ]);

  // Fail closed. If the meter cannot be read we do not know what has been
  // spent, and guessing wrong is what the meter exists to prevent.
  if (previews.error || introduced.error) {
    throw new Error('Could not check the import budget. Try again shortly.');
  }

  if ((previews.count ?? 0) + (introduced.count ?? 0) >= NEW_SHOPS_PER_HOUR) {
    throw new Error(
      `That is ${NEW_SHOPS_PER_HOUR} new shops in an hour. Refreshing shops you already manage is not limited.`
    );
  }
}

/** Records a priced action against the account that asked for it. */
async function meter(
  userId: string,
  sourceUrl: string,
  dealerId: string | null,
  status: 'running' | 'succeeded' | 'failed',
  error?: string
): Promise<string | null> {
  const { data, error: failed } = await admin()
    .from('import_jobs')
    .insert({
      user_id: userId,
      dealer_id: dealerId,
      source_url: sourceUrl,
      provider: resolveProvider(),
      status,
      error: error ?? null,
      finished_at: status === 'running' ? null : new Date().toISOString(),
    })
    .select('id')
    .single();

  // History, not a precondition: a shop still refreshes when we cannot record
  // that it did.
  if (failed) console.error('could not write the import ledger', failed.message);
  return data?.id ?? null;
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

function websiteOf(sourceUrl: string): { host: string; website: string } {
  const host = new URL(sourceUrl).hostname.replace(/^www\./, '');
  return { host, website: `https://${host}` };
}

/**
 * The shop this run belongs to, or null when we have never seen it.
 *
 * Split from creating one so the caller can charge the budget for introducing a
 * shop before any row is written. Folding the two together meant a refused run
 * still left a dealer behind, and the next hour that dealer counted as one we
 * already knew.
 */
async function findDealer(
  supabase: SupabaseClient,
  userId: string,
  sourceUrl: string,
  dealerId?: string,
  name?: string,
  email?: string
): Promise<string | null> {
  if (dealerId) {
    const { data: owned } = await supabase
      .from('dealers')
      .select('id, claimed_by, created_by')
      .eq('id', dealerId)
      .maybeSingle();

    if (!owned || (owned.claimed_by !== userId && owned.created_by !== userId)) {
      throw new Error('You do not manage that dealer.');
    }
    return owned.id;
  }

  const { host, website } = websiteOf(sourceUrl);

  // Not contact_email: that column is revoked from `authenticated`, and asking
  // for it fails the whole select, which used to leave every re-import inserting
  // a dealer that already exists.
  const { data: existing } = await supabase
    .from('dealers')
    .select('id, name, claimed_by, created_by')
    .eq('website', website)
    .maybeSingle();

  if (!existing) return null;

  // The same test the dealerId path makes. Every dealer row is readable when
  // signed in, so without this a stranger could name any shop's URL and make us
  // pay for the catalogue read. The writes would fail on RLS a moment later,
  // but the scrape credit and the model call were already spent.
  if (existing.claimed_by !== userId && existing.created_by !== userId) {
    throw new Error('You do not manage that dealer.');
  }

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

// Imported shops rarely have an account, so a dealer row is created from the
// hostname. It starts 'pending' and stays invisible to other users until it is
// approved out-of-band, which is what keeps un-permissioned inventory private.
async function createDealer(
  supabase: SupabaseClient,
  userId: string,
  sourceUrl: string,
  name?: string,
  email?: string
): Promise<string> {
  const { host, website } = websiteOf(sourceUrl);

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

function previewFromItems(items: SourceItem[]) {
  return items.map((item) => ({
    source_url: item.sourceUrl,
    external_id: item.externalId,
    title: item.title,
    price_cents: item.priceCents,
    currency: item.currency,
    photo_url: item.photoUrls[0] ?? null,
    photo_count: item.photoUrls.length,
  }));
}

function clamp(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value ?? fallback);
  return Math.min(Math.max(Number.isFinite(parsed) ? Math.trunc(parsed) : fallback, 1), max);
}

function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

/**
 * Three actions, one function.
 *
 * `sync` reads the shop's catalogue into source_items. It costs HTTP and
 * nothing else on a platform we have an adapter for, so it can walk the whole
 * shop. `publish` drains a bounded slice of the extraction queue and reports
 * what is left, so the caller loops rather than waiting on one long request —
 * that split is what removed the 40-watch ceiling. `preview` writes nothing and
 * exists for the operator scripts.
 */
export default {
  fetch: withSupabase({ auth: 'user' }, async (req: Request, ctx: any) => {
    const userId = ctx.userClaims?.id ?? ctx.jwtClaims?.sub;
    if (!userId) return bad('Not signed in.', 401);

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) ?? {};
    } catch {
      return bad('Bad request.');
    }

    const action = String(body.action ?? 'sync');

    // Reads any URL on the open web and writes nothing, so a dealer row cannot
    // be the thing that authorises it. The budget is what stops an account
    // pointing us at arbitrary pages all afternoon.
    if (action === 'preview') {
      let sourceUrl: string;
      try {
        sourceUrl = assertPublicHttpUrl(String(body.sourceUrl ?? ''));
        await assertBudget(userId);
      } catch (error) {
        return bad(error instanceof Error ? error.message : 'Bad request.', 429);
      }

      const limit = clamp(body.limit, MAX_CATALOG_ITEMS, MAX_CATALOG_ITEMS);

      try {
        const found = await adapterItems(sourceUrl, limit);
        if (found) {
          await meter(userId, sourceUrl, null, 'succeeded');
          return Response.json({
            provider: found.provider,
            listings: previewFromItems(found.items.filter((item) => item.available)),
          });
        }

        const { provider, items } = await readCatalog(sourceUrl, limit);
        await meter(userId, sourceUrl, null, 'succeeded');
        return Response.json({ provider, listings: previewFromItems(items) });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Preview failed.';
        await meter(userId, sourceUrl, null, 'failed', message);
        return bad(message, 502);
      }
    }

    if (action === 'publish') {
      const dealerId = typeof body.dealerId === 'string' ? body.dealerId : null;
      if (!dealerId) return bad('publish needs a dealerId.');

      try {
        const result = await publishBatch(
          ctx.supabase,
          admin(),
          dealerId,
          clamp(body.batch, DEFAULT_BATCH, MAX_BATCH)
        );
        return Response.json(result);
      } catch (error) {
        return bad(error instanceof Error ? error.message : 'Could not publish.', 502);
      }
    }

    if (action !== 'sync') return bad(`Unknown action "${action}".`);

    let sourceUrl: string;
    let limit: number;
    try {
      sourceUrl = assertPublicHttpUrl(String(body.sourceUrl ?? ''));
      limit = clamp(body.limit, MAX_CATALOG_ITEMS, MAX_CATALOG_ITEMS);
    } catch (error) {
      return bad(error instanceof Error ? error.message : 'Bad request.');
    }

    const named = typeof body.dealerName === 'string' ? body.dealerName.trim() : undefined;
    const addressed = typeof body.dealerEmail === 'string' ? body.dealerEmail.trim() : undefined;

    let dealerId: string;
    try {
      const found = await findDealer(
        ctx.supabase,
        userId,
        sourceUrl,
        typeof body.dealerId === 'string' ? body.dealerId : undefined,
        named,
        addressed
      );

      // Refreshing a shop you already manage is free — that is the nightly
      // sweep and a dealer reloading their own catalogue. Introducing one we
      // have never read is the priced act.
      if (found) {
        dealerId = found;
      } else {
        await assertBudget(userId);
        dealerId = await createDealer(ctx.supabase, userId, sourceUrl, named, addressed);
      }
    } catch (error) {
      return bad(error instanceof Error ? error.message : 'Bad request.');
    }

    // Every outbound call has a deadline, so a run that goes wrong throws and
    // is recorded below. A hard kill — wall clock, OOM — still strands its row
    // at 'running' with no process left to update it. Starting a new run for
    // the same shop is the proof that the old one is over.
    const retired = await admin()
      .from('import_jobs')
      .update({
        status: 'failed',
        error: 'Abandoned. A later refresh of this shop superseded it.',
        finished_at: new Date().toISOString(),
      })
      .eq('dealer_id', dealerId)
      .eq('status', 'running');
    if (retired.error) console.error('could not retire stale jobs', retired.error.message);

    // A refresh is now fast enough to answer in the request, so the job row is
    // history rather than something the client has to follow.
    const job = await meter(userId, sourceUrl, dealerId, 'running');

    try {
      const result = await syncCatalog(ctx.supabase, dealerId, sourceUrl, limit);

      if (job) {
        await admin()
          .from('import_jobs')
          .update({
            status: 'succeeded',
            provider: result.provider,
            error: result.complete
              ? null
              : `Stopped at ${limit} watches. Refresh again to read further.`,
            finished_at: new Date().toISOString(),
          })
          .eq('id', job);
      }

      return Response.json({ dealerId, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Refresh failed.';
      if (job) {
        await admin()
          .from('import_jobs')
          .update({ status: 'failed', error: message, finished_at: new Date().toISOString() })
          .eq('id', job);
      }
      return bad(message, 502);
    }
  }),
};
