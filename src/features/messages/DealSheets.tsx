import { useState } from 'react';

import { useCompleteDeal, useRespondToDeal, type ConversationDeal } from '@/data/deals';
import type { MessageListing } from '@/data/messages';

import type { DealCardActions } from './DealCard';
import type { DealSheetState } from './DealSheetPortals';

const CLOSED: DealSheetState = { kind: 'none' };

/**
 * Which deal sheet is open over a thread. Rendering lives in {@link DealSheetPortals}
 * so sheet modules load in one place.
 */
export function useDealSheets({
  conversationId,
  offerListing,
  sellerName,
  onOpenListing,
}: {
  conversationId: string;
  offerListing: MessageListing | null;
  sellerName: string;
  onOpenListing: (listingId: string) => void;
}) {
  const [sheet, setSheet] = useState<DealSheetState>(CLOSED);
  const respond = useRespondToDeal(conversationId);
  const complete = useCompleteDeal(conversationId);
  const close = () => setSheet(CLOSED);

  const openOffer = () => setSheet({ kind: 'offer', intent: 'create', deal: null });

  const actionsFor = (deal: ConversationDeal): DealCardActions => ({
    onAccept: () => respond.mutate({ dealId: deal.id, action: 'accept' }),
    onDecline: () => respond.mutate({ dealId: deal.id, action: 'decline' }),
    onCancel: () => respond.mutate({ dealId: deal.id, action: 'cancel' }),
    onEdit: () => setSheet({ kind: 'offer', intent: 'edit', deal }),
    onCounter: () => setSheet({ kind: 'offer', intent: 'counter', deal }),
    onCheckout: () => setSheet({ kind: 'checkout', deal }),
    onShip: () => setSheet({ kind: 'ship', deal }),
    onConfirmReceipt: () => complete.mutate(deal.id),
    onReview: () => setSheet({ kind: 'review', deal }),
  });

  return {
    sheet,
    close,
    conversationId,
    offerListing,
    sellerName,
    onOpenListing,
    openOffer,
    actionsFor,
    busy: respond.isPending || complete.isPending,
  };
}
