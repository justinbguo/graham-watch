# Scraping options

## The two halves

A refresh is split by what it costs.

**Read the catalogue** (`action: 'sync'`). Ask the shop what it sells and store
one row per product in `source_items`, with a hash of the prose and a hash of
everything else. Costs HTTP and nothing more, so it walks the whole shop —
`MAX_CATALOG_ITEMS`, currently 10000. Idempotent: run it twice and the second run
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
applies. Shopify, Squarespace, and the WooCommerce Store API exist so far.
Shopify and Squarespace covered three of the first four dealers we looked at.

## Platform adapters

Adapters are tried in order and each returns null when the URL is not its platform.
All of them reduce to the same `SourceItem` in `source.ts`, so the importer never
learns which shop software it is talking to.

### Shopify

`shopify.ts` — every Shopify store answers `/products.json` publicly, 250 per page.
It is the richest source we have: `vendor` states the brand outright, so that is the
one field the model never guesses. Prices, SKUs and full galleries come with it.

A collection URL reads `/collections/<handle>/products.json` rather than the whole
shop. Dealers also sell straps, books and tools, so a `product_type` naming one of
those is refused — a denylist, not a list of watch words. `product_type` is the
shop's own taxonomy, not a description: Collectors Corner NY type their watches
`DRESS`, `SPORT`, `DIVER` and `MILITARY/FIELD`, and requiring the word "watch" kept
3 of their 87 available watches. An untyped product is kept, because plenty of shops
leave the field blank. The word "watch" earns a type nothing either — `Watch Straps`
is a strap. A path such as `Jewelry & Watches > … > Wristwatches` is read from its
last segment, so `Accessories` or `Jewelry` earlier in the path does not hold the
watch. Every refusal is returned with its reason and listed in the operator
console, so a wrong call here is visible rather than silent.

Currency lives in `/meta.json`, never in `products.json`. Images take `?width=1500`,
which cut a sample from 592KB to 415KB.

### Squarespace

`squarespace.ts` — the shop's HTML carries the same product record Shopify's
JSON feed would, in a `data-context` attribute: title, prose, price, stock, and
the gallery. An older template (Cool Vintage) has no `data-context`. Its grid
is ordinary HTML: title, price, a sold-out class, and one photo. When that
watch is published, the product page is fetched (robots check, then the same
pause as the collection). Its slideshow, or `data-context` / JSON-LD when those
exist, supplies the gallery. A refresh keeps the longer set: a one-photo read
does not replace photographs already on the listing.
Squarespace's default robots.txt disallows `?format=json`, so the adapter does
not request it.

Squarespace also reads Wind Vintage (`windvintage.com`) from the homepage
image grid, after the Watches heading and before the newsletter block. That
read does not open the sitemap and does not request `?format=json`. Each
page's `PRICE:` line and the last Squarespace button are the price and the
stock. `SALE PENDING` and `SOLD` are not for sale. A page with no price and
no status button is skipped.

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

### WooCommerce

`woocommerce.ts` reads `GET /wp-json/wc/store/v1/products`, 100 products a page,
`stock_status=instock` when the host accepts it. It asks for `orderby=id`
so a later page stays put. When robots.txt disallows that query and allows
the same URL without `orderby` and `order`, the reader uses the allowed URL.
A blocked URL is named in full and returned as HTTP 400, because retrying it
will not change the file. A category URL such as
`/product-category/vintage-watches/` resolves that slug and sends `category=<id>`,
so a shop can be read as one section. `prices.price` is a minor-unit digit string.
With `currency_minor_unit` 2, `"1550000"` is 1550000 cents. `is_in_stock` false,
`is_purchasable` false, or an out-of-stock availability is stored with
`available` false, and so is a category slug `sold` or a title that starts with
`sold`. A live row with no positive price is skipped. A book title and a
display-sign title are skipped in this file, so `hold_reason` stays unset.

### Wix Stores

`wix.ts` reads `/store-products-sitemap.xml` for the product URLs, then each
product page's JSON-LD for title, price, currency, stock, and images. A strap,
advert, or pamphlet still goes through the same not-a-watch guard as the other
adapters.

## Finding the catalog

The `discover` action turns a bare domain into a catalog URL. Product pages vastly
outnumber everything else in a sitemap, so the directory holding the most URLs is the
catalog. Squarespace nests products as `/<collection>/p/<slug>`, so a trailing `/p`
is dropped — the importable URL is the collection.

That same tally is `sitemapProducts`, and it is a count of URLs, not of stock. A
dealer keeps every watch they ever sold published, so Collectors Corner NY list 970
and offer 79. Discovery reads a sitemap and cannot tell those apart. `preview` can:
it walks the shop's feed, writes nothing, and returns every product with the fields
the shop states and whether a catalogue read would keep it. That is what the
**Inspect** button on Add shops calls, and why the two numbers sit in separate
columns instead of one number that is wrong twice over.

It lives in the import function. It needs no secrets and used to run in the CLI, but
the operator UI needs the same answer and a browser cannot read another origin's
sitemap. The operator still overrides the guess with `--url`.

Because it runs on a server, sitemap entries are filtered to the shop's own
registrable domain before anything fetches them. A sitemap is a file the shop
controls, and an unfiltered one could name the cluster's metadata address.

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

Shopify pages `/products.json` at 250 products a page until a short page, which
is the end of the feed, and waits a second between requests. The reader sends
`GrahamBot/0.1` and will not fetch a URL `robots.txt` disallows. A crawl-delay
over 5 seconds is a refusal. A shorter one only slows the read, and it still
has to fit in the run. There is no availability filter on
`products.json`, and Shopify's robots file disallows collection URLs that stack
two `filter` parameters, so the whole feed is what a complete read walks.
A collection handle is still honoured when the catalogue URL already points at
one.

The walk stops incomplete — and absence is not treated as sold — when it hits
40 pages or `MAX_CATALOG_ITEMS` (10000), when a page fails after one retry, or
when a page repeats ids the read already stored. Refreshing starts again at
page 1. It does not resume.

10000 rather than 1000 because the cap counts sold stock. Danny's Vintage
Watches publish about 4300 products and Craft + Tailored about 3700. The old
cap stopped inside the watches still for sale, and the old 10-page stop
(2500 products) did the same, and a stopped read never retired what it had
not seen. Both shops fit under 10000, so a finished read can retire.

Squarespace still pages a collection by the `offset` link in the page HTML, to the same item cap.

The generic scrape path still reads one page only. Crawling — Firecrawl
`/v2/crawl` or Browserbase clicking through — is what that would need.

## What a refresh costs

Reading a catalogue is free: the adapters hit feeds the shop publishes anyway.
Only extraction costs money, at roughly one `gpt-4o-mini` call per changed watch
— on the order of a hundredth of a cent each at current prices, so a 300-watch
first import lands around ten cents and a nightly re-read where five watches
changed is a rounding error.

Nightly automation (`npm run refresh`, GitHub Actions at 06:00 UTC) syncs every
approved shop and auto-publishes new and changed watches. A dealer or operator
can still press Refresh by hand; that path keeps the picker so a person can
choose what to import. The schedule does not, because freshness without a human
in the loop is the point.

Sold detection on that path is evidence-based: a watch the shop marks unavailable
is retired; a watch missing from a **complete** catalogue read is retired; a
truncated read never retires by absence. `listings.sold_source` records who
decided (`feed_unavailable`, `missing_from_catalog`, or `dealer`). A dealer
marking sold by hand sticks across later feeds; a feed-sourced sold clears if
the shop lists the watch again.

Wind Vintage is read from its homepage image grid. For every other shop, the
reader follows the sitemap to each products collection, and skips shelves such
as cameras. A one-page scrape
is never complete, so a page that is not a feed cannot sell the shop's stock
by absence. Shopify reads are sliced into eight pages per request, because one
request cannot hash a catalogue of several thousand products.

`npm run catalogue:audit` fetches those same public feeds and reports watches
the feed is selling that the catalogue does not hold, catalogue rows still
marked for sale that the feed does not, and listings marked sold while the
feed still offers them. It writes nothing.

## Recommendation

Start on `fetch` to test against static dealer sites at no cost. Move to `firecrawl`
when you hit pages it can't render. Only reach for Browserbase or Apify if a
specific site you want defeats both.
