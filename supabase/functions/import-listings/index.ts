import { withSupabase } from 'npm:@supabase/server@^1';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@^2';

import { createClient } from 'npm:@supabase/supabase-js@^2';

import { MAX_CATALOG_ITEMS, readCatalog, syncCatalog } from './catalog.ts';
import { fixtureImportAllowed, parseFixtureListings } from './fixture.ts';
import { ExtractorUnavailable } from './extract.ts';
import { discover, normalizeDomain, readProfile, type Profile } from './discover.ts';
import { DEFAULT_BATCH, MAX_BATCH, SCHEDULED_PUBLISH_BATCH, publishBatch, queuePublish } from './publish.ts';
import { resolveProvider } from './scrape.ts';
import { catalogueComplete, type SkippedItem, type SourceItem } from './source.ts';

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
 * This meters the actions that spend money on a URL nobody here owns yet: a
 * discover, a preview, and a sync that creates a dealer. Refreshing a shop you
 * already own is not counted, so a nightly sweep over every dealer and a dealer
 * reloading their own catalogue are both unaffected. Adding a shop by hand
 * spends two — one to find the catalogue, one to introduce it.
 *
 * Operators get a higher ceiling because seeding the deck is their job: a
 * pasted list of forty shops is the intended use, and ten would refuse the
 * eleventh line. It stays a ceiling rather than an exemption, because the thing
 * it guards against is a loop nobody meant to start.
 */
const NEW_SHOPS_PER_HOUR = 10;
const OPERATOR_NEW_SHOPS_PER_HOUR = 200;

async function assertBudget(userId: string, isOperator: boolean) {
  const ceiling = isOperator ? OPERATOR_NEW_SHOPS_PER_HOUR : NEW_SHOPS_PER_HOUR;
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

  if ((previews.count ?? 0) + (introduced.count ?? 0) >= ceiling) {
    throw new Error(
      `That is this hour's limit of ${ceiling} new shops. Shops already added are unaffected — refreshing and importing them is not limited.`
    );
  }
}

/**
 * Whether the caller may act on shops that are not theirs.
 *
 * Read through the caller's own client, so this is the same answer RLS would
 * give and not a second opinion. Cached for the request because two places ask.
 */
function operatorCheck(supabase: SupabaseClient): () => Promise<boolean> {
  let answer: Promise<boolean> | undefined;

  const ask = async (): Promise<boolean> => {
    const { data, error } = await supabase.rpc('is_operator');
    return error ? false : data === true;
  };

  return () => {
    if (!answer) answer = ask();
    return answer;
  };
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
/**
 * Writes back what the shop's homepage says about itself.
 *
 * Unlike the address just below, this overwrites. All three are read off the
 * page rather than typed by anyone, and a logo URL points into the shop's own
 * CDN, which does not survive a redesign — leaving the stale one in place
 * would mean Refresh could not repair the thing it exists to repair. Nothing
 * found is left alone rather than cleared, so a site that is briefly down does
 * not blank a dealer's page.
 */
async function refreshProfile(supabase: SupabaseClient, dealerId: string, profile: Profile) {
  const patch: Record<string, string> = {};
  if (profile.description) patch.description = profile.description;
  if (profile.instagram) patch.instagram = profile.instagram;
  if (profile.logoUrl) patch.logo_url = profile.logoUrl;

  if (!Object.keys(patch).length) return;

  const { error } = await supabase.from('dealers').update(patch).eq('id', dealerId);
  // A shop's page is not worth failing a catalogue read over.
  if (error) console.error('could not store dealer profile', error.message);
}

async function findDealer(
  supabase: SupabaseClient,
  userId: string,
  sourceUrl: string,
  isOperator: () => Promise<boolean>,
  profile: Profile,
  dealerId?: string,
  name?: string,
  email?: string
): Promise<string | null> {
  // An operator manages every shop by definition — that is what the operator
  // console is. Without this, re-reading a catalogue an operator did not
  // personally introduce is refused, which is most of them once dealers start
  // importing their own.
  const mine = async (row: { claimed_by: string | null; created_by: string | null }) =>
    row.claimed_by === userId || row.created_by === userId || (await isOperator());

  if (dealerId) {
    const { data: owned } = await supabase
      .from('dealers')
      .select('id, claimed_by, created_by')
      .eq('id', dealerId)
      .maybeSingle();

    if (!owned || !(await mine(owned))) {
      throw new Error('You do not manage that dealer.');
    }
    await refreshProfile(supabase, owned.id, profile);
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
  if (!(await mine(existing))) {
    throw new Error('You do not manage that dealer.');
  }

  // Dealers imported before we could read the shop's real name are stuck with
  // their hostname on every card. Re-running the import repairs that.
  if (name && existing.name === host) {
    await supabase.from('dealers').update({ name }).eq('id', existing.id);
  }
  await refreshProfile(supabase, existing.id, profile);
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
  profile: Profile,
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
      description: profile.description,
      instagram: profile.instagram,
      logo_url: profile.logoUrl,
      created_by: userId,
      permission: 'pending',
    })
    .select('id')
    .single();

  // dealers.website is unique, so two requests racing on one domain — a
  // double-clicked button, the same list pasted in two tabs — end with one row
  // and one 23505 rather than a duplicate shop. The loser wants the winner's
  // row, which is what it asked for in the first place.
  if (error?.code === '23505') {
    const { data: raced } = await supabase
      .from('dealers')
      .select('id')
      .eq('website', website)
      .maybeSingle();
    if (raced) return raced.id;
  }

  if (error || !data) throw new Error(error?.message ?? 'Could not create a dealer.');
  return data.id;
}

/**
 * One row per product the read saw, kept or not.
 *
 * Every field the shop's feed states travels, because the question this
 * answers is "why does a shop showing 80 watches report 970 products", and no
 * summary of it was ever the right answer. The prose is the exception: it is
 * the bulk of the payload and there is nothing to learn from it in a table.
 */
function previewFromItems(items: SourceItem[], skipped: SkippedItem[]) {
  const kept = items.map((item) => ({
    source_url: item.sourceUrl,
    external_id: item.externalId,
    title: item.title,
    price_cents: item.priceCents,
    currency: item.currency,
    photo_url: item.photoUrls[0] ?? null,
    photo_count: item.photoUrls.length,
    available: item.available,
    vendor: item.meta?.vendor ?? null,
    product_type: item.meta?.productType ?? null,
    sku: item.meta?.sku ?? null,
    published_at: item.meta?.publishedAt ?? null,
    updated_at: item.meta?.updatedAt ?? null,
    skipped: null as string | null,
  }));

  const dropped = skipped.map((item) => ({
    source_url: item.sourceUrl,
    external_id: null,
    title: item.title,
    price_cents: null,
    currency: null,
    photo_url: null,
    photo_count: item.meta?.photoCount ?? 0,
    available: false,
    vendor: item.meta?.vendor ?? null,
    product_type: item.meta?.productType ?? null,
    sku: item.meta?.sku ?? null,
    published_at: item.meta?.publishedAt ?? null,
    updated_at: item.meta?.updatedAt ?? null,
    skipped: item.reason,
  }));

  return [...kept, ...dropped];
}

function previewCounts(items: SourceItem[], skipped: SkippedItem[]) {
  const forSale = items.filter((item) => item.available).length;
  return {
    read: items.length + skipped.length,
    for_sale: forSale,
    sold: items.length - forSale,
    skipped: skipped.length,
  };
}

function clamp(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value ?? fallback);
  return Math.min(Math.max(Number.isFinite(parsed) ? Math.trunc(parsed) : fallback, 1), max);
}

function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

async function recordSync(
  supabase: SupabaseClient,
  dealerId: string,
  result: Awaited<ReturnType<typeof syncCatalog>>,
  error: string | null = null
) {
  const { error: failed } = await supabase.rpc('record_dealer_sync', {
    p_dealer_id: dealerId,
    p_complete: result.complete,
    p_error: error,
    p_found: result.found,
    p_added: result.added,
    p_changed: result.changed,
    p_retired: result.retired,
    p_relisted: result.relisted,
  });
  if (failed) console.error('could not record dealer sync', failed.message);
}

async function recordSyncFailure(supabase: SupabaseClient, dealerId: string, message: string) {
  const { error: failed } = await supabase.rpc('record_dealer_sync', {
    p_dealer_id: dealerId,
    p_complete: false,
    p_error: message,
  });
  if (failed) console.error('could not record dealer sync failure', failed.message);
}

/**
 * Marks every for-sale catalogue row for publish so the nightly job can drain
 * new watches without a human ticking them. Already-linked rows stay published.
 */
type ApprovedShop = { id: string; name: string; website: string };

function approvedShops(supabase: SupabaseClient) {
  return supabase
    .from('dealers')
    .select('id, name, website')
    .eq('permission', 'approved')
    .not('website', 'is', null)
    .order('name');
}

/**
 * Nightly freshness for exactly one shop.
 *
 * Auth is a shared secret, not a user session, because an operator identity
 * cannot write a claimed shop's catalogue and the service role is what the
 * RPCs already treat as the scheduler.
 *
 * One request does one thing. An isolate has two seconds of CPU and 256MB;
 * refreshing every shop inside one of them is what returned HTTP 546
 * ("CPU Time exceeded") before a single shop had been printed. `phase` is
 * `sync` (read the catalogue) or `publish` (two watches). The script calls
 * publish again while `pending` is non-zero. `bounded` is how it tells this
 * function from an older deploy that drained the whole queue itself.
 */
async function scheduledRefresh(req: Request, body: Record<string, unknown>) {
  const secret = Deno.env.get('GRAHAM_CRON_SECRET');
  if (!secret) return bad('Scheduled refresh is not configured.', 503);

  // The gateway still wants a real JWT (service role from the refresh script).
  // The cron secret is a second door so a leaked service key alone cannot start
  // a full-catalogue publish of every approved shop.
  const offered = req.headers.get('x-graham-cron-secret') ?? '';
  if (offered !== secret) return bad('Not authorized.', 401);

  const supabase = admin();
  const dealerId = typeof body.dealerId === 'string' ? body.dealerId : '';

  // No id used to mean every approved shop, in this same request. That is the
  // call that died with HTTP 546. The script looks the shops up itself and
  // passes one id. Refusing here is also what stops an older script — which
  // would treat a list and an empty `results` as a finished night — from
  // reporting success after writing nothing.
  if (!dealerId) {
    return bad(
      'scheduled-refresh needs one dealerId. One request cannot refresh every shop.',
      400
    );
  }

  const { data: shop, error } = await approvedShops(supabase).eq('id', dealerId).maybeSingle();
  if (error) return bad(error.message, 502);
  if (!shop?.website) return Response.json({ bounded: true, shops: 0, results: [] });

  const approved = shop as ApprovedShop;
  const phase = body.phase === 'publish' ? 'publish' : 'sync';

  try {
    if (phase === 'publish') {
      const published = await publishBatch(
        supabase,
        admin(),
        approved.id,
        SCHEDULED_PUBLISH_BATCH
      );
      return Response.json({
        bounded: true,
        phase,
        shops: 1,
        failed: 0,
        results: [
          {
            dealerId: approved.id,
            name: approved.name,
            website: approved.website,
            ok: true,
            ...published,
          },
        ],
      });
    }

    const sync = await syncCatalog(supabase, approved.id, approved.website, MAX_CATALOG_ITEMS);
    await recordSync(supabase, approved.id, sync);
    await queuePublish(supabase, approved.id);
    const counts = await supabase.rpc('pending_source_item_count', {
      p_dealer_id: approved.id,
    });
    if (counts.error) throw new Error(counts.error.message);
    const pending = counts.data?.[0]?.pending ?? 0;

    return Response.json({
      bounded: true,
      phase,
      shops: 1,
      failed: 0,
      results: [
        {
          dealerId: approved.id,
          name: approved.name,
          website: approved.website,
          ok: true,
          ...sync,
          pending,
          published: 0,
        },
      ],
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Refresh failed.';
    console.error(`${approved.website}: ${message}`);
    if (phase === 'sync') await recordSyncFailure(supabase, approved.id, message);
    const result = {
      dealerId: approved.id,
      name: approved.name,
      website: approved.website,
      ok: false,
      error: message,
    };

    // A missing or rejected key fails every remaining shop the same way.
    if (caught instanceof ExtractorUnavailable && caught.config) {
      return Response.json(
        { error: message, bounded: true, shops: 1, failed: 1, results: [result] },
        { status: 503 }
      );
    }

    return Response.json({ bounded: true, phase, shops: 1, failed: 1, results: [result] });
  }
}

const userFetch = withSupabase({ auth: 'user' }, async (req: Request, ctx: any) => {
    const userId = ctx.userClaims?.id ?? ctx.jwtClaims?.sub;
    if (!userId) return bad('Not signed in.', 401);

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) ?? {};
    } catch {
      return bad('Bad request.');
    }

    const action = String(body.action ?? 'sync');
    const isOperator = operatorCheck(ctx.supabase);

    // A JSON watch, written as the signed-in shop owner. No fetch, no model.
    // Off unless this process is a local stack with the flag set.
    if (action === 'fixture') {
      if (!fixtureImportAllowed(Deno.env)) {
        return bad(
          'Fixture import is off. It runs only on a local stack with GRAHAM_ALLOW_FIXTURE_IMPORT=1, and never against the hosted project.',
          404,
        );
      }
      let parsed: ReturnType<typeof parseFixtureListings>;
      try {
        parsed = parseFixtureListings(body);
      } catch (error) {
        return bad(error instanceof Error ? error.message : 'Bad fixture.');
      }
      const rows = parsed.listings.map((item) => ({
        dealer_id: parsed.dealerId,
        imported_by: userId,
        brand: item.brand,
        model: item.model,
        reference: item.reference,
        year: item.year,
        price_cents: item.price_cents,
        description: item.description,
        currency: 'USD',
        status: 'active' as const,
        source_url: `https://test-bench.graham.test/fixture/${crypto.randomUUID()}`,
      }));
      const inserted = await ctx.supabase
        .from('listings')
        .insert(rows)
        .select('id, brand, model, reference, created_at, dealer_id');
      if (inserted.error) return bad(inserted.error.message, 403);
      return Response.json({
        provider: 'fixture',
        published: inserted.data?.length ?? 0,
        listings: inserted.data ?? [],
      });
    }

    /**
     * Given a domain, where the watches are.
     *
     * Metered like a preview: it writes nothing but reads a dozen pages off a
     * site we do not own, which is not something to leave unbounded just
     * because it is cheap.
     */
    if (action === 'discover') {
      const domain = String(body.domain ?? '').trim();
      if (!domain) return bad('discover needs a domain.');

      // Two refusals, two codes. A bad domain is the caller's mistake and
      // retrying will not help; a budget refusal is temporary and the UI says
      // so. Reporting both as 429 had the operator waiting out an hour for a
      // typo.
      let origin: string;
      try {
        origin = normalizeDomain(domain);
      } catch (error) {
        return bad(error instanceof Error ? error.message : 'That is not a domain.');
      }
      try {
        await assertBudget(userId, await isOperator());
      } catch (error) {
        return bad(error instanceof Error ? error.message : 'Out of budget.', 429);
      }

      try {
        const found = await discover(origin);
        await meter(userId, found.catalogUrl, null, 'succeeded');
        return Response.json(found);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not read that site.';
        await meter(userId, origin, null, 'failed', message);
        return bad(message, 502);
      }
    }

    // Reads any URL on the open web and writes nothing, so a dealer row cannot
    // be the thing that authorises it. The budget is what stops an account
    // pointing us at arbitrary pages all afternoon.
    if (action === 'preview') {
      let sourceUrl: string;
      try {
        sourceUrl = assertPublicHttpUrl(String(body.sourceUrl ?? ''));
      } catch (error) {
        return bad(error instanceof Error ? error.message : 'That is not a URL.');
      }
      try {
        await assertBudget(userId, await isOperator());
      } catch (error) {
        return bad(error instanceof Error ? error.message : 'Out of budget.', 429);
      }

      const limit = clamp(body.limit, MAX_CATALOG_ITEMS, MAX_CATALOG_ITEMS);

      try {
        // Sold watches are returned rather than filtered out. Hiding them is
        // what made a shop's own numbers impossible to reconcile with ours,
        // and the caller can filter a field it can see.
        // One walk. Calling the adapter here and again inside readCatalog
        // fetched robots.txt and the first page twice.
        const found = await readCatalog(sourceUrl, limit);
        const { provider, items, skipped } = found;

        await meter(userId, sourceUrl, null, 'succeeded');
        return Response.json({
          provider,
          complete: catalogueComplete(found, limit),
          counts: previewCounts(items, skipped),
          listings: previewFromItems(items, skipped),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Preview failed.';
        await meter(userId, sourceUrl, null, 'failed', message);
        return bad(message, 502);
      }
    }

    /**
     * Removes one imported watch, files and all.
     *
     * Two identities, on purpose. The RPC runs as the caller so
     * `require_operator` sees who is asking and the delete is refused for
     * anyone else; the bucket cleanup runs as the service role, which is the
     * only identity with write access to `listing-photos` — no policy grants
     * a user session delete there, and adding one would be a second door into
     * every dealer's gallery.
     */
    if (action === 'delete-listing') {
      const listingId = typeof body.listingId === 'string' ? body.listingId : null;
      if (!listingId) return bad('delete-listing needs a listingId.');

      const { data, error } = await ctx.supabase.rpc('operator_delete_listing', {
        p_listing_id: listingId,
      });
      if (error) return bad(error.message, error.code === '42501' ? 403 : 400);

      const paths = (data ?? []) as string[];
      if (paths.length > 0) {
        // Reported, never thrown: the listing is already gone, and failing the
        // request here would tell the operator to retry a delete that cannot
        // happen twice. The cost of a miss is an orphaned file in a bucket.
        const removed = await admin().storage.from('listing-photos').remove(paths);
        if (removed.error) {
          console.error('photo cleanup failed', listingId, removed.error.message);
        }
      }

      return Response.json({ photos: paths.length });
    }

    if (action === 'delete-dealer') {
      const dealerId = typeof body.dealerId === 'string' ? body.dealerId : null;
      if (!dealerId) return bad('delete-dealer needs a dealerId.');

      const { data, error } = await ctx.supabase.rpc('operator_delete_dealer', {
        p_dealer_id: dealerId,
      });
      if (error) return bad(error.message, error.code === '42501' ? 403 : 400);

      const paths = (data ?? []) as string[];
      if (paths.length > 0) {
        const removed = await admin().storage.from('listing-photos').remove(paths);
        if (removed.error) {
          console.error('photo cleanup failed', dealerId, removed.error.message);
        }
      }

      return Response.json({ photos: paths.length });
    }

    if (action === 'queue-publish') {
      if (!(await isOperator())) return bad('Operators only.', 403);

      const dealerId = typeof body.dealerId === 'string' ? body.dealerId : null;
      if (!dealerId) return bad('queue-publish needs a dealerId.');

      try {
        await queuePublish(ctx.supabase, dealerId);
        const counts = await ctx.supabase.rpc('pending_source_item_count', {
          p_dealer_id: dealerId,
        });
        if (counts.error) throw new Error(counts.error.message);
        const pending = counts.data?.[0]?.pending ?? 0;
        return Response.json({ pending });
      } catch (error) {
        return bad(error instanceof Error ? error.message : 'Could not queue.', 502);
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

    // Read here rather than trusted from the caller: Refresh on an existing
    // shop never runs discovery, and that is the button this has to arrive
    // through for the shops already imported.
    const profile = await readProfile(websiteOf(sourceUrl).website);

    let dealerId: string;
    try {
      const found = await findDealer(
        ctx.supabase,
        userId,
        sourceUrl,
        isOperator,
        profile,
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
        await assertBudget(userId, await isOperator());
        dealerId = await createDealer(ctx.supabase, userId, sourceUrl, profile, named, addressed);
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
      await recordSync(ctx.supabase, dealerId, result);

      if (job) {
        await admin()
          .from('import_jobs')
          .update({
            status: 'succeeded',
            provider: result.provider,
            error: result.complete
              ? null
              : 'Stopped before the end of the catalogue. Watches that were not read were left alone.',
            finished_at: new Date().toISOString(),
          })
          .eq('id', job);
      }

      return Response.json({ dealerId, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Refresh failed.';
      await recordSyncFailure(ctx.supabase, dealerId, message);
      if (job) {
        await admin()
          .from('import_jobs')
          .update({ status: 'failed', error: message, finished_at: new Date().toISOString() })
          .eq('id', job);
      }
      return bad(message, 502);
    }
});

/**
 * Seven actions, one function.
 *
 * `scheduled-refresh` is the nightly job: cron secret, service role, and one
 * dealer id. `phase` `sync` reads that shop's catalogue and `phase` `publish`
 * publishes two watches. The script loops. A call with no id is refused,
 * because that used to refresh every shop in the one request. Everything
 * else needs a signed-in user.
 *
 * `discover` turns a domain into the URL its watches live at, writing nothing.
 * `delete-listing` removes one imported watch and its photographs.
 * `sync` reads the shop's catalogue into source_items. It costs HTTP and
 * nothing else on a platform we have an adapter for, so it can walk the whole
 * shop. `publish` drains a bounded slice of the extraction queue and reports
 * what is left, so the caller loops rather than waiting on one long request —
 * that split is what removed the 40-watch ceiling. `preview` writes nothing and
 * exists for the operator scripts.
 */
export default {
  async fetch(req: Request, info?: unknown) {
    if (req.method === 'POST') {
      try {
        const body = (await req.clone().json()) as Record<string, unknown> | null;
        if (body && body.action === 'scheduled-refresh') {
          return scheduledRefresh(req, body);
        }
      } catch {
        // Fall through to the user handler, which reports a bad body.
      }
    }
    return userFetch(req, info as never);
  },
};
