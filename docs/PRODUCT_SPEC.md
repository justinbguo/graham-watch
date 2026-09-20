# Graham — product spec

Swipe-based discovery app for vintage watches. Buyers swipe a deck of listings and save
the ones they want, then contact the dealer directly. Inventory is imported from dealer
websites by an AI scraper rather than typed in by hand.

Graham never touches the money. It introduces a buyer to a dealer and gets out of the way.

## 1. MVP scope

In:

1. Auth — email one-time codes. Apple and Google are built but off until credentials
   exist; see [AUTH.md](AUTH.md) and `EXPO_PUBLIC_GOOGLE_SIGN_IN`.
2. Onboarding — first name and favourite brands (`profiles.onboarded_at` is the gate).
3. Buy (deck) — swipe through listings. Left passes, right saves. Undo the last pass.
   Wide screens open on a grid; phones on cards. Filters are per-tab.
4. Search — browse and filter the catalogue without burning deck queue.
5. Source — ask the room for a watch. UI is live; data is **in-memory only** until a
   table exists (reload clears posts).
6. Saved — right-swipes, with a header total. Inquiry is a separate deliberate act.
7. Listing detail — full screen from the card or a grid tile; save and inquire here too.
8. Profile — who you are, appearance, sign out.

Importing is an operator job from the terminal (`npm run dealers` / `npm run import`),
not a screen in the app. A buyer has no reason to paste a URL, and giving them one
invites un-permissioned inventory into the deck.

Out, deliberately, for now: payments and checkout, admin tooling, moderation and
reports, real dealer ratings, shipping, analytics, dealer claim UI.

## 2. Users

| Role | Does |
| --- | --- |
| Buyer | Swipes, searches, saves, inquires; can post Source requests (local until persisted) |
| Dealer | A shop whose inventory is listed. Usually has no account at all |

A dealer is a row in the database, not a user. Most are imported before they have ever
heard of Graham. `dealers.claimed_by` links one to a real account if they later sign up.

## 3. Permission, and why the schema enforces it

Reproducing a dealer's photos and descriptions is their copyrighted content, and giving
them free leads is not a legal defense. So a dealer carries a `permission` column, and
only `approved` dealers appear in anyone else's deck.

Importing a shop is therefore safe to do early — nothing is public until someone
approves it. Approval is an operator action (`npm run dealers -- approve`), not an
in-app button: a user who could approve their own import could publish any shop's
inventory. RLS makes self-approval impossible.

The ask is one email: Graham sends buyers straight to the dealer, no fee, no commission.

## 4. Inquiries

A right swipe only saves. Sending an inquiry is a separate act from Saved or the detail
screen, so every inquiry means the buyer wants an introduction.

The `send-inquiry` edge function emails the dealer (Mailpit locally, Resend in
production when `RESEND_API_KEY` is set). The buyer's address is Reply-To. One inquiry
per buyer per listing, enforced by a unique index. A failed send leaves status
`failed` and can be retried on the same row.

## 5. Import flow

The only way a listing gets into Graham right now.

1. Operator runs `npm run dealers -- add <domain>` (or `npm run import -- <url>`).
2. A dealer row is found or created from the hostname, starting at `pending`.
3. The CLI calls the `import-listings` edge function, which creates an `import_jobs` row.
4. Platform adapters (Shopify, Squarespace) run first when they apply; otherwise a
   scrape provider returns clean text.
5. An LLM extracts a typed array of watches against a JSON schema.
6. Rows land in `listings` and `listing_photos`, attributed to the dealer. Photos are
   copied into storage when possible (`storage_path`); `source_url` remains the original.
7. Sold watches are dropped at import when the shop’s data says so. `npm run sweep`
   re-checks approved dealers and stamps `sold_at` when stock disappears.

See [SCRAPING.md](SCRAPING.md). Everything the LLM is unsure of comes back null rather
than guessed.

## 6. Deck behavior

`get_deck` serves listings from approved dealers that the user has not swiped, that are
not sold (`sold_at` is null), and that the user did not import — favourite brands rank
the order; they do not filter it. Swipes are append-only, unique on `(actor_id, listing_id)`.
Saved is the set of right-swipes — no second table.

A pass is reversible: undo deletes the last left swipe and puts that watch back on top.
Start over restores every passed watch into the deck; saves stay out. A sold watch already
in Saved stays visible as “Sold” with inquiry disabled.

## 7. Data model

Postgres on Supabase, RLS on every table. `profiles.id` = `auth.users.id`.

```
profiles        id, handle, first_name, last_name, favorite_brands, onboarded_at,
                avatar_url, bio, created_at
dealers         id, name, website, contact_email, permission, claimed_by,
                created_by, created_at
listings        id, dealer_id, imported_by, import_job_id, source_url, brand,
                brand_key, model, reference, year, caliber, case_size_mm,
                case_material, style, winding, dial_color, complications,
                condition, has_box, has_papers, price_cents, currency,
                description, status, sold_at, availability_checked_at
listing_photos  id, listing_id, source_url, storage_path, position
swipes          id, actor_id, listing_id, direction, created_at
import_jobs     id, user_id, dealer_id, source_url, provider, status, error,
                listings_created, created_at, finished_at
inquiries       id, listing_id, dealer_id, buyer_id, message, status,
                created_at, sent_at
```

RPCs / views used by the client include `get_deck`, `search_listings`,
`listing_facets`, and `dealer_stats`.

`dealers.permission`: `pending | approved | revoked`. `listings.status`:
`active | hidden`. `import_jobs.status`: `queued | running | succeeded | failed`.
`swipes.direction`: `left | right`. `inquiries.status`: `pending | sent | failed`.

Access rules: you can read your own profile. Dealers are readable when signed in.
A listing is readable if its dealer is approved, or if you imported it yourself.
Only the importer writes a listing. Swipes, import jobs, and inquiries are private
to their owner. Nobody can approve a dealer through the app.

Source requests are **not** in Postgres yet — see `src/data/sourcing.ts`.

## 8. Client

Expo SDK 57, React Native, TypeScript, Expo Router. Five tabs: Buy, Search, Source,
Saved, Profile. Above ~900px wide the deck prefers a browsable grid; see
[DESIGN.md](DESIGN.md).

Signed-out users hit an auth gate. Session lives in `expo-secure-store` and refreshes
on foreground. Server state goes through TanStack Query hooks in `src/data/`.
Supabase types are generated from the schema (`npm run db:types`), not hand-written.

Layout: routes in `src/app/`, domain UI in `src/features/`, shared chrome in
`src/components/`, plumbing in `src/lib/`.

Demo mode (`EXPO_PUBLIC_DEMO=1` / EAS `preview`) runs the UI on fixtures with no
backend. See [PHONE.md](PHONE.md) for installable builds.

## 9. Known gaps before real users

- Source has no table — posts die on reload.
- Dealer reputation UI is placeholder numbers (`placeholderReputation`).
- Nothing re-copies a photo when the dealer changes it upstream; `source_url` is kept
  so a future job can diff.
- No dealer-facing product surface. Claim is a column only.
- Hosted Supabase + production EAS secrets are not wired for strangers yet.

## 10. Next phase, in rough order

Persist Source, dealer claim flow, real reputation, then payments only if the
introduction model turns out not to be enough.
