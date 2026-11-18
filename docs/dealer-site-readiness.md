# Dealer site readiness

Read-only check on 28 October 2026 of whether a catalogue refresh can turn five
dealer sites into listings. Nothing here was written to Supabase. No edge
function was invoked, no API key was used, and the model that types a watch
was not called. Every request identified as `GrahamBot/0.1` and waited about a
second before the next one.

A **catalogue read** asks the shop what it sells and stores one row per product.
It tries platform feeds before anything else:

1. **Shopify.** `GET /products.json` (250 products a page) plus `/meta.json` for
   the currency. The shop's vendor, price, stock flag, and gallery are copied
   as data. The model later reads the title and description for reference,
   year, and the rest.
2. **Squarespace.** The collection page's HTML `data-context` (robots.txt
   disallows `?format=json`). Same idea: title, prose, price, stock, gallery.
   An older template puts title, price, and sold-out in the product-list HTML.
   The gallery is on the product page slideshow, read at publish. Wind Vintage
   is the homepage image grid, then each watch page.
3. **WooCommerce.** `GET /wp-json/wc/store/v1/products` with `stock_status=instock`.
   A `/product-category/<slug>/` URL limits the read to that category.
4. **Wix Stores.** `/store-products-sitemap.xml`, then JSON-LD on each product page.
5. **Otherwise** it downloads one HTML page and asks the model to find the
   watches on that page. It does not follow "next".

Discovery guesses the catalogue URL by counting sitemap paths. The directory
that holds the most URLs wins. A refresh keeps at most **1,000** watches
(`MAX_CATALOG_ITEMS`) and at most **10** Shopify pages (2,500 products). A
read that hits the cap is marked incomplete, and a later refresh starts over
at page 1 rather than resuming. The importer does not read `robots.txt`.

Publishing a row needs at least 3 photos and keeps at most 6. Shopify image
URLs are requested at `width=1500`.

## Verdicts

| Site | Fetch | Where the watches live | Verdict |
| --- | --- | --- | --- |
| [Wind Vintage](https://www.windvintage.com/) | 200, Squarespace, no challenge | Homepage image grid, then each watch page. `SALE PENDING` and `SOLD` are not for sale. | **Ready** |
| [Tropical Watch](https://tropicalwatch.com/) | 200, custom app, no challenge | Server-rendered pages, 15 per page. Terms forbid automated access. | **Needs real work / avoid** |
| [Craft + Tailored](https://www.craftandtailored.com/) | 200, Shopify feed | `/products.json`, USD, 3,687 products | **Ready with small changes** |
| [Collectors Corner NY](https://collectorscornerny.com/) | 200, Shopify feed | `/products.json`, USD, 1,006 products, 94 for sale | **Ready as-is** |
| [Danny's Vintage Watches](https://dannysvintagewatches.com/) | 200, Shopify feed | `/products.json`, USD, 4,314 products | **Ready with small changes** |

## Wind Vintage

The homepage image grid under the Watches heading is the catalogue. Each
linked page is one watch. The Squarespace adapter reads that grid and does
not open the sitemap, which is the sold archive and the press section.

A page carries the title, the prose, a `PRICE: $X (Item SBUXYT####)` line,
photos on `images.squarespace-cdn.com`, and a Squarespace button. A dollar
button is for sale. `SALE PENDING` and `SOLD` are not for sale, so a later
refresh marks the listing sold and clears that if the button is a price
again. A page with no price and no status button is skipped. A watch that
drops off the grid is retired when the read finishes. Bracelets and straps
use the same not-a-watch hold as every other shop.

`GrahamBot` is not named in robots.txt, so it falls under `User-agent: *`,
which allows ordinary pages and disallows `?format=json`. The reader does
not request that query.

## Tropical Watch

**Needs real work / avoid.** The pages are clean and server-rendered. The
terms of use forbid the access a refresh would be doing, and the importer
would not walk the list even if they did not.

### Fetch

`https://tropicalwatch.com/` returned 200 (31KB). The app is not Shopify
(`/products.json` 404) and not Squarespace. Asset URLs look like a Rails app
(`/assets/application-<hash>.css`). No challenge and no 403. `/watches`
redirects to the homepage. `/p/shop` is a separate Webflow site
(`tropical-watch.webflow.io`) on the same domain.

### Where the listings are

The homepage is the inventory, rendered as HTML: 15 watches, each with a
title, a dollar price, and a URL like
`/watches/1981-rolex-daytona-6263-silver-dial-with-topical-subdials/tcot`.
`rel="next"` points at `/?page=2`. Pages 2 through 7 are the same shape, 15
priced watches, none repeated. Page 8 is the hinge (12 prices, 3 rows whose
text says `Sold`). Page 10 is entirely `Sold`, and page 30 is still 15 sold
watches with a next link. The sitemap lists **9,750** `/watches/<slug>/<id>`
URLs, which is the whole history at 15 per page.

A product page is also server-rendered. Schema.org `Product` JSON on the
Daytona sample states brand Rolex, model Daytona, reference 6263, year 1981,
price 133850.00 USD, and `InStock`, plus a 629-character description. The
photo gallery is in the HTML, not in that JSON block (the JSON names one
image). The `<img src>` file is a 1440×960 JPEG. The `srcset` `2x` file is
2880×1920. The HTML-to-text step keeps `src` and never looks at `srcset`, so
a generic scrape would store the 1440px file and leave the larger one behind.

`/watches.json` is not a feed; it redirects home. There is no Shopify or
Squarespace endpoint.

### What the current pipeline would do

Discovery counts sitemap parents. Watch URLs have three segments, so each
watch is its own directory of one URL. `/p/shop` has about 2,075 children and
wins. That URL is the Webflow marketing site. The Squarespace probe there
returns HTML, the platform comes back as generic, and the refresh scrapes
that one page. Overriding the URL to the homepage scrapes 15 watches and
stops. Sold rows on later pages are labeled `Sold` in the HTML, which the
generic prompt tells the model to skip, but those pages are never fetched.

### robots.txt and terms

`robots.txt` allows `/` and disallows `/watches/*/inquire`, `/watches/search`,
and `/search`. The sitemap is hosted on `sitemaphosting7.com`; the URLs inside
it are still `tropicalwatch.com`, so discovery can read it.

The terms of use at `/terms` are explicit. They forbid accessing the service
"through automated or non-human means, whether through a bot, script, or
otherwise", and they forbid distributing "any automated system, including any
spider, robot, … scraper" and "any data mining, robots, or similar data
gathering and extraction tools." That is the reason to stay away, ahead of
the engineering gap.

### If they ever say yes

The technical piece is a new reader: follow `/?page=N` on the homepage, treat
a `Sold` prefix as unavailable, and read brand, reference, year, and price
from the product page's JSON-LD, taking gallery URLs from the `srcset` `2x`
image. It is a small adapter in the same family as Squarespace. It is not a
change to run before they agree.

## Craft + Tailored

**Ready with small changes.** The Shopify feed is the one the importer already
speaks. Two ceilings and one word in the skip list are what stand between a
refresh and the whole shop.

### Fetch

Homepage, `robots.txt`, `/products.json`, and `/meta.json` all returned 200.
Cloudflare sits in front and answered with the catalogue, not a challenge.
`page=1` through `page=8` returned distinct products (no repeated ids).

### Catalogue

`/meta.json`: name Craft + Tailored, currency **USD**, **3,687** published
products, 62 collections. Discovery lands on `/products`, and the Shopify
adapter reads `/products.json`.

Of the first 2,000 products:

| | |
| --- | ---: |
| Kept as watches | 1,991 |
| For sale | 91 |
| For sale inside the first 1,000 kept | 81 |
| For sale with a price | 91 |
| For sale with at least 3 photos | 91 |
| Reference-like token in the title | 84 of 91 |

The for-sale count had already leveled off at 91 by product 1,750, so the
unread tail (products 2,001–3,687) is the sold archive. Books (4) and
Accessories (5) were skipped by the existing denylist. **Seven for-sale
products are typed `Merch`.** That word is not in the denylist, so those seven
would be imported as watches.

Vendor is a real brand on most rows (Rolex 27, Omega 6, Longines 5, …). Eight
for-sale rows use vendor `Other`, and five use `Craft & Tailored`. The adapter
glues the vendor onto the front of the title when the title does not already
contain it, and the model is told the title carries the brand. `Other 1940s
Elgin …` is how a military Elgin would be presented. Descriptions are long
(thousands of characters) and usually include the year. SKUs are internal
codes (`RLXDJ1603-66/3`), not the reference; the reference is in the title
(`Ref. 1603`). Originals are about 1920px wide. `?width=1500` returned a JPEG.

Sold watches stay in the feed with `available: false`. That is the signal a
refresh already knows how to retire, but only for rows the read actually saw.

### The gap

A refresh stops at 1,000 kept watches. That window holds 81 of the 91 watches
for sale and then marks the read incomplete, so absence will not retire
anything. Shopify paging also stops after 10 pages (2,500 products), and this
shop has 3,687, so raising only the 1,000 cap still leaves the sold archive
unread. Both limits have to move, or the read needs the cursor the scraping
notes already call for.

### robots.txt and terms

Robots is the current Shopify storefront file: public product and collection
HTML is described as crawlable, `User-agent: *` is `Allow: /`, and a comment
points shopping agents at `/agents.md` and a UCP endpoint. The same comment
is on the other two Shopify shops; it is the platform template.

`/policies/terms-of-service` is Shopify's standard terms. Prohibited uses
include "to spam, phish, pharm, pretext, spider, crawl, or scrape". That
clause and the robots file disagree. Onboarding should have the dealer's own
yes, the same as any other shop. It is not a special block on this site.

## Collectors Corner NY

**Ready as-is.** This is the shop the Shopify denylist was written for, and a
live read still fits inside one catalogue pass.

### Fetch

Homepage and `/products.json` returned 200. `/meta.json` returned **503 once**,
then 200 on the next two tries, with currency USD. A single failed `meta.json`
would leave currency empty; the model is allowed to fill it from the prose
later, and a retry of the same URL succeeded immediately. Not a reason to
wait.

### Catalogue

`/meta.json`: Collectors Corner NY, **USD**, **1,006** products, 17
collections.

| | |
| --- | ---: |
| Products | 1,006 (pages 1–4 full, page 5 has 6) |
| Kept | 990 |
| For sale | 94, all inside the 1,000 cap |
| For sale with a price and at least 3 photos | 94 |
| Reference-like token in the title | 80 of 94 |

The read stays under the cap, so it would be marked complete and sold-by-absence
is allowed to run. Product types on the for-sale rows are the shop's own words
(`DRESS` 38, `SPORT` 37, `DIVER` 7, and so on), which is why the denylist is a
list of non-watches rather than a requirement that the type say "watch".
Skipped in this read: 10 signs, 4 accessories, 2 pairs of sunglasses. Vendor
is the brand (Rolex 37, Universal Genève 15, Patek Philippe 7, …). Four
for-sale rows are vendor `Other`. SKUs are sparse; the reference is in the
title or the body. Sample originals are about 3200–3900px wide, and
`?width=1500` returned a JPEG. Descriptions run about 1,000–1,800 characters.

The numbers in `docs/SCRAPING.md` (970 products, ~80 for sale) are stale.
The shape they describe is the same shape this read saw.

### robots.txt and terms

Same Shopify robots template as Craft + Tailored. The terms page that is
linked from the footer forbids harvesting customer information and attacking
the site. A search of that page did not find a catalogue-scraping clause.

## Danny's Vintage Watches

**Ready with small changes.** Same Shopify feed, same field quality, and the
shop is large enough that today's ceilings drop a large part of what is for
sale. The vendor field is also the shop's name on a lot of rows.

### Fetch

Homepage, `/products.json`, and `/meta.json` returned 200. One product
sitemap (`sitemap_products_3.xml`) returned 503; the others returned 200.
Discovery only needs the sitemap to guess `/products`, and `/products.json`
itself paged cleanly with no repeated ids. Page 8 was still a full 250.

### Catalogue

`/meta.json`: Danny's Vintage Watches, **USD**, **4,314** published products,
15 collections.

The probe walked 8 pages (2,000 products) and stopped there on purpose:

| | |
| --- | ---: |
| Kept in those 2,000 | 1,965 |
| For sale in those 2,000 | 582 |
| For sale inside the first 1,000 kept | 462 |
| For sale with a price | 582 |
| For sale with fewer than 3 photos | 1 |
| Reference-like token in the title | 391 of 582 |

Page 8 still added 19 for-sale watches, and 2,314 products were not read, so
the for-sale total is higher than 582. The 1,000 cap misses at least the 120
already seen past it, plus whatever is in the unread half. The 10-page Shopify
stop (2,500 products) ends before product 4,314 even if the cap is lifted.

Deposits and a few other rows with no photo are dropped (the first pass saw
"Deposit for Rolex DJ 16220" and similar). Product type is blank on 510 of
the 582 for-sale rows; a blank type is kept, which is what we want. Three
for-sale rows are typed `Sculpture` and would be kept too.

**Vendor `Danny's Vintage Watches` is on 132 of those 582 for-sale rows.**
The adapter would title them `Danny's Vintage Watches 1989 Rolex …` whenever
the shop name is not already in the title. The other vendors are real brands
(Rolex 187, Audemars Piguet 72, Piaget 40, …). SKUs are stock numbers
(`11760`), not references. References that are not in the title showed up in
the description on the rows sampled earlier; descriptions are long (about
3,000 characters) and originals are about 3000px wide.

### The two changes

1. Let a read walk past 2,500 products and past 1,000 kept watches, or store
   a cursor. Until then a refresh of this shop is a partial catalogue and
   will not retire a watch merely because it disappeared.
2. Do not treat the dealer's own name as the brand. Skip `Sculpture` the same
   way signs are skipped.

### robots.txt and terms

Same Shopify robots template. `/policies/terms-of-service` returned 200. A
search for scrape, crawl, robot, automated, and harvest did not match. That
is a keyword check of one page, not a legal review.

## What this did not prove

The model was not asked to type a watch, so brand and reference judgments
above are what the feed states, not what `gpt-4o-mini` would emit. Image
pixel sizes were measured on one Tropical Watch file (the `src` and the
`srcset` `2x`) and taken from Shopify's own `width` field otherwise.
Craft + Tailored and Danny's were not paged to the last product; the totals
3,687 and 4,314 are `/meta.json`'s `published_products_count`.

## Classic Watch NY (12 Nov 2026)

The sections above are the 28 October 2026 snapshot of five other shops. This
note does not change those verdicts.

Classic Watch NY (`https://classicwatchny.com`) publishes a WooCommerce Store
API. On 12 Nov 2026 the feed had 2,123 products. The Sold category had 1,966
and the Watches category had 142. `per_page` 100 is 22 pages. `stock_status`
is not the sold signal. A price of $0 is not published. `robots.txt` allowed
`/` on that date.
