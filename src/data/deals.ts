import { useMutation, useQueryClient } from '@tanstack/react-query';

import { keys } from '@/data/keys';
import type { Database } from '@/lib/database';
import { feeCentsFromBps } from '@/lib/money';
import { isDemo } from '@/lib/demo';
import { supabase } from '@/lib/supabase';

import { shipToFromJson, trimShipTo, type ShipTo } from './checkout';

export type DealStatus = Database['public']['Enums']['deal_status'];

/** Hours an offer stays open. Seller picks one when offering. */
export const OFFER_EXPIRY_CHOICES: { hours: number; label: string }[] = [
  { hours: 24, label: '24 hours' },
  { hours: 72, label: '3 days' },
  { hours: 168, label: '7 days' },
];

export const DEFAULT_OFFER_EXPIRY_HOURS = 72;

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
  expiresAt: string | null;
  fundedAt: string | null;
  shipBy: string | null;
  shippedAt: string | null;
  completedAt: string | null;
  reviewedAt: string | null;
  shipTo: ShipTo | null;
  trackingCarrier: string | null;
  trackingNumber: string | null;
  cancelledReason: string | null;
};

type DealRow = Database['public']['Tables']['conversation_deals']['Row'];

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
    expiresAt: row.expires_at,
    fundedAt: row.funded_at,
    shipBy: row.ship_by,
    shippedAt: row.shipped_at,
    completedAt: row.completed_at,
    reviewedAt: row.reviewed_at,
    shipTo: shipToFromJson(row.ship_to),
    trackingCarrier: row.tracking_carrier,
    trackingNumber: row.tracking_number,
    cancelledReason: row.cancelled_reason,
  };
}

export function estimatedFeeCents(deal: ConversationDeal): number {
  return deal.feeCents ?? feeCentsFromBps(deal.amountCents, deal.feeBps);
}

/**
 * The server only writes `expired` when something else touches the thread, so
 * a proposed offer past its clock reads as expired here.
 */
export function isDealExpired(deal: ConversationDeal, now = Date.now()): boolean {
  if (deal.status === 'expired') return true;
  if (deal.status !== 'proposed' || !deal.expiresAt) return false;
  return new Date(deal.expiresAt).getTime() <= now;
}

export function dealIsOpen(deal: ConversationDeal, now = Date.now()): boolean {
  return deal.status === 'proposed' && !isDealExpired(deal, now);
}

function invalidateThread(queryClient: ReturnType<typeof useQueryClient>, conversationId: string) {
  void queryClient.invalidateQueries({ queryKey: keys.conversation(conversationId) });
  void queryClient.invalidateQueries({ queryKey: keys.conversations });
}

export function useCreateDeal(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      amountCents: number;
      proposerIsSeller: boolean;
      listingId?: string | null;
      currency?: string;
      expiresInHours?: number;
    }) => {
      if (isDemo) throw new Error('Deals need a signed-in account.');
      const { data, error } = await supabase.rpc('create_conversation_deal', {
        p_conversation_id: conversationId,
        p_amount_cents: input.amountCents,
        p_currency: input.currency ?? 'USD',
        p_listing_id: input.listingId ?? undefined,
        p_proposer_is_seller: input.proposerIsSeller,
        p_expires_in_hours: input.expiresInHours ?? DEFAULT_OFFER_EXPIRY_HOURS,
      });
      if (error) throw error;
      if (!data) throw new Error('Could not create that deal.');
      return data as string;
    },
    onSuccess: () => invalidateThread(queryClient, conversationId),
  });
}

export function useReviseDeal(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { dealId: string; amountCents: number }) => {
      if (isDemo) throw new Error('Deals need a signed-in account.');
      const { error } = await supabase.rpc('revise_conversation_deal', {
        p_deal_id: input.dealId,
        p_amount_cents: input.amountCents,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateThread(queryClient, conversationId),
  });
}

export function useRespondToDeal(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { dealId: string; action: 'accept' | 'decline' | 'cancel' }) => {
      if (isDemo) throw new Error('Deals need a signed-in account.');
      const { error } = await supabase.rpc('respond_to_conversation_deal', {
        p_deal_id: input.dealId,
        p_action: input.action,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateThread(queryClient, conversationId),
  });
}

/** Placeholder hold: records the ship-to and starts the shipping clock. No charge. */
export function useFundDeal(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { dealId: string; shipTo: ShipTo; paymentLabel: string }) => {
      if (isDemo) throw new Error('Deals need a signed-in account.');
      const { error } = await supabase.rpc('fund_conversation_deal', {
        p_deal_id: input.dealId,
        p_ship_to: trimShipTo(input.shipTo),
        p_payment_label: input.paymentLabel,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateThread(queryClient, conversationId),
  });
}

export function useShipDeal(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { dealId: string; carrier: string; trackingNumber: string }) => {
      if (isDemo) throw new Error('Deals need a signed-in account.');
      const { error } = await supabase.rpc('ship_conversation_deal', {
        p_deal_id: input.dealId,
        p_carrier: input.carrier,
        p_tracking_number: input.trackingNumber,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateThread(queryClient, conversationId),
  });
}

export function useCompleteDeal(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dealId: string) => {
      if (isDemo) throw new Error('Deals need a signed-in account.');
      const { error } = await supabase.rpc('complete_conversation_deal', { p_deal_id: dealId });
      if (error) throw error;
    },
    onSuccess: () => invalidateThread(queryClient, conversationId),
  });
}

export function useReviewDeal(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { dealId: string; rating: number; body: string }) => {
      if (isDemo) throw new Error('Deals need a signed-in account.');
      const { error } = await supabase.rpc('review_conversation_deal', {
        p_deal_id: input.dealId,
        p_rating: input.rating,
        p_body: input.body.trim() || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateThread(queryClient, conversationId),
  });
}
