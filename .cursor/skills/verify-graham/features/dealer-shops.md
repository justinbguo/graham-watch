# Dealer shops

A shop page is the dealer's name, a follow control, and the watches they have for sale. Approved shops are readable without an account on the web.

## Sub-features

- `shop-page`: route `/dealer/<dealerId>`.
- `follow`: the button reads `Follow`, then `Following`.
- `inventory`: each watch opens `/listing/<listingId>`.

## How to get to it (user POV)

From a card, press the dealer. From Profile, press a shop under Following. The address is `/dealer/<id>`.

## Driving it with control-graham

Preconditions:

- `seed` created Test Bench. `follow buyer dealer` prints `dealerId`.

- **Open the shop.** Run `screenshot /dealer/<dealerId> <evidence>/shop.png --as buyer`. The page shows Test Bench.
- **Follow from the button.** The harness follow is the same insert the `Follow` button performs (`dealer_follows` as that user). It does not click the button. A proof of the button itself is still the screenshot plus a second `drops-status` or a follow read, not the click.

## Gotchas

- Opening the shop marks that shop's new watches seen. Do this after the Profile screenshot in the Drops proof, or the badge will already be 0.
- A shop that is not approved is not followable. Test Bench is inserted as approved by `seed`.
- Goldfinger's Vintage is the seeded catalogue, id `ad0d7d71-741a-4b65-9465-641ed9cc0199`. Its watches are older than the drop window.
