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
   First-run onboarding asks for a name, a username, an 18+ birthday,
   collection size, favorite brands, vintage-search pain points, and one
   notification permission. Push delivery is not wired yet.
2. Buy — swipe a deck of listings. Left passes, right saves. Dragging up on the
   photograph previews the next watch and returns. Cards on a phone, a grid on
   a wide window.
3. Search — ask the catalogue a question, filtered separately from the deck.
4. Wishlist — the list of right-swipes, with the total it adds up to.
5. Inquiry — from a watch on the wishlist, deliberately contact the dealer.
6. Profile — your name, an optional picture, the posts you have written,
   watches on your wishlist, and the shop you have claimed if you have one.
7. Dealer workspace — claim a shop, edit its listings, refresh its catalogue.
8. Community — post a watch to sell, buy, or trade, or a random post (a find, a
   question, a watch to show), and comment on someone else's. A row under the
   title filters the feed to one kind, or All.
9. Messages — a tab: one thread with a person, or with a shop you asked
   about a watch.

Out, deliberately: payments and checkout, ratings and reviews, moderation and
reports, shipping, analytics.

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
approves it. Approval happens outside the phone app, through the operator UI or
`npm run dealers -- approve`.

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

A right swipe only saves. Writing to the dealer is a separate, deliberate act, so a
dealer never gets a message for an idle swipe.

From the wishlist, **Message** opens the buyer's thread with that shop. One shop is one
thread. The message names the watch, so a second watch from the same shop is another
message in the same thread, not a second conversation. A shop that has not claimed
its account cannot be written to in the app. From that thread, **Email the shop**
is the way the message leaves.

One inquiry per buyer per listing, enforced by a unique index. The row must name the
listing's own dealer, and the watch must be active, unsold, and from an approved shop —
all four enforced by the insert policy, not just by the button being hidden.

**Ask about this watch**, on a listing that is not on the wishlist yet, and **Email the shop**,
on a thread the shop cannot read, both open Gmail with the dealer's address, a
subject, and a message already filled in — the installed app where there is one, a
Gmail compose window otherwise, so a phone without Gmail and a browser both still
reach a draft. The mail is genuinely from the buyer, the reply lands in their inbox,
and it sits in their Sent folder. **Send via Graham** remains for a device with no
mail app: it mails the dealer for them, with their address as Reply-To, and it is
the only path that can confirm the mail actually left.

That difference is recorded rather than smoothed over. `status` stays about Graham's
own send; `opened_at` says a composer was handed over. A draft the buyer abandoned
looks exactly like one they sent, so nothing counts `opened_at` as a delivered lead.

## 7. Import

Three front doors, one pipeline. Everything runs through the `import-listings` edge
function; the operator scripts are HTTP clients, not a second implementation.

1. **Operator** — `npm run dealers -- add <domain>` discovers the catalogue, previews
   what it read, imports, and approves.
2. **Claimed dealer** — the same refresh from inside the app, against their own shop.
3. **Nightly refresh** — `npm run refresh` / GitHub Actions syncs every approved shop
   and auto-publishes new and changed watches (`scheduled-refresh`).

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
ten new shops an hour. An operator may introduce 200. Refreshing a shop you already
manage is free and uncounted, which is what keeps the nightly sweep and a dealer's own
reload unaffected. The meter is `import_jobs`, and the account it bills cannot write,
edit, or delete its own rows.

## 8. A sold watch never enters the deck

**Rule: if the listing is sold, it does not go in the app.** A buyer who swipes on a sold
watch spends attention on it, then an email, and learns it went months ago from the
dealer's reply.

Shops say this in their own data and we read it rather than guess. Shopify marks every
variant `available`; Squarespace drops `qtyInStock` to zero. Silence is not a sale: a feed
that says nothing about stock is treated as for sale. Sold items are dropped before
extraction, so a watch we cannot sell never costs a model call either.

Importing only ever adds, so stock is re-read. `npm run refresh` (and the nightly
Actions job) syncs every approved shop and auto-publishes what is new or changed.
`sold_at` is stamped when the shop says a seen watch is unavailable, or when a
**complete** catalogue read no longer contains a previously linked watch. A listing
missing from an incomplete read is left alone — the read stops at a limit, so
absence then means we did not get that far. `sold_source` records who decided
(`feed_unavailable`, `missing_from_catalog`, or `dealer`); a dealer-marked sold
is never cleared by the feed.

`sold_at` is its own column, not a `status`. `status` is what we chose to publish;
`sold_at` is what the market did, and it carries the date. Keeping them apart is what
lets a sold watch stay readable on someone's wishlist, marked "Sold", with the inquiry
button gone.

## 9. Deck behavior

The deck serves listings from approved dealers that the user has not swiped and did not
import, newest first, ranked by the brands chosen at sign-up. Swipes are append-only,
unique on `(actor_id, listing_id)`. The wishlist is the set of right-swipes — no second table.

A pass is reversible two ways: the undo arrow takes back the last one, and "start over"
puts back every pass at once. Wishlist watches are never replayed; they are already on the wishlist.

## 10. Data model

Postgres on Supabase, RLS on every table. `profiles.id` = `auth.users.id`.

```
profiles        id, handle, collector_number, avatar_url, bio, first_name,
                last_name, date_of_birth, account_type, favorite_brands,
                collecting_years, collection_size, hunting_for,
                notify_new_arrivals, notify_saved_watches,
                search_pain_points, notifications_enabled,
                onboarded_at, created_at
dealers         id, name, website, contact_email, description, instagram,
                logo_url, permission, claimed_by, created_by, created_at,
                last_synced_at, last_sync_complete, last_sync_error,
                last_sync_found, last_sync_added, last_sync_changed,
                last_sync_retired, last_sync_relisted
operators       user_id, note, added_at
dealer_applications
                id, user_id, website, shop_name, brands, volume, status,
                verified_email, verified_at, dealer_id, note, reviewed_by,
                reviewed_at, created_at
listings        id, dealer_id, imported_by, import_job_id, source_url, brand,
                brand_key, model, reference, year, caliber, winding,
                case_size_mm, case_material, dial_color, style, complications,
                condition, has_box, has_papers, price_cents, currency,
                description, status, sold_at, sold_source,
                availability_checked_at, edited_fields, created_at
listing_photos  id, listing_id, source_url, storage_path, position
swipes          id, actor_id, listing_id, direction, created_at
source_items    id, dealer_id, provider, external_id, source_url, raw,
                text_hash, content_hash, available, publish, extracted,
                extracted_hash, applied_hash, photos_hash, error, listing_id,
                first_seen_at, last_seen_at
import_jobs     id, user_id, dealer_id, source_url, provider, status, error,
                listings_created, created_at, finished_at
inquiries       id, listing_id, dealer_id, buyer_id, message, status, opened_at,
                created_at, sent_at
exchange_posts  id, author_id, author_handle, author_number, intent, title,
                price_cents, currency, body, created_at
exchange_comments
                id, post_id, parent_id, author_id, author_handle, author_number,
                body, created_at
exchange_photos id, post_id, storage_path, position
exchange_votes  user_id, post_id, comment_id, value, created_at
dealer_follows  user_id, dealer_id, created_at
conversations   id, opener_id, partner_id, dealer_id, created_at,
                last_message_at
messages        id, conversation_id, sender_id, body, via, listing_id,
                created_at
conversation_reads
                conversation_id, user_id, read_at
dealer_claim_codes
                id, dealer_id, requested_by, email, code_hash, salt, attempts,
                created_at, expires_at, consumed_at
```

`dealers.permission`: `pending | approved | revoked`. `listings.status`:
`active | hidden`. `import_jobs.status`: `queued | running | succeeded | failed`.
`swipes.direction`: `left | right`. `inquiries.status`: `pending | sent | failed`.
`messages.via`: `app | email`. A conversation names exactly one other side:
`partner_id` for a person, `dealer_id` for a shop.

Access rules: a profile is readable only by its owner. Dealers are readable by anyone
signed in, except `contact_email`, which is revoked at the column level. A listing is
readable if its dealer is approved, or if you imported or claimed it. Swipes and
inquiries are private to their owner, and a shop reads the inquiries for its own
listings once claimed. A conversation and its messages are readable by its two sides:
the opener, the other person, and — for a thread with a shop — whoever has claimed that
shop right now. `import_jobs` is readable by its owner and writable only by the
service role. `dealer_claim_codes` has RLS on and no policies at all. Nobody can approve
a dealer through the app.

Every policy has a test in `npm run test:rls` proving the owner can and a stranger
cannot. An untested policy is an unproven one.

## 11. Client

Expo SDK 57, React Native, TypeScript, Expo Router. Five tabs: Buy, Community, Messages,
Wishlist, Profile. Search stays inside the tabs and opens from the bar under the deck's
count. Above 900px wide the deck opens as a browsable grid; see [DESIGN.md](DESIGN.md).
Signed-out users hit an auth gate. Session lives in `expo-secure-store` and refreshes on
foreground. Server state is TanStack Query, keyed through `src/data/keys.ts`. Supabase
types are generated from the schema, never hand-written.

## 12. Known gaps before real users

- CI runs typecheck, a web bundle, the operator UI, the edge functions, and
  `test:rls` on every push. See [OPERATING.md](OPERATING.md#testing).
- The buyer and dealer screens have no tests. The feed parsers and the operator's
  pasted-list parser do.
- Demo mode (`src/lib/demo.ts`) reimplements the deck's filter logic in JavaScript, so
  it can drift from `search_listings` without anything noticing.
- The Buy tab holds far more logic than a route should; see
  `.cursor/rules/mobile-architecture.mdc` for the rule it breaks.
- Storage keeps orphaned photo files when a dealer's gallery shrinks. Only
  `npm run dealers -- remove` clears the bucket.
- There is no way in the app to move a claim off an account without deleting it.
  An operator can clear `claimed_by` by hand. Deleting the account also releases
  the claim and leaves the shop listed.
- Messages poll rather than stream, and nothing notifies anyone: no push, no email
  when a message arrives. A person who does not open the app does not know.
- There is no way to block or report someone, and anyone who has posted can be
  written to.

## 13. Community

The third tab, between Search and Wishlist. Signed-in people post a watch they want to sell,
buy, or trade. Others comment on that post. The comment is the public record. The tab
was named Exchange; the database tables, functions, and code keep that word.

Graham is the board. It does not hold the money, hold the watch, or authenticate it.
Payment and shipping stay between the two people. The author can edit or delete their
own post. A deleted post takes its comments with it.

A selling post requires a price. Every post requires a photo, up to six. The description
sits under the photo. Buying posts are pinned above
the feed; selling and trading stay newest-first under them. A
comment is text alone, in the order it was written, and may answer one other comment.
Replies are one level deep: a reply to a reply attaches to the same root, enforced by a
trigger rather than by the client. The author's `@handle` and collector number are
copied onto the post at insert.

Every post and comment shows its author's photograph and `@handle`. The given
name is the title of their profile, not the byline. A reply starts with that
`@handle` in the text, and the writer can delete it.
Tapping that line opens the person. The screen title is the name. Under it are
the photograph, the username, the collector number, and the posts they have
written. Profiles stay readable only by their owner, so the page is
built from the author the board already returned and from `exchange_posts`,
which anyone signed in can read. It is not the Profile tab. The wishlist, a
claimed shop, and settings stay there. Your own posts are listed on the Profile
tab as well, and a tap opens the thread here. The name and photograph reach the board
through `exchange_feed`, `exchange_thread`, and `exchange_post_author` —
security-definer functions that return a name and an avatar and nothing else
about the person.

Anyone signed in can vote a post or a comment up or down, once, and change or take back
that vote. Votes go through `exchange_vote`; the client cannot write the table. Scores
are public and can be negative; who voted is not shown. Votes do not change the order of
the feed, which stays newest-first.

## 14. Messages

The Messages tab, between Community and Wishlist. One thread per pair of people, and one per shop a buyer has written to. A conversation
has two sides and no member list: `opener_id` is whoever wrote first, and the other side
is `partner_id` or `dealer_id`. A shop's side is `dealers.claimed_by`, read live, so a
shop that claims its account later inherits the threads already addressed to it.

A conversation with a person starts from their post, their comment, or their
username on the Messages tab. A conversation with a shop starts from Message
beside Follow, on the shop's page and on a listing's dealer panel, or from
Message on a saved watch. The username is an exact handle, resolved by
`conversation_with_handle`, because `profiles` is readable only by its owner.
There is no directory of people. The same field filters the threads you are
in, by name, handle, and message text. The shop button calls
`conversation_with_dealer`, which opens the same thread `dealer_conversation`
already keeps, one per shop.

Sending an inquiry still emails the shop. A trigger also drops that message into the
buyer's thread with the shop, marked `via = 'email'` and naming the listing. Until the
shop is claimed, nobody can write in that thread — enforced by the insert policy, not by
hiding a button — and the app says the reply arrives by email.

The client never writes `conversations.last_message_at` or `conversation_reads`: a
trigger bumps the first, `mark_conversation_read` writes the second. Unread is counted
per person as messages after their read mark that they did not send.

The list, a thread's header, and starting a conversation go through security-definer
functions, because the other side's name and photograph live in `profiles`, which is
readable only by its owner.

## 15. Next phase, in rough order

Ratings, once a buyer can leave one. A dealer-facing view of their own leads. Payments,
only if the introduction model turns out not to be enough.
