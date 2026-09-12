# Scraping options

The importer is two steps: fetch the page as clean text, then have an LLM pull
typed listings out of it. The fetch step is pluggable — set `SCRAPE_PROVIDER`.
Code lives in `supabase/functions/import-listings/scrape.ts`.

## Fetch step

| Provider | Cost | Handles JS / anti-bot | Effort |
| --- | --- | --- | --- |
| `jina` | free, key raises limits | partial | none — current default |
| `fetch` (built in) | free | no | none |
| `firecrawl` | ~$16/mo, free tier | yes, plus proxies | one API key |
| Browserbase + Stagehand | usage-based | yes, plus clicks and logins | a rewrite of the fetch step |
| Apify | per result | yes, prebuilt site actors | actor picking and tuning |

**`jina`** is the default — `GET https://r.jina.ai/<url>` returns markdown, no signup
needed. The cheapest way to test on real sites. It gives up on heavy anti-bot pages.

**`fetch`** pulls the HTML and strips tags, with no network dependency beyond the
target site. Fine for a static dealer page, useless on anything React-rendered.

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

Start on `jina` to test against real dealer sites at no cost. Move to `firecrawl`
when you hit pages it can't render. Only reach for Browserbase or Apify if a
specific site you want defeats both.
