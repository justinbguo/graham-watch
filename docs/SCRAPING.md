# Scraping options

The importer is two steps: fetch the page as clean text, then have an LLM pull
typed listings out of it. The fetch step is pluggable — set `SCRAPE_PROVIDER`.
Code lives in `supabase/functions/import-listings/scrape.ts`.

Before either step it tries a platform adapter, which is always better when it
applies. Only Squarespace exists so far.

## Platform adapters

`squarespace.ts` — adding `?format=json` to any Squarespace URL returns the page's
own data: title, prose, price, and the full image gallery. No markup parsing, no
guessing which text belongs to which watch.

It reads in two passes. The collection URL gives the list, then each product URL is
fetched for the detail, because a collection entry is only what the shop chose to
show in a grid — usually a truncated teaser and a partial gallery. The product page
wins on conflict; collection values are the floor. A product URL is already the
detail page, so it skips the second pass.

The shop's own price and currency override anything the model infers, because the
model only ever sees prose. A `0.00` price means "enquire", not free, and is stored
as null.

This costs one HTTP request per listing. Imports are capped at 40, and requests run
four at a time, so a dealer sees ordinary traffic.

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

Not implemented. Today one URL means one page. A shop with 200 watches across 10
pages imports only what's on the URL you paste. Crawling — Firecrawl `/v2/crawl` or
Browserbase clicking through — is the next step if paging matters.

## Recommendation

Start on `fetch` to test against static dealer sites at no cost. Move to `firecrawl`
when you hit pages it can't render. Only reach for Browserbase or Apify if a
specific site you want defeats both.
