import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { DeckCard, Inquiry } from '@/lib/models';
import { demo, isDemo } from '@/lib/demo';
import { supabase } from '@/lib/supabase';

import { keys } from './keys';

/** Edge function errors arrive as an opaque FunctionsHttpError; the reason is in the body. */
async function readError(error: unknown): Promise<string | null> {
  const response = (error as { context?: Response })?.context;
  if (!response) return null;

  try {
    return (await response.json())?.error ?? null;
  } catch {
    return null;
  }
}

/**
 * One row per (listing, buyer), enforced by a unique index. Hitting that index
 * after a send that failed must hand back the existing row so the buyer can try
 * again — telling them "already contacted" would strand an email that never went.
 */
async function recordIntent(card: DeckCard, buyerId: string, message: string) {
  const { data, error } = await supabase
    .from('inquiries')
    .insert({
      listing_id: card.id,
      dealer_id: card.dealer_id,
      buyer_id: buyerId,
      message: message.trim() || null,
    })
    .select('*')
    .single();

  if (!error) return data;
  if (error.code !== '23505') throw error;

  const { data: existing } = await supabase
    .from('inquiries')
    .select('*')
    .eq('listing_id', card.id)
    .eq('buyer_id', buyerId)
    .single();

  if (!existing) throw error;
  if (existing.status === 'sent') throw new Error('You already contacted this dealer.');
  return existing;
}

async function fetchInquiries(buyerId: string): Promise<Inquiry[]> {
  if (isDemo) return demo.inquiries();

  const { data, error } = await supabase
    .from('inquiries')
    .select('*')
    .eq('buyer_id', buyerId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export function useInquiries(buyerId: string | null) {
  return useQuery({
    queryKey: keys.inquiries(buyerId ?? 'anonymous'),
    queryFn: () => fetchInquiries(buyerId!),
    enabled: Boolean(buyerId),
  });
}

/** Map listing id → inquiry for Saved and detail buttons. */
export function inquiryByListing(inquiries: Inquiry[] | undefined) {
  const map = new Map<string, Inquiry>();
  for (const inquiry of inquiries ?? []) {
    map.set(inquiry.listing_id, inquiry);
  }
  return map;
}

export type SendInquiryResult = {
  inquiry: Inquiry;
  /** False on preview builds: the row is recorded, no dealer email goes out. */
  emailed: boolean;
};

export function useSendInquiry(buyerId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      card,
      message,
    }: {
      card: DeckCard;
      message: string;
    }): Promise<SendInquiryResult> => {
      if (!buyerId) throw new Error('Not signed in.');
      if (card.sold_at) {
        throw new Error('This watch has sold. There is nothing to ask the dealer about.');
      }

      // Preview has no mail path. Record a local sent row so Saved can show
      // Contacted, and tell the success screen to say so — never "Inquiry sent".
      if (isDemo) {
        const inquiry = demo.recordInquiry({
          listingId: card.id,
          dealerId: card.dealer_id,
          buyerId,
          message,
        });
        return { inquiry, emailed: false };
      }

      const inquiry = await recordIntent(card, buyerId, message);

      // The row is the record of intent and outlives a failed send, so it is
      // written first and the mail goes out second.
      const sent = await supabase.functions.invoke('send-inquiry', {
        body: { inquiryId: inquiry.id },
      });

      if (sent.error) {
        const reason = await readError(sent.error);
        throw new Error(reason ?? 'We saved your inquiry but could not email the dealer.');
      }
      return { inquiry, emailed: true };
    },
    onSuccess: () => {
      if (buyerId) queryClient.invalidateQueries({ queryKey: keys.inquiries(buyerId) });
    },
  });
}
