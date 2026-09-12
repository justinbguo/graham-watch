import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { DeckCard } from '@/lib/models';
import { isDemo } from '@/lib/demo';
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

export function useSendInquiry(buyerId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ card, message }: { card: DeckCard; message: string }) => {
      if (!buyerId) throw new Error('Not signed in.');
      if (isDemo) return null;

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
      return inquiry;
    },
    onSuccess: () => {
      if (buyerId) queryClient.invalidateQueries({ queryKey: keys.inquiries(buyerId) });
    },
  });
}
