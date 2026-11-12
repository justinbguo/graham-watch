# New

New is the tab of watches the last full nightly refresh sealed onto the deck. The count is the batch size. Opening the tab does not clear it. Guests see it. It is not Drops.

## Sub-features

- `new-tab`: tab `New`. With a batch the spoken name is `New, N`.
- `new-list`: the same header, cards, and grid as Buy. The line under the pile is `N watches from last night's update.` or a dated update when the seal is older than a night.
- `new-empty`: heading `Nothing new yet` and the line `New watches appear here after the nightly update.` when nothing has been sealed. `seed` does not seal a batch, so this is what the local proof shows. The screen has no title `New`. The tab is still `New`.

## How to get to it (user POV)

Choose the New tab. A row opens the listing. The count stays.

## Driving it with control-graham

Preconditions:

- `up`, `seed`, and `web`.

- **Empty batch.** Run `screenshot /new <evidence>/new.png --as buyer`. The command waits until the batch query settles. With no sealed batch the page shows the heading `Nothing new yet` and `New watches appear here after the nightly update.` The tab name is `New` with no count. Opening the tab does not clear a count once a batch exists. The spoken tab is then `New, N`.
- **Do not call this Drops.** Drops is `/drops`, title `New watches`, and only after a follow plus a later listing. `verify-drops` does not seal a catalogue batch.

## Gotchas

- `catalogue_batches` and `catalogue_batch_listings` have no policies. The app reads them through `latest_catalogue_batch`. A buyer cannot insert a batch from the client.
- Sealing is `seal_catalogue_batch` from a full `npm run refresh` that exits 0. A one-shop refresh does not seal. Do not run refresh against the hosted project from this harness.
