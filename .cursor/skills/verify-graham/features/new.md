# New

New is the tab of watches the last full nightly refresh sealed onto the deck. The batch uses the same shop seating as Buy, newest first, with no personal score, so one shop does not fill the first screen. The count is the size of that batch until this device opens the tab. Opening New clears it, and a reload keeps it clear. A later seal brings the count back. Guests see it. It is not Drops.

## Sub-features

- `new-tab`: tab `New`. With a batch the spoken name is `New, N`.
- `new-list`: the same header, cards, and grid as Buy. The line under the pile is `N watches from last night's update.` or a dated update when the seal is older than a night.
- `new-empty`: heading `Nothing new yet` and the line `New watches appear here after the nightly update.` when nothing has been sealed. `seed` does not seal a batch, so this is what the local proof shows. The screen has no title `New`. The tab is still `New`.

## How to get to it (user POV)

Choose the New tab. A row opens the listing. The count clears, and it is still gone after a reload on Buy. A newer sealed batch brings it back.

## Driving it with control-graham

Preconditions:

- `up`, `seed`, and `web`.

- **Empty batch.** Run `screenshot /new <evidence>/new.png --as buyer`. The command waits until the batch query settles. With no sealed batch the page shows the heading `Nothing new yet` and `New watches appear here after the nightly update.` The tab name is `New` with no count.
- **Seen batch.** `verify-new-badge` imports a fixture, seals it, and drives a signed-in phone and a guest desktop. The tab is `New, N`, then `New` after the click, still `New` after a reload on Buy, then `New, M` after a second fixture seal.
- **Do not call this Drops.** Drops is `/drops`, title `New watches`, and only after a follow plus a later listing. `verify-drops` does not seal a catalogue batch.

## Gotchas

- `catalogue_batches` and `catalogue_batch_listings` have no policies. The app reads them through `latest_catalogue_batch`. A buyer cannot insert a batch from the client.
- Opening New stores the batch id in `graham.seen-new-batch` on this device. A guest and a signed-in person in the same browser share that mark.
- Sealing is `seal_catalogue_batch` from a full `npm run refresh` that exits 0. A one-shop refresh does not seal. Do not run refresh against the hosted project from this harness.
- The seal keeps watches that pass `listing_on_deck`. A Rolex and a year after 1985 are not in the batch. A null year stays.
