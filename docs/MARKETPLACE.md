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
| 0 | **Deal** tab (claimed dealers). Messages, Payments, Analytics, Listings, Support | Shipped. Payments is a placeholder. Support opens an email to hello@graham.watch. |
| 1 | Deal states: accept → pay → complete | Planned |
| 2 | Buyer pay + seller payout onboarding (e.g. Connect) + ledger | Planned |
| 3 | Push on message / inquiry / deal | Planned |
| 4 | Editable shop profile in-app | Planned |
| 5 | Reviews after completed deals | Planned |

## Seller hub

Claimed dealers get the **Deal** tab (store icon) instead of Messages. The code calls the screen Seller Hub. Sections:

- **Messages**. The same inbox as the buyer Messages tab, with a **New** button. Filters are All, Unread, Favorites, and Groups. The screen does not split shop threads from personal ones.
- **Payments**. Placeholder until deal pay and payouts ship.
- **Analytics**. Who engages, and which watches get deck attention.
- **Listings**. Inventory hide, sold, and edit (same data as Profile).
- **Support**. Opens an email to hello@graham.watch. In-app tickets are not built.

Buyers still see the normal **Messages** tab.

## Settlement (future)

On **complete**: mark listing sold, record fee, queue seller payout. Disputes v1
are operator-handled. See [TRANSACTIONS.md](TRANSACTIONS.md).
