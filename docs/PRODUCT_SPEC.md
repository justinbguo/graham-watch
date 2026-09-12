# Graham — product spec

Swipe-based discovery app for vintage watches. Buyers swipe a deck of listings and save
the ones they want, then contact the dealer directly. Inventory is imported from dealer
websites by an AI scraper rather than typed in by hand.

Graham never touches the money. It introduces a buyer to a dealer and gets out of the way.

## 1. MVP scope

In:

1. Auth — email one-time codes. Apple and Google are built but disabled until
   someone creates the credentials; see `GOOGLE_SIGN_IN_ENABLED` in `src/lib/auth.ts`.
2. Deck — swipe through listings. Left passes, right saves.
3. Saved — the list of right-swipes.
4. Inquiry — from a saved watch, deliberately contact the dealer.
5. Profile — who you are, appearance, sign out.

Importing is an operator job run from the terminal (`npm run import`), not a screen
in the app. A buyer has no reason to paste a URL, and giving them one invites
un-permissioned inventory into the deck.

Out, deliberately, for now: payments and checkout, in-app messaging, admin tooling,
moderation and reports, ratings, shipping, analytics.

## 2. Users

| Role | Does |
| --- | --- |
| Buyer | Swipes the deck, saves listings, sends inquiries |
| Dealer | A shop whose inventory is listed. Usually has no account at all |

A dealer is a row in the database, not a user. Most are imported before they have ever
heard of Graham. `dealers.claimed_by` links one to a real account if they later sign up.

## 3. Permission, and why the schema enforces it

Reproducing a dealer's photos and descriptions is their copyrighted content, and giving
them free leads is not a legal defense. So a dealer carries a `permission` column, and
only `approved` dealers appear in anyone else's deck.

Importing a shop is therefore safe to do early — nothing is public until someone
approves it. Approval happens outside the app, through the Supabase dashboard, because
a user who could approve their own import could publish any shop's inventory.

The ask is one email: Graham sends buyers straight to the dealer, no fee, no commission.

## 4. Inquiries

A right swipe only saves. Sending an inquiry is a separate, deliberate act from the
Saved tab, so every inquiry means the buyer actually wants an introduction. Dealers
would otherwise get an email for every idle swipe, which turns a free lead source into
spam.

One inquiry per buyer per listing, enforced by a unique index.

## 5. Import flow

The only way a listing gets into Graham right now.

1. Someone pastes a URL — a shop page, a collection page, or a single listing.
2. A dealer row is found or created from the hostname, starting at `pending`.
3. `npm run import -- <url>` calls the `import-listings` edge function, which creates
   an `import_jobs` row.
4. The function fetches the page through a scrape provider, which returns clean text.
5. An LLM extracts a typed array of watches against a JSON schema.
6. Rows land in `listings` and `listing_photos`, attributed to the dealer.
7. The client watches the job row over Realtime and shows progress.

Extracted per watch: brand, model, reference, year, movement, case size, condition,
box/papers, price, currency, description, photo URLs, and the source URL.

Everything the LLM is unsure of comes back null rather than guessed. Editing imported
fields is next phase, not MVP.

Scrape providers sit behind one interface so swapping is a config change, not a rewrite.
See `docs/SCRAPING.md` for the options and the tradeoffs.

## 6. Deck behavior

The deck serves listings from approved dealers that the user has not swiped and did not
import, newest first. Swipes are append-only, unique on `(actor_id, listing_id)`. Saved
is just the set of right-swipes — no second table. A pass is not permanent; a future
"rewind" only has to delete a swipe row.

## 7. Data model

Postgres on Supabase, RLS on every table. `profiles.id` = `auth.users.id`.

```
profiles        id, handle, display_name, avatar_url, bio, created_at
dealers         id, name, website, contact_email, permission, claimed_by,
                created_by, created_at
listings        id, dealer_id, imported_by, import_job_id, source_url, brand,
                model, reference, year, movement, case_size_mm, condition,
                has_box, has_papers, price_cents, currency, description, status
listing_photos  id, listing_id, url, position
swipes          id, actor_id, listing_id, direction, created_at
import_jobs     id, user_id, dealer_id, source_url, provider, status, error,
                listings_created, created_at, finished_at
inquiries       id, listing_id, dealer_id, buyer_id, message, status,
                created_at, sent_at
```

`dealers.permission`: `pending | approved | revoked`. `listings.status`:
`active | hidden`. `import_jobs.status`: `queued | running | succeeded | failed`.
`swipes.direction`: `left | right`. `inquiries.status`: `pending | sent | failed`.

Access rules: profiles and dealers are readable by anyone signed in. A listing is
readable if its dealer is approved, or if you imported it yourself. Only the importer
writes a listing. Swipes, import jobs, and inquiries are private to their owner. Nobody
can approve a dealer through the app.

## 8. Client

Expo, React Native, TypeScript, Expo Router. Three tabs: Deck, Saved, Profile. Above
900px wide the deck becomes a browsable grid; see [DESIGN.md](DESIGN.md).
Signed-out users hit an auth gate. Session lives in `expo-secure-store` and refreshes on
foreground. Supabase types are generated from the schema, not hand-written.

Screens are routed and wired to live data but visually plain — layout and polish come
after the data path works end to end.

## 9. Known gaps before real users

- Inquiries are recorded but nothing emails the dealer yet.
- Photos are hot-linked from the dealer's site. They need copying into Supabase
  Storage: sites block hotlinking and URLs rot.
- Server state is hand-rolled per screen. It needs a query cache.
- No dealer-facing view at all. Approval happens in the Supabase dashboard.

## 10. Next phase, in rough order

Send the inquiry emails, listing detail view, dealer claim flow, then payments only if
the introduction model turns out not to be enough.
