# Inquiries

From a watch, the buyer opens the dealer's own page with `View on dealer site` when the listing has a source URL. The inquiry sheet at `/inquiry/<listingId>` still offers `Send via Graham` and `Open in my mail app`, plus that same dealer-site button. Nothing in the app navigates to the sheet. A saved watch is not an inquiry.

## Sub-features

- `dealer-site`: button `View on dealer site` on the listing, under Pass and Add to wishlist, and on the inquiry sheet. A blank source URL renders nothing.
- `compose`: route `/inquiry/<listingId>`, title `Contact dealer`. Reach it by URL. No control in the app opens it.
- `send`: button `Send via Graham`.
- `mail`: button `Open in my mail app`.

## How to get to it (user POV)

Open a listing and press `View on dealer site`. That leaves Graham for the dealer's page. `Message <shop>` on the dealer panel opens a thread, not this sheet. The sheet itself is the route `/inquiry/<listingId>`. The message is optional. `Cancel` leaves. After a send, `Done` closes the sheet.

## Driving it with control-graham

Preconditions:

- Signed in as `buyer`. A listing id from Test Bench (`drops-status` or `import`).

- **Open the sheet.** Run `screenshot /inquiry/<listingId> <evidence>/inquiry.png --as buyer`. The command loads that URL directly. The sheet is a modal with no Buy tab, and the catalogue is public, so the buttons are on screen without a session. A cold load that already has a session is sent back to Buy, so this shot stays unsigned. Expect `Send via Graham` and `Open in my mail app`. Expect `View on dealer site` when that listing has a source URL. Fixture import stores one on `test-bench.graham.test` for every row, including `DROP-1`, so the button is present on that sheet. The JSON fixture file does not carry the field. `SHELF-1` has no photos, so the client cannot read it and the sheet says `That watch is no longer available.`
- **Do not send from the Drops proof.** This harness has no `inquire` command. A screenshot of the sheet is not proof that a message was stored. Do not report inquiries verified because Drops passed.

## Gotchas

- `Send via Graham` on a local stack can hand mail to Mailpit. That is still a send. Do not press it while proving Drops.
- A direct link to a Rolex, or to a watch whose year is after 1985, is not a public catalogue row. The sheet then says `That watch is no longer available.` Use `DROP-1` for this proof.
- The hosted project must not receive a test inquiry. The harness refuses non-local URLs. Do not point the export at hosted and then press Send.
- An inquiry is unique per listing and buyer. A second send is a different failure from a missing button.
