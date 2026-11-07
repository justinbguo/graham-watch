# Inquiries

From a watch, the buyer asks the dealer. The screen offers `Send via Graham` and `Open in my mail app`. Sending is deliberate. A saved watch is not an inquiry.

## Sub-features

- `compose`: route `/inquiry/<listingId>`, title `Contact dealer`.
- `send`: button `Send via Graham`.
- `mail`: button `Open in my mail app`.

## How to get to it (user POV)

Open a listing, then the control that contacts the dealer. Guests are sent to sign in first. The message is optional. `Cancel` leaves. After a send, `Done` closes the sheet.

## Driving it with control-graham

Preconditions:

- Signed in as `buyer`. A listing id from Test Bench (`drops-status` or `import`).

- **Open the sheet.** Run `screenshot /inquiry/<listingId> <evidence>/inquiry.png --as buyer`. Expect the buttons `Send via Graham` and `Open in my mail app`.
- **Do not send from the Drops proof.** This harness has no `inquire` command. A screenshot of the sheet is not proof that a message was stored. Do not report inquiries verified because Drops passed.

## Gotchas

- `Send via Graham` on a local stack can hand mail to Mailpit. That is still a send. Do not press it while proving Drops.
- The hosted project must not receive a test inquiry. The harness refuses non-local URLs. Do not point the export at hosted and then press Send.
- An inquiry is unique per listing and buyer. A second send is a different failure from a missing button.
