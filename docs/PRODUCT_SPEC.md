# Graham — product spec

Swipe-based discovery app for vintage watches. Buyers swipe a deck of listings and save
the ones they want, then contact the dealer directly. Inventory is imported from dealer
websites by an AI scraper rather than typed in by hand.

Graham never touches the money. It introduces a buyer to a dealer and gets out of the way.

## 1. Two sides, one app

Graham started as a buyer-only app with dealers as rows in a table. It is now two-sided.
A dealer can prove they own their shop and then manage it from inside the app.

The two sides are asymmetric on purpose, and the asymmetry is the product:

- **Buyers** need no invitation. They sign in and swipe.
- **Dealers** are imported before they have ever heard of Graham. Most never claim
  their shop, and the app works for the buyer either way.
- **Operators** — us — are the only ones who can make a shop's inventory public.

What a claim does *not* do is as important as what it does. Claiming a shop lets the
dealer read and edit their own listings and refresh their catalogue. It never sets
`permission`. A dealer who could approve themselves could publish any shop's inventory
by pointing the importer at it, so approval stays with an operator.

## 2. MVP scope

In:

1. Auth — email one-time codes. Apple and Google are built but disabled until
   someone creates the credentials; see `GOOGLE_SIGN_IN_ENABLED` in `src/lib/auth.ts`.
2. Buy — swipe a deck of listings. Left passes, right saves. Cards on a phone,
   a grid on a wide window.
3. Search — ask the catalogue a question, filtered separately from the deck.
4. Saved — the list of right-swipes, with the total it adds up to.
5. Inquiry — from a saved watch, deliberately contact the dealer.
6. Profile — your name, an optional picture, watches you have saved, and the
   shop you have claimed if you have one.
7. Dealer workspace — claim a shop, edit its listings, refresh its catalogue.

Out, deliberately: payments and checkout, in-app messaging between users, ratings and
reviews, moderation and reports, shipping, analytics.

**Ratings and invented data are out, and that rule has teeth.** The dealer panel once
showed a star rating seeded from the dealer id behind a "Sample" label, and a Source tab
once showed a sourcing forum seeded with invented people and posts. Both were removed.
A reader does not see the label; they see 4.7 stars and a name. One invented figure
standing next to true ones makes the true ones unreadable, because now the reader has to
work out which is which. A rating goes in the day a buyer can leave one, and not before.

## 3. Users

| Role | Does |
| --- | --- |
| Buyer | Swipes the deck, saves listings, sends inquiries |
| Dealer | A shop whose inventory is listed. Usually has no account at all |
| Operator | Adds shops from the terminal, and approves them |

A dealer is a row in the database first and an account second. `dealers.claimed_by`
links the row to an account once someone proves the mailbox.

## 4. Permission, and why the schema enforces it

Reproducing a dealer's photos and descriptions is their copyrighted content, and giving
them free leads is not a legal defense. So a dealer carries a `permission` column, and
only `approved` dealers appear in anyone else's deck.

Importing a shop is therefore safe to do early — nothing is public until someone
approves it. Approval happens outside the app, through `npm run dealers -- approve` or
the Supabase dashboard.

The ask is one email: Graham sends buyers straight to the dealer, no fee, no commission.

## 5. Claiming a shop

A claim proves a mailbox, two ways. Both are described in
[OPERATING.md](OPERATING.md#how-a-shop-gets-claimed).

1. **The address on the site.** Sign in with the address in `dealers.contact_email`
   and the shop is offered on Profile. The sign-in link already proved that mailbox.
2. **Any mailbox on the shop's domain.** The dealer types their website and enters a
   code sent to `whoever@their-domain.com`.

A contact address is never printed in full on screen — it appears as
`h•••@their-shop.com`. The dealer knows their own mailbox, so the first letter and the
domain are enough to recognise. Printing it whole would turn the claim screen into a way
to read any shop's contact address, which is exactly what the column grants exist to stop.

## 6. Inquiries

A right swipe only saves. Sending an inquiry is a separate, deliberate act from the
Saved tab, so every inquiry means the buyer actually wants an introduction. Dealers
would otherwise get an email for every idle swipe, which turns a free lead source into
spam.

One inquiry per buyer per listing, enforced by a unique index. The row must name the
listing's own dealer, and the watch must be active, unsold, and from an approved shop —
all four enforced by the insert policy, not just by the button being hidden.

## 7. Import

Two front doors, one pipeline. Everything runs through the `import-listings` edge
function; the operator scripts are HTTP clients, not a second implementation.

1. **Operator** — `npm run dealers -- add <domain>` discovers the catalogue, previews
   what it read, imports, and approves.
2. **Claimed dealer** — the same refresh from inside the app, against their own shop.

The pipeline:

1. A catalogue read fills `source_items` with what the shop currently sells. On Shopify
   and Squarespace this is the shop's own JSON, so it costs HTTP and nothing else.
   Elsewhere the page is scraped and read by a model.
2. Publishing drains a bounded slice of the queue: extract the typed fields, write the
   listing, copy the photographs into storage.
3. Content hashes decide what reruns. A reworded description costs a model call; a price
   cut costs nothing; an unchanged watch costs nothing.

Everything the model is unsure of comes back null rather than guessed.

Scrape providers sit behind one interface so swapping is a config change, not a rewrite.
See [SCRAPING.md](SCRAPING.md).

**Reading a catalogue costs money, so the function meters it.** An account may introduce
ten new shops an hour. Refreshing a shop you already manage is free and uncounted, which
is what keeps the nightly sweep and a dealer's own reload unaffected. The meter is
`import_jobs`, and the account it bills cannot write, edit, or delete its own rows.

## 8. A sold watch never enters the deck

**Rule: if the listing is sold, it does not go in the app.** A buyer who swipes on a sold
watch spends attention on it, then an email, and learns it went months ago from the
dealer's reply.

Shops say this in their own data and we read it rather than guess. Shopify marks every
variant `available`; Squarespace drops `qtyInStock` to zero. Silence is not a sale: a feed
that says nothing about stock is treated as for sale. Sold items are dropped before
extraction, so a watch we cannot sell never costs a model call either.

Importing only ever adds, so stock is re-read. `npm run sweep` walks each approved dealer
and stamps `sold_at` on anything that has gone. A listing missing from the feed is left
alone — the read stops at a limit, so absence means we did not get that far.

`sold_at` is its own column, not a `status`. `status` is what we chose to publish;
`sold_at` is what the market did, and it carries the date. Keeping them apart is what
lets a sold watch stay readable in someone's Saved list, marked "Sold", with the inquiry
button gone.

## 9. Deck behavior

The deck serves listings from approved dealers that the user has not swiped and did not
import, newest first, ranked by the brands chosen at sign-up. Swipes are append-only,
unique on `(actor_id, listing_id)`. Saved is the set of right-swipes — no second table.

A pass is reversible two ways: the undo arrow takes back the last one, and "start over"
puts back every pass at once. Saves are never replayed; they are already in Saved.

## 10. Data model

Postgres on Supabase, RLS on every table. `profiles.id` = `auth.users.id`.

```
profiles        id, handle, avatar_url, bio, first_name, last_name,
                favorite_brands, onboarded_at, created_at
dealers         id, name, website, contact_email, permission, claimed_by,
                created_by, created_at
listings        id, dealer_id, imported_by, import_job_id, source_url, brand,
                brand_key, model, reference, year, caliber, winding,
                case_size_mm, case_material, dial_color, style, complications,
                condition, has_box, has_papers, price_cents, currency,
                description, status, sold_at, availability_checked_at,
                edited_fields, created_at
listing_photos  id, listing_id, source_url, storage_path, position
swipes          id, actor_id, listing_id, direction, created_at
source_items    id, dealer_id, provider, external_id, source_url, raw,
                text_hash, content_hash, available, publish, extracted,
                extracted_hash, applied_hash, photos_hash, error, listing_id,
                first_seen_at, last_seen_at
import_jobs     id, user_id, dealer_id, source_url, provider, status, error,
                listings_created, created_at, finished_at
inquiries       id, listing_id, dealer_id, buyer_id, message, status,
                created_at, sent_at
dealer_claim_codes
                id, dealer_id, requested_by, email, code_hash, salt, attempts,
                created_at, expires_at, consumed_at
```

`dealers.permission`: `pending | approved | revoked`. `listings.status`:
`active | hidden`. `import_jobs.status`: `queued | running | succeeded | failed`.
`swipes.direction`: `left | right`. `inquiries.status`: `pending | sent | failed`.

Access rules: a profile is readable only by its owner. Dealers are readable by anyone
signed in, except `contact_email`, which is revoked at the column level. A listing is
readable if its dealer is approved, or if you imported or claimed it. Swipes and
inquiries are private to their owner, and a shop reads the inquiries for its own
listings once claimed. `import_jobs` is readable by its owner and writable only by the
service role. `dealer_claim_codes` has RLS on and no policies at all. Nobody can approve
a dealer through the app.

Every policy has a test in `npm run test:rls` proving the owner can and a stranger
cannot. An untested policy is an unproven one.

## 11. Client

Expo SDK 57, React Native, TypeScript, Expo Router. Four tabs: Buy, Search, Saved,
Profile. Above 900px wide the deck opens as a browsable grid; see [DESIGN.md](DESIGN.md).
Signed-out users hit an auth gate. Session lives in `expo-secure-store` and refreshes on
foreground. Server state is TanStack Query, keyed through `src/data/keys.ts`. Supabase
types are generated from the schema, never hand-written.

## 12. Known gaps before real users

- No CI. `npm run typecheck` and `npm run test:rls` are run by hand.
- No test coverage outside RLS. The import pipeline and the client have none.
- Demo mode (`src/lib/demo.ts`) reimplements the deck's filter logic in JavaScript, so
  it can drift from `search_listings` without anything noticing.
- The Buy tab holds far more logic than a route should; see
  `.cursor/rules/mobile-architecture.mdc` for the rule it breaks.
- Storage keeps orphaned photo files when a dealer's gallery shrinks. Only
  `npm run dealers -- remove` clears the bucket.
- There is no way in the app to move a claim off an account. An operator clears
  `claimed_by` by hand.

## 13. Next phase, in rough order

Ratings, once a buyer can leave one. A dealer-facing view of their own leads. Payments,
only if the introduction model turns out not to be enough.
