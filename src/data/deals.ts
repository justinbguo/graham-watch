import { useMutation, useQueryClient } from '@tanstack/react-query';

import { keys } from '@/data/keys';
import { feeCentsFromBps } from '@/lib/money';
import { isDemo } from '@/lib/demo';
import { supabase } from '@/lib/supabase';

export type DealStatus =
  | 'proposed'
  | 'accepted'
  | 'funded'
  | 'completed'
  | 'declined'
  | 'cancelled'
  | 'expired';

export type ConversationDeal = {
  id: string;
  conversationId: string;
  proposedBy: string;
  buyerId: string;
  sellerId: string;
  amountCents: number;
  currency: string;
  listingId: string | null;
  status: DealStatus;
  feeBps: number;
  feeCents: number | null;
};

type DealRow = {
  id: string;
  conversation_id: string;
  proposed_by: string;
  buyer_id: string;
  seller_id: string;
  amount_cents: number;
  currency: string;
  listing_id: string | null;
  status: DealStatus;
  fee_bps: number;
  fee_cents: number | null;
};

export function mapDeal(row: DealRow): ConversationDeal {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    proposedBy: row.proposed_by,
    buyerId: row.buyer_id,
    sellerId: row.seller_id,
    amountCents: row.amount_cents,
    currency: row.currency,
    listingId: row.listing_id,
    status: row.status,
    feeBps: row.fee_bps,
    feeCents: row.fee_cents,
  };
}

export function estimatedFeeCents(deal: ConversationDeal): number {
  return deal.feeCents ?? feeCentsFromBps(deal.amountCents, deal.feeBps);
}

export function useCreateDeal(conversationId: string) {
  const queryClient = useQueryClient();
  const queryKey = keys.conversation(conversationId);

  return useMutation({
    mutationFn: async (input: {
      amountCents: number;
      proposerIsSeller: boolean;
      listingId?: string | null;
      currency?: string;
    }) => {
      if (isDemo) throw new Error('Deals need a signed-in account.');
      const { data, error } = await supabase.rpc('create_conversation_deal', {
        p_conversation_id: conversationId,
        p_amount_cents: input.amountCents,
        p_currency: input.currency ?? 'USD',
        p_listing_id: input.listingId ?? undefined,
        p_proposer_is_seller: input.proposerIsSeller,
      });
      if (error) throw error;
      if (!data) throw new Error('Could not create that deal.');
      return data as string;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: keys.conversations });
    },
  });
}

export function useRespondToDeal(conversationId: string) {
  const queryClient = useQueryClient();
  const queryKey = keys.conversation(conversationId);

  return useMutation({
    mutationFn: async (input: { dealId: string; action: 'decline' | 'cancel' }) => {
      if (isDemo) throw new Error('Deals need a signed-in account.');
      const { error } = await supabase.rpc('respond_to_conversation_deal', {
        p_deal_id: input.dealId,
        p_action: input.action,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: keys.conversations });
    },
  });
}
