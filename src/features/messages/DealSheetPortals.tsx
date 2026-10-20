import type { ConversationDeal } from '@/data/deals';
import type { MessageListing } from '@/data/messages';

import { DealCheckoutSheet } from './DealCheckoutSheet';
import { OfferDealSheet } from './OfferDealSheet';
import { ReviewDealSheet } from './ReviewDealSheet';
import { ShipDealSheet } from './ShipDealSheet';

export type DealSheetState =
  | { kind: 'none' }
  | { kind: 'offer'; intent: 'create' | 'edit' | 'counter'; deal: ConversationDeal | null }
  | { kind: 'checkout'; deal: ConversationDeal }
  | { kind: 'ship'; deal: ConversationDeal }
  | { kind: 'review'; deal: ConversationDeal };

/** Modals for offer, checkout, ship, and review — one open at a time. */
export function DealSheetPortals({
  sheet,
  conversationId,
  offerListing,
  sellerName,
  onOpenListing,
  onClose,
}: {
  sheet: DealSheetState;
  conversationId: string;
  offerListing: MessageListing | null;
  sellerName: string;
  onOpenListing: (listingId: string) => void;
  onClose: () => void;
}) {
  const offer = sheet.kind === 'offer' ? sheet : null;

  return (
    <>
      {offerListing ? (
        <OfferDealSheet
          visible={offer !== null}
          conversationId={conversationId}
          listing={offerListing}
          intent={offer?.intent ?? 'create'}
          editDeal={offer?.deal ? { id: offer.deal.id, amountCents: offer.deal.amountCents } : null}
          onOpenListing={() => onOpenListing(offerListing.id)}
          onClose={onClose}
        />
      ) : null}
      <DealCheckoutSheet
        visible={sheet.kind === 'checkout'}
        deal={sheet.kind === 'checkout' ? sheet.deal : null}
        listing={offerListing}
        onClose={onClose}
      />
      <ShipDealSheet
        visible={sheet.kind === 'ship'}
        deal={sheet.kind === 'ship' ? sheet.deal : null}
        onClose={onClose}
      />
      <ReviewDealSheet
        visible={sheet.kind === 'review'}
        deal={sheet.kind === 'review' ? sheet.deal : null}
        sellerName={sellerName}
        onClose={onClose}
      />
    </>
  );
}
