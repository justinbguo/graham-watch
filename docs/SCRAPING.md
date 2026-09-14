# Scraping options

## The two halves

A refresh is split by what it costs.

**Read the catalogue** (`action: 'sync'`). Ask the shop what it sells and store
one row per product in `source_items`, with a hash of the prose and a hash of
everything else. Costs HTTP and nothing more, so it walks the whole shop —
`MAX_CATALOG_ITEMS`, currently 500. Idempotent: run it twice and the second run
writes nothing.

**Publish** (`action: 'publish'`). Take a bounded slice of the queue, type each
watch, and merge it into a listing. Costs one model call per watch whose prose
changed. The response says how many are left and the caller calls again.

That split is the whole design. Before it, one request had to read, type, and
write everything, which capped an import at 40 watches and lost the lot if the
invocation ran out of wall clock. Now the shop's size only decides how many
times the caller loops, and a failed batch costs that batch.

Three things follow from storing the catalogue:

- **A refresh updates, it does not only insert.** A price cut on the shop's own
  site reaches the deck. It used to be frozen at whatever it was on import day.
- **The model runs only on reworded prose.** `text_hash` covers title and
  description; `content_hash` also covers price, stock and photos. A price
  change moves the second and not the first, so it is free.
- **Hand corrections survive.** `listings.edited_fields` records every column a
  human changed, written by a database trigger rather than by the app, and
  `apply_source_item` skips those columns. A dealer fixes a reference number
  once.

## Fetching

The fetch step is pluggable — set `SCRAPE_PROVIDER`. Code lives in
`supabase/functions/import-listings/scrape.ts`.

Before it, the reader tries a platform adapter, which is always better when it
applies. Shopify and Squarespace exist so far; they covered three of the first four
dealers we looked at.

## Platform adapters

Adapters are tried in order and each returns null when the URL is not its platform.
All of them reduce to the same `SourceItem` in `source.ts`, so the importer never
learns which shop software it is talking to.

### Shopify

`shopify.ts` — every Shopify store answers `/products.json` publicly, 250 per page.
It is the richest source we have: `vendor` states the brand outright, so that is the
one field the model never guesses. Prices, SKUs and full galleries come with it.

A collection URL reads `/collections/<handle>/products.json` rather than the whole
shop. Dealers also sell straps, books and tools, so products whose `product_type`
does not look like a watch are skipped — but an untyped product is kept, because
plenty of shops leave the field blank. Currency lives in `/meta.json`, never in
`products.json`. Images take `?width=1500`, which cut a sample from 592KB to 415KB.

### Squarespace

`squarespace.ts` — adding `?format=json` to any Squarespace URL returns the page's
own data: title, prose, price, and the full image gallery. No markup parsing, no
guessing which text belongs to which watch.

It reads in two passes, and they happen at different times. The collection URL
gives the list during the catalogue read. Each product URL is fetched later, in
the publish batch, because a collection entry is only what the shop chose to show
in a grid — usually a truncated teaser and a partial gallery. The product page wins
on conflict; collection values are the floor.

Hydrating during the catalogue read is what made a large Squarespace shop
impossible: one HTTP request per watch, 300 watches, inside one invocation.
Hydrating at publish time means only watches someone is actually adding cost a
request, four at a time, which is ordinary traffic for the dealer.

The shop's own price and currency override anything the model infers, because the
model only ever sees prose. A `0.00` price means "enquire", not free, and is stored
as null.

## Finding the catalog

`scripts/discover.mjs` turns a bare domain into a catalog URL. Product pages vastly
outnumber everything else in a sitemap, so the directory holding the most URLs is the
catalog. Squarespace nests products as `/<collection>/p/<slug>`, so a trailing `/p`
is dropped — the importable URL is the collection.

It runs in the CLI, not the edge function: it needs no secrets, and the operator has
to be able to see and override what it guessed with `--url`.

Shop names come from Shopify's `/meta.json`, then `<title>`, then `og:site_name`.
Title beats `og:site_name` because shops truncate it — Goldfinger's Vintage publishes
just "Goldfinger" there.

## Fetch step

For everything that is not a known platform.

The provider is chosen automatically: `firecrawl` if `FIRECRAWL_API_KEY` is set,
otherwise `jina` if `JINA_API_KEY` is set, otherwise `fetch`. Set `SCRAPE_PROVIDER`
to override.

| Provider | Cost | Handles JS / anti-bot | Effort |
| --- | --- | --- | --- |
| `fetch` (built in) | free | no | none — current default |
| `jina` | free tier | partial | one API key |
| `firecrawl` | ~$16/mo, free tier | yes, plus proxies | one API key |
| Browserbase + Stagehand | usage-based | yes, plus clicks and logins | a rewrite of the fetch step |
| Apify | per result | yes, prebuilt site actors | actor picking and tuning |

**`fetch`** is the default because it needs nothing configured. It pulls the HTML and
converts it to text, keeping `<img>` and `<a>` targets as absolute URLs — strip those
first and the photos are gone before the model ever sees them. Fine for a static
dealer page, useless on anything React-rendered. When a page returns under 200
characters, that is the symptom.

**`jina`** — `GET https://r.jina.ai/<url>` returns clean markdown. It used to work
anonymously; it now answers 401 without `JINA_API_KEY`. The free tier is generous and
this is the cheapest good option.

**`firecrawl`** — my recommended default once you're spending money. One call to
`POST /v2/scrape` with `formats: ['markdown']`, `onlyMainContent: true`. Renders JS,
rotates proxies, strips boilerplate. Already implemented; set `FIRECRAWL_API_KEY`.

**Browserbase + Stagehand** — a real browser you drive with natural language
("click load more until it stops"). Reach for this when a target needs login,
infinite scroll, or "next page" clicking. More moving parts than the others.

**Apify** — a marketplace of per-site scrapers. Worth checking whether an actor
already exists for the sites you care about; that beats generic scraping on
structure and reliability.

**Monid** is a CLI that fronts several of these behind one catalog, including paid
Apify endpoints. It needs an API key from app.monid.ai, which isn't configured on
this machine — worth a look if you'd rather not hold accounts with each vendor.

## Extract step

Currently OpenAI structured outputs: a strict JSON schema, one call, nulls for
anything the page doesn't state. `supabase/functions/import-listings/extract.ts`.
Model is `OPENAI_MODEL`, defaulting to `gpt-4o-mini` — check what's current before
you rely on that.

Alternatives worth knowing: Anthropic tool-use gives the same strictness; Firecrawl's
own `/v2/extract` takes a schema and skips the separate LLM call, at the cost of
tying extraction quality to the scrape vendor.

## Pagination

Both adapters page their own feeds, to `MAX_CATALOG_ITEMS` (500). A read that
hits the cap reports `complete: false`; running it again reads no further today,
because paging restarts from the top — a shop with more than 500 products needs
a cursor stored on the dealer, which is the next piece of work here.

The generic scrape path still reads one page only. Crawling — Firecrawl
`/v2/crawl` or Browserbase clicking through — is what that would need.

## What a refresh costs

Reading a catalogue is free: the adapters hit feeds the shop publishes anyway.
Only extraction costs money, at roughly one `gpt-4o-mini` call per changed watch
— on the order of a hundredth of a cent each at current prices, so a 300-watch
first import lands around ten cents and a nightly re-read where five watches
changed is a rounding error.

The reason refreshing is still a button a dealer presses is not cost. It is that
nobody has decided what should happen to a watch a schedule finds — publish it
unseen, or hold it. Until that is decided, a schedule would either put
un-reviewed extractions in front of buyers or quietly pile up a queue.

## Recommendation

Start on `fetch` to test against static dealer sites at no cost. Move to `firecrawl`
when you hit pages it can't render. Only reach for Browserbase or Apify if a
specific site you want defeats both.
