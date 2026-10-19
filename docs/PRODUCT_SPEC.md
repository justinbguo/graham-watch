# Graham — product spec

Swipe-based discovery app for vintage watches. Buyers swipe a deck of listings and save
the ones they want, then contact the dealer directly. Inventory is imported from dealer
websites by an AI scraper rather than typed in by hand.

Graham does not run checkout for a watch sale today. It introduces a buyer to a dealer
and gets out of the way. **Graham Pro** is a separate subscription for using the app
(see [§16](#16-monetization)). **Marketplace fees** on completed deals through Graham
are planned; they are not built yet.

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
   collection size, favorite brands, vintage-search pain points, one
   notification permission, then **Graham Pro** on iOS/Android when RevenueCat is
   configured (subscribe, restore, or skip). Push delivery is not wired yet.
2. Buy — swipe a deck of listings. Left passes, right saves. Dragging up on the
   photograph previews the next watch and returns. Cards on a phone, a grid on
   a wide window.
3. Search — ask the catalogue a question, filtered separately from the deck.
4. Wishlist — the list of right-swipes, with the total it adds up to.
5. Inquiry — from a watch on the wishlist, deliberately contact the dealer.
6. Profile — your name, an optional picture, the posts you have written,
   watches on your wishlist, and the shop you have claimed if you have one.
7. Dealer workspace — claim a shop; **Seller hub** tab when claimed; edit listings on Profile or Hub.
8. Community — post a watch to sell, buy, or trade, or a random post (a find, a
   question, a watch to show), and comment on someone else's. A row under the
   title filters the feed to one kind, or All.
9. Messages — a tab: one thread with a person, or with a shop you asked
   about a watch. **Deals** — either side can propose a price in the thread
   (peer or shop; not groups yet). Placeholder UI for Apple Pay hold; see
   [TRANSACTIONS.md](TRANSACTIONS.md).
10. **Graham Pro (subscriptions)** — RevenueCat on native iOS/Android: entitlement
    `graham_pro`, monthly and yearly plans, custom paywall UI, restore, and
    subscription management via the store sheet. Settings shows plan status.
    **No feature gates yet** — the paywall is shown at the end of onboarding and
    from Settings; the rest of the app does not require `graham_pro`. See
    [REVENUECAT.md](REVENUECAT.md).

**In progress / planned (monetization):**

- **Feature gating** — decide which surfaces require `graham_pro` and enforce with
  `useGrahamPro()` (not shipped).
- **Deal payment** — Apple Pay hold on `conversation_deals` (schema and UI
  placeholder shipped; payment not wired).
- **Settlement and payouts** — release holds, pay sellers, ledger for Graham fees.

Out, deliberately (for now): full **escrow** outside the deal hold, **payouts**
automation to dealers without a claimed shop account, ratings and reviews,
moderation and reports, shipping labels, product analytics. Off-thread email
inquiries still bypass Graham money.

Out for **group chats**: deals (for now).

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

The ask is one email: Graham sends buyers straight to the dealer. There is **no
marketplace fee** on that path today. A future fee applies only when Graham is the
place the deal closes, not when the app only introduces the parties.

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
conversations   id, opener_id, partner_id, dealer_id, is_group, members_key,
                created_at, last_message_at
conversation_members
                conversation_id, user_id, joined_at
messages        id, conversation_id, sender_id, body, via, listing_id,
                created_at
conversation_reads
                conversation_id, user_id, read_at
conversation_deals
                id, conversation_id, message_id, proposed_by, buyer_id, seller_id,
                amount_cents, currency, listing_id, status, fee_bps, fee_cents,
                payment_provider, payment_intent_id, created_at, updated_at
dealer_claim_codes
                id, dealer_id, requested_by, email, code_hash, salt, attempts,
                created_at, expires_at, consumed_at
```

`dealers.permission`: `pending | approved | revoked`. `listings.status`:
`active | hidden`. `import_jobs.status`: `queued | running | succeeded | failed`.
`swipes.direction`: `left | right`. `inquiries.status`: `pending | sent | failed`.
`messages.via`: `app | email`. A direct conversation names exactly one other side:
`partner_id` for a person, `dealer_id` for a shop. A group sets `is_group` and
leaves both empty. Its people are `conversation_members`, and `members_key` is
their ids sorted so the same set is one group.

Access rules: a profile is readable only by its owner. Dealers are readable by anyone
signed in, except `contact_email`, which is revoked at the column level. A listing is
readable if its dealer is approved, or if you imported or claimed it. Swipes and
inquiries are private to their owner, and a shop reads the inquiries for its own
listings once claimed. A conversation and its messages are readable by its sides:
the opener, the other person, every member of a group, and — for a thread with a shop —
whoever has claimed that shop right now. `import_jobs` is readable by its owner and writable only by the
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
- **Graham Pro** does not gate the deck, wishlist, or messages yet. Web and demo
  mode skip RevenueCat entirely.
- **Marketplace fees** are not implemented; Community and inquiries have no
  take rate or settlement.

## 13. Community

The third tab, between Search and Wishlist. Signed-in people post a watch they want to sell,
buy, or trade. Others comment on that post. The comment is the public record. The tab
was named Exchange; the database tables, functions, and code keep that word.

Graham is the board. It does not hold the money, hold the watch, or authenticate it
today. Payment and shipping stay between the two people until marketplace checkout
and fees exist. The author can edit or delete their own post. A deleted post takes
its comments with it.

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

The Messages tab, between Community and Wishlist. One thread per pair of people, one per shop a buyer has written to, and one per set of people in a group. A shop thread is already the chat with that buyer, so messaging them opens it instead of a second thread. A direct conversation
has two sides and no member list: `opener_id` is whoever wrote first, and the other side
is `partner_id` or `dealer_id`. A shop's side is `dealers.claimed_by`, read live, so a
shop that claims its account later inherits the threads already addressed to it. A group
is `is_group` with both of those empty. The people in it are rows in `conversation_members`.
`create_group` writes the thread and those rows together. It needs two other people —
one is a direct thread — and it holds at most twelve. The same set returns the group
that already exists.

A conversation with a person starts from their profile, the plus
on the Messages tab, or an exact username in the thread search. A conversation
with a shop starts from Message beside Follow, on the shop's page and on a
listing's dealer panel, or from Message on a saved watch. The plus opens New
message as a sheet. The field is first. Create a group is the row under it. The field calls
`suggest_people`, which returns at most eight
accounts and never the caller. An empty field returns the people you already
talk to, including people you share a group with, then the earliest members by
collector number. Typing narrows it to a
username or name prefix. Choosing Create a group opens New group chat, a second
sheet. The name is optional and at most 40 characters. Create calls
`create_group`, which stores that name. The same set returns the group that
already exists, and a name fills in only when that group has none. Later,
`rename_group` changes it. Any member may call it, and an empty name clears
it. A stranger cannot. The thread uses the name, or the other people when
there is none. `conversation_with_handle` still resolves
one exact handle. Both exist because `profiles` is readable only by its owner.
The field under the title filters the threads you are in, by name, handle, and
message text. The shop button calls `conversation_with_dealer`, which opens the
same thread `dealer_conversation` already keeps, one per shop.

Sending an inquiry still emails the shop. A trigger also drops that message into the
buyer's thread with the shop, marked `via = 'email'` and naming the listing. Until the
shop is claimed, nobody can write in that thread — enforced by the insert policy, not by
hiding a button — and the app says the reply arrives by email.

The client never writes `conversations.last_message_at` or `conversation_reads`: a
trigger bumps the first, `mark_conversation_read` writes the second. Unread is counted
per person as messages after their read mark that they did not send.

The list, a thread's header, and starting a conversation go through security-definer
functions, because the other side's name and photograph live in `profiles`, which is
readable only by its owner. Tapping that photograph in the list or thread header
opens the dealer's shop or the collector's profile; the rest of the row still
opens the conversation.

## 15. Roadmap (claimed-shop marketplace)

See [MARKETPLACE.md](MARKETPLACE.md).

1. **Shop inbox** — buyer threads for a claimed shop (shipped).
2. **Deal workflow** — accept, then pay; statuses beyond propose/decline/cancel.
3. **Deal payment** — Apple Pay hold; capture, fee, seller payout. See
   [TRANSACTIONS.md](TRANSACTIONS.md).
4. **Push** — message, inquiry, and deal events.
5. **Shop profile** — edit description, socials, and logo in-app.
6. **Graham Pro** — collector feature gates; store review.
7. **Deals in groups** — when buyer/seller roles exist for multi-party threads.
8. **Ratings** — only after a buyer can complete a real transaction on Graham.

## 16. Monetization

### Graham Pro (shipped, native only)

| Piece | Behavior |
| --- | --- |
| Billing | [RevenueCat](https://www.revenuecat.com/) + Apple/Google subscriptions |
| Entitlement | `graham_pro` |
| Plans | `monthly`, `yearly` (current offering in dashboard) |
| Paywall | Graham UI (`GrahamPaywall`), end of onboarding + Settings → View plans |
| Identity | `Purchases.logIn(supabaseUserId)` |
| Docs | [REVENUECAT.md](REVENUECAT.md), [PHONE.md](PHONE.md#subscriptions-revenuecat) |

Subscriptions are **for the app**, not for buying a watch from a dealer.

### Transaction fees on deals (in progress)

Graham charges a **transaction fee** when a buyer pays into an in-thread **deal**
(`conversation_deals`). Default **5%** (`fee_bps = 500`), shown as an estimate on
the offer. The fee is taken at payment/settlement, not when the message is sent.

That is separate from **Graham Pro** and separate from **email introduction** to a
dealer with no deal.

**Shipped:** deal rows, offer/decline/cancel, thread UI, fee estimate. **Not shipped:**
Apple Pay, holds, capture, payouts, ledger.

Details: [TRANSACTIONS.md](TRANSACTIONS.md).

## 17. Messages — deals

Either party in a **writable** direct or **claimed shop** thread can tap **Offer
deal**, name a USD amount, and post a `DealCard`. The buyer will pay with Apple Pay
(placeholder). Group threads refuse deals until roles are defined.

Shop threads: the buyer offers to buy or the shop offers to sell. Peer threads: pick
sell or buy when offering.

Statuses today: `proposed`, `declined`, `cancelled`. Future: `accepted`, `funded`,
`completed`, `expired`.
