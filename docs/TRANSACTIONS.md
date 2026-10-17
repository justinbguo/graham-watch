# Deals and transaction fees

Graham earns on **completed deals** in message threads, not on free introduction
email to a dealer. **Graham Pro** is a separate subscription; see [REVENUECAT.md](REVENUECAT.md).

## Deal (shipped as placeholder)

A **deal** is a proposed price in a **direct** or **shop** thread (not group chats yet).

| Step | Today | Next |
| --- | --- | --- |
| Offer | Either party names USD amount; row in `conversation_deals` + message with `deal_id` | Same |
| Accept | — | Buyer confirms terms |
| Pay | **Pay with Apple Pay** shows “coming soon” | Payment hold via Apple Pay |
| Settle | — | Release to seller; record fee |

**Roles**

- **Buyer** — always `buyer_id`; funds the deal when payment ships.
- **Seller** — `seller_id`; receives payout after settlement.
- **Shop thread** — buyer is the person who opened the thread; seller is `dealers.claimed_by`.
- **Peer thread** — choose “offering to sell” or “offering to buy” when creating the offer.

**RPC**

- `create_conversation_deal(conversation_id, amount_cents, currency, listing_id, proposer_is_seller)`
- `respond_to_conversation_deal(deal_id, 'decline' | 'cancel')`

**App**

- `Offer deal` on the composer → `OfferDealSheet`
- `DealCard` in the thread
- Data: `src/data/deals.ts`

## Transaction fee model (default in schema)

| Field | Meaning |
| --- | --- |
| `fee_bps` | Basis points Graham keeps at settlement (default **500** = 5%) |
| `fee_cents` | Filled when payment is captured (null in placeholder) |

Estimated fee in the UI: `feeCentsFromBps(amount, fee_bps)` in `src/lib/money.ts`.

**Business rules (product)**

1. Fee applies when money moves **through Graham** on a deal, not on off-app bank wires.
2. Fee is taken at **capture or release**, not at message send.
3. Display estimated fee on the offer so both sides see it before Apple Pay.

## Future infrastructure (not built)

- Payment provider ids on `conversation_deals` (`payment_provider`, `payment_intent_id`)
- Ledger table for fee revenue and seller payouts
- Webhooks for hold, capture, refund, dispute
- Operator reporting

See [PRODUCT_SPEC.md](PRODUCT_SPEC.md) §16–17.
