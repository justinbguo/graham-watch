# Dealer shop management

A dealer who has claimed a shop edits the shop's details on Profile. The live listing list and the catalogue import are on the Deal tab, under Listings. Claiming does not approve the shop. Approval stays with an operator.

## Sub-features

- `claimed-profile`: Profile shows the shop editor when `claimed_by` is the signed-in user.
- `edit-listing`: route `/edit-listing/<listingId>`, button `Save changes`.
- `import-inventory`: route `/import-inventory`, used to pull the shop's own site.
- `seller-hub`: the Messages tab is labeled `Deal` once a shop is claimed.

## How to get to it (user POV)

Sign in as the dealer and open Profile. The editor is on that page, with counts `Live listings`, `Wishlists`, and `Inquiries`. Open the Deal tab, then Listings, to edit a watch or import. Import starts from the control named `Import from your website`. That opens `Refresh from your site`. `Refresh from site` reads the shop, then `Choose watches` publishes in batches until nothing is pending. The buyer deck has no import control.

## Driving it with control-graham

Preconditions:

- `seed` claimed Test Bench as `bench@graham.test` (`sign-in dealer`).

- **Open the editor.** Run `screenshot /profile <evidence>/dealer-profile.png --as dealer`. The page shows `Your shop` and Test Bench, and the tab is `Deal`, not the buyer Following row.
- **Fixture import is not this screen.** `import` posts the local fixture action as the dealer and creates `DROP-1`. It does not open `/import-inventory` and it does not call OpenAI. A pass of `import` is not proof of the import screen.

## Gotchas

- `screenshot --as dealer` signs in as the dealer. Do not use that shot as the buyer badge proof.
- The dealer's own deck hides their claimed shop. Look at Profile, not Buy, for Test Bench's editor.
- Approving the shop is the operator console, not a control on this page.
- Profile does not show `Do you run a shop listed here?`. `Claim this shop` shows when the signed-in email is the address published on the shop. `/apply` still starts a claim.
- The Messages section of Deal shows `Not in scope right now, but you're free to test.` The banner is not a control. Listings, Analytics, Payments, and Support do not show it.
