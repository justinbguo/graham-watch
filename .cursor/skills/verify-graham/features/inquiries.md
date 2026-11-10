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

- **Open the sheet.** Run `screenshot /inquiry/<listingId> <evidence>/inquiry.png --as buyer`. Expect `Send via Graham` and `Open in my mail app`. Expect `View on dealer site` only when that listing has a source URL. The Drops fixture `DROP-1` has none, so that button is absent there.
- **Do not send from the Drops proof.** This harness has no `inquire` command. A screenshot of the sheet is not proof that a message was stored. Do not report inquiries verified because Drops passed.

## Gotchas

- `Send via Graham` on a local stack can hand mail to Mailpit. That is still a send. Do not press it while proving Drops.
- The hosted project must not receive a test inquiry. The harness refuses non-local URLs. Do not point the export at hosted and then press Send.
- An inquiry is unique per listing and buyer. A second send is a different failure from a missing button.
