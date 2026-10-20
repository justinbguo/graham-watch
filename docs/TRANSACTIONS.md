# Deals and transaction fees

Graham earns on **completed deals** in message threads, not on free introduction
email to a dealer. **Graham Pro** is a separate subscription; see [REVENUECAT.md](REVENUECAT.md).

## Deal lifecycle (phase 0: no real money)

A **deal** is a proposed price in a **direct** or **shop** thread (not group chats yet).
Every step is an RPC that writes `conversation_deals` and posts a system message
with `deal_id`, so the thread is the audit log.

| Status | Who moves it | RPC | What happens |
| --- | --- | --- | --- |
| `proposed` | Seller (or buyer in a peer thread) | `create_conversation_deal(…, p_expires_in_hours)` | Row + message. Clock 1–336 h, default 72. Seller picks 24 h / 3 d / 7 d in the sheet. |
| `proposed` | Other side | `revise_conversation_deal` | Counteroffer flips `proposed_by` and resets the clock to 72 h. |
| `accepted` | Non-proposer | `respond_to_conversation_deal(id, 'accept')` | Rejects if `expires_at` passed. Every other `proposed`/`accepted` deal on the same listing becomes `cancelled`, `cancelled_reason = 'listing_reserved'`, with a message in that thread. |
| `funded` | Buyer | `fund_conversation_deal(id, ship_to, payment_label)` | Requires a complete `ship_to`. Stores `payment_provider = 'dev_hold'`, `ship_by = now() + 5 days`. No charge. |
| `shipped` | Seller | `ship_conversation_deal(id, carrier, tracking_number)` | Seller buys their own label. Graham stores carrier + number; buyer sees both in the card. |
| `completed` | Buyer | `complete_conversation_deal` | Only from `shipped`. Sets `completed_at` and `listings.sold_at`. |
| review | Buyer | `review_conversation_deal(id, rating, body)` | One per deal. Row in `deal_reviews` (readable to any signed-in user), `reviewed_at` on the deal. |
| `declined` / `cancelled` / `expired` | — | `respond_to_conversation_deal`, `expire_conversation_deals` | Expiry is swept when a thread's next deal RPC runs; the client also treats a past `expires_at` as expired. |

**Roles**

- **Buyer** — always `buyer_id`; funds, confirms receipt, reviews.
- **Seller** — `seller_id`; ships, is reviewed.
- **Shop thread** — buyer is the person who opened the thread; seller is `dealers.claimed_by`. Listing is required.
- **Peer thread** — choose “offering to sell” or “offering to buy” when creating the offer.

**What the seller receives at funding**

Only the `ship_to` block: name, line1, line2, city, region, postal code, country, phone.
Nothing else from the buyer's profile.

**Saved checkout defaults**

`checkout_defaults` (one row per user, own-row RLS) holds `ship_to` and `payment_label`.
Checkout prefills from it and offers "save to profile" toggles. Settings →
Payment & shipping edits it. `payment_label` is a stand-in until Stripe stores a
real payment method.

**App**

- `Offer deal` on the composer → `OfferDealSheet` (amount + expiry)
- `DealCard` renders per status; actions route through `useDealSheets`
- `DealCheckoutSheet` (address + test payment) → `ShipDealSheet` (carrier + tracking) → `ReviewDealSheet`
- Data: `src/data/deals.ts`, `src/data/checkout.ts`
- Test: `npm run test:rls` → "deal flow" block runs offer → accept → pay → ship → receive → review, competing-offer cancellation, expiry, and `checkout_defaults` isolation.

## Transaction fee model (default in schema)

| Field | Meaning |
| --- | --- |
| `fee_bps` | Basis points Graham keeps at settlement (default **500** = 5%) |
| `fee_cents` | Filled when payment is captured (null in phase 0) |

Estimated fee in the UI: `feeCentsFromBps(amount, fee_bps)` in `src/lib/money.ts`.

**Business rules (product)**

1. Fee applies when money moves **through Graham** on a deal, not on off-app bank wires.
2. Fee is taken at **capture or release**, not at message send.
3. Display estimated fee on the offer so both sides see it before payment.

## Phase 1: Stripe Connect (not built)

- `fund_conversation_deal` becomes: create PaymentIntent (manual capture) on the
  platform account with `transfer_data.destination = seller's connected account`
  and `application_fee_amount = fee_cents`. Replace `dev_hold` with `stripe`.
- `complete_conversation_deal` captures and releases the transfer.
- `ship_by` missed → auto-cancel + refund via a scheduled function.
- Seller onboarding: Connect Express account link from Seller Hub.
- Webhooks for hold, capture, refund, dispute; ledger table for fee revenue.

See [PRODUCT_SPEC.md](PRODUCT_SPEC.md) §16–17.
