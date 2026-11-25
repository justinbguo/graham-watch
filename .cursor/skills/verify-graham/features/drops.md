# Follow and Drops

A buyer follows a shop. A watch that shop lists after the follow shows up in Messages, with an unseen count on that tab, and, when the buyer has a push token, as one notification. A follower with no token is skipped and the reason is counted.

## Sub-features

- `follow-shop`: the buyer follows an approved shop.
- `drop-after-follow`: a listing created after the follow is eligible. The shelf listing created before the follow is not.
- `notify-one`: one `drop_notifications` row per buyer per UTC day, and one push.
- `skip-no-token`: a follower with new watches and no device is counted as `noTokenWithListings` and gets no row.
- `unseen-badge`: Messages shows the unseen count until the buyer opens the drops list or the shop.

## How to get to it (user POV)

- Open a shop and press `Follow`.
- After a new watch is listed, open Messages. The first row reads `New from dealers you follow` with a count. On a phone-width window the Messages tab reads `Messages, N`. Profile keeps the Following list and does not show that row, an `N new` count, or a tab badge.
- Press that row to open `New watches` at `/drops`. Opening it, or opening the shop, clears the count.
- A push tap opens that shop's drops when every watch in the push is from one shop (`/drops?dealerId=<id>`). Otherwise it opens `/drops`.

## Driving it with control-graham

Preconditions:

- `doctor` reports the local API ready.
- `seed` has run. Test Bench is approved and has the shelf listing `SHELF-1`. `buyer` has a push token. `quiet` does not.
- `reset-proof` has cleared today's `drop_notifications` for those two users and any previous `DROP-1` listings. `verify-drops` does this itself.

- **Follow.** As the buyer, follow Test Bench. Run `node .cursor/skills/verify-graham/control-graham.mjs follow buyer dealer`. JSON includes `dealerId` and `followedAt`. Repeat with `follow quiet dealer`.
- **List a watch after the follow.** Run `node .cursor/skills/verify-graham/control-graham.mjs import`. JSON `published` is 1 and `listings[0].reference` is `DROP-1`. This call does not use OpenAI.
- **Notify.** Run `node .cursor/skills/verify-graham/control-graham.mjs notify-drops`. The response `sent` is 1. `skipped.noTokenWithListings` is at least 1. `captured` has one message.
- **Read the row.** Run `node .cursor/skills/verify-graham/control-graham.mjs drops-status buyer`. `notifications` has one row, `title` `New watches`, `status` `sent`, `dealer_id` equal to the follow's `dealerId`, and `listing_ids` containing the imported id. `unseen` is greater than 0.
- **Read the skip.** Run `node .cursor/skills/verify-graham/control-graham.mjs drops-status quiet`. `notifications` is empty and `captured` is empty.
- **See it.** Run `web`, then `tour <dealerId>`. That signs in once and writes `messages.png`, `profile.png`, `drops.png`, `deep-link.png`, and `drops-messages.webm`. The Messages button name matches `New from dealers you follow, N` with N greater than 0. At 390px wide the tab name matches `Messages, N`. Profile shows `Test Bench, verified` and no drops row.
- **One screen.** `screenshot /messages <evidence>/messages.png --as buyer` checks the row and the tab. `screenshot /profile` checks that Profile no longer carries the count.
- **Whole flow.** Run `node .cursor/skills/verify-graham/control-graham.mjs verify-drops` or `npm run verify:drops`. Exit 0, and the evidence files still exist after cleanup.

The captured push title is `New watches`. The body is `1 new watch from Test Bench`. `data.kind` is `drop`, `data.dealerId` is the shop, and `data.dropNotificationId` is the row id. That dealer id is the deep link `/drops?dealerId=<id>`. A push with no dealer id opens `/drops`.

## Gotchas

- A watch listed before the follow, including `SHELF-1`, is not a drop. Following Test Bench does not announce the shelf.
- A watch older than 14 days is not a drop. The seeded Goldfinger's catalogue is older than that window. Do not follow that shop in this proof.
- The drops list is a buyer read. A Rolex, or a watch whose year is after 1985, is not in it. The push reads `drop_candidate_listings`, which keeps a watch only when `listing_on_deck` passes: active, unsold, three photos, an approved shop, and that same buyer rule. A one-photo watch, a hidden or sold watch, and a paused shop are not announced. `DROP-1` is brand Fixture, year 1968, with three photos on approved Test Bench, so this proof still counts it.
- One row per buyer per UTC day. A second `notify-drops` the same day returns `alreadyClaimed` and sends nothing. Run `reset-proof` before a second proof.
- No push token means no row. The Messages count does not need a token, so `quiet` can still have `unseen` greater than 0. The skip is the absence of a row and a push, plus `skipped.noTokenWithListings`.
- Opening `/drops` or `/drops?dealerId=<id>` calls `mark_drops_seen` and the badge goes to 0. The tour screenshots Messages and Profile before it opens the feed. Opening a shop still clears that shop.
- The capture server must be the only push target. If `captured` is empty, the run failed even when the function returns `sent: 1`.
- The Messages tab count is unread threads plus unseen drops. The proof buyer has no threads, so the tab number is the drop count.
- Messages shows a banner, `Not in scope right now, but you're free to test.` The same banner is on Community, a conversation, and the Messages section of a claimed shop's Deal tab. It is not a control. The drops row is still `New from dealers you follow, N`.
