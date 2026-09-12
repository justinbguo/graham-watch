import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { DeckCard } from '@/lib/database.types';
import { isDemo } from '@/lib/demo';
import { supabase } from '@/lib/supabase';

import { keys } from './keys';

export function useSendInquiry(buyerId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ card, message }: { card: DeckCard; message: string }) => {
      if (!buyerId) throw new Error('Not signed in.');
      if (isDemo) return null;

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

      if (error) {
        // The unique index on (listing_id, buyer_id) is what stops repeat sends.
        if (error.code === '23505') throw new Error('You already contacted this dealer.');
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      if (buyerId) queryClient.invalidateQueries({ queryKey: keys.inquiries(buyerId) });
    },
  });
}
