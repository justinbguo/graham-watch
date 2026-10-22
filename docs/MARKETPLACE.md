# Marketplace (claimed shops first)

Graham becomes a marketplace when a buyer can **discover**, **message a claimed shop**,
**agree a price in a deal**, and **pay through Graham**. Email introductions to
unclaimed shops stay a fallback, not the fee path.

## Who this optimizes for

**Claimed shop owners** (`dealers.claimed_by`). They can reply in-app today; this
doc tracks what they need to **run sales on Graham**, not operator import scale.

Operators still **approve** which shops appear in the deck (`dealers.permission`).

## Money rules

| Path | Graham fee |
| --- | --- |
| In-thread deal, payment through Graham | Yes (`fee_bps`, default 5%) |
| Email inquiry (especially unclaimed shop) | No |
| Graham Pro (collector subscription) | Separate from dealer payouts |

Details: [TRANSACTIONS.md](TRANSACTIONS.md), [PRODUCT_SPEC.md](PRODUCT_SPEC.md) §16–17.

## Phases

| Phase | Deliverable | Status |
| --- | --- | --- |
| 0 | **Seller hub** tab (claimed dealers) — Messages, Payments, Customers, Listings | Shipped (placeholders except Messages + Listings) |
| 1 | Deal states: accept → pay → complete | Planned |
| 2 | Buyer pay + seller payout onboarding (e.g. Connect) + ledger | Planned |
| 3 | Push on message / inquiry / deal | Planned |
| 4 | Editable shop profile in-app | Planned |
| 5 | Reviews after completed deals | Planned |

## Seller hub

Claimed dealers get the **Hub** tab (store icon) instead of Messages. Sections:

- **Messages** — buyer threads (`thread_dealer_id` = your shop). Toggle **Personal messages** for collector DMs.
- **Payments** — placeholder until deal pay + payouts ship.
- **Customers** — placeholder.
- **Listings** — inventory hide/sold/edit (same data as Profile).

Buyers still see the normal **Messages** tab.

## Settlement (future)

On **complete**: mark listing sold, record fee, queue seller payout. Disputes v1
are operator-handled. See [TRANSACTIONS.md](TRANSACTIONS.md).
