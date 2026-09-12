# Graham — product spec

Swipe-based discovery app for vintage watches. Buyers swipe a deck of listings and save
the ones they want. Sellers don't hand-enter inventory — they paste the URL of a site
they already sell on, and an AI importer reproduces the listings inside Graham.

## 1. MVP scope

In:

1. Auth — email OTP, Apple, Google.
2. Deck — swipe through listings. Left passes, right saves.
3. Saved — the list of right-swipes.
4. Import — seller pastes a URL, AI scrapes it, listings appear under their account.
5. Profile — who you are, your imported listings, sign out.

Out, deliberately, for now: payments and checkout, offers and messaging, admin tooling,
moderation and reports, ratings, shipping, analytics.

## 2. Users

| Role | Does |
| --- | --- |
| Buyer | Swipes the deck, saves listings |
| Seller | Imports listings from a URL they own or sell on |

One account does both. No separate seller signup.

## 3. Import flow

The only way a listing gets into Graham right now.

1. Seller pastes a URL — a shop page, a collection page, or a single listing.
2. The app creates an `import_jobs` row and calls the `import-listings` edge function.
3. The function fetches the page through a scrape provider, which returns clean text.
4. An LLM extracts a typed array of watches against a JSON schema.
5. Rows land in `listings` and `listing_photos`, owned by the seller who imported them.
6. The client watches the job row over Realtime and shows progress.

Extracted per watch: brand, model, reference, year, movement, case size, condition,
box/papers, price, currency, description, photo URLs, and the source URL.

Everything the LLM is unsure of comes back null rather than guessed. The seller can fix
fields later — that edit screen is next phase, not MVP.

Scrape providers sit behind one interface so swapping is a config change, not a rewrite.
See `docs/SCRAPING.md` for the options and the tradeoffs.

## 4. Deck behavior

The deck serves listings the user has not swiped and does not own, newest first.
Swipes are append-only, unique on `(actor_id, listing_id)`. Saved is just the set of
right-swipes — no second table. A pass is not permanent; a future "rewind" only has to
delete a swipe row.

## 5. Data model

Postgres on Supabase, RLS on every table. `profiles.id` = `auth.users.id`.

```
profiles        id, handle, display_name, avatar_url, bio, created_at
listings        id, seller_id, source_url, brand, model, reference, year,
                movement, case_size_mm, condition, has_box, has_papers,
                price_cents, currency, description, status, import_job_id
listing_photos  id, listing_id, url, position
swipes          id, actor_id, listing_id, direction, created_at
import_jobs     id, user_id, source_url, provider, status, error,
                listings_created, created_at, finished_at
```

`listings.status`: `active | hidden`. `import_jobs.status`: `queued | running |
succeeded | failed`. `swipes.direction`: `left | right`.

Access rules: a profile is readable by anyone signed in, writable by its owner. Active
listings and their photos are readable by anyone signed in; only the seller writes them.
Swipes and import jobs are private to their owner.

## 6. Client

Expo, React Native, TypeScript, Expo Router. Four tabs: Deck, Saved, Import, Profile.
Signed-out users hit an auth gate. Session lives in `expo-secure-store` and refreshes on
foreground. Supabase types are generated from the schema, not hand-written.

Screens are routed and wired to live data but visually plain — layout and polish come
after the data path works end to end.

## 7. Next phase, in rough order

Listing detail view and seller edit, offers and messaging, then payments once the
commerce model is settled.
