import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { demo, isDemo } from '@/lib/demo';
import { supabase } from '@/lib/supabase';

import { keys } from './keys';

export type FollowedDealer = {
  id: string;
  name: string;
  logo_url: string | null;
};

export function useFollows(userId: string | null) {
  return useQuery({
    queryKey: keys.follows(userId ?? 'none'),
    enabled: Boolean(userId) || isDemo,
    queryFn: async (): Promise<FollowedDealer[]> => {
      if (isDemo || !userId) return demo.follows();

      const { data: rows, error } = await supabase
        .from('dealer_follows')
        .select('dealer_id, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (!rows?.length) return [];

      const { data: dealers, error: dealersError } = await supabase
        .from('dealers')
        .select('id, name, logo_url')
        .in(
          'id',
          rows.map((row) => row.dealer_id)
        );
      if (dealersError) throw dealersError;

      const byId = new Map((dealers ?? []).map((dealer) => [dealer.id, dealer]));
      return rows.flatMap((row) => {
        const dealer = byId.get(row.dealer_id);
        return dealer ? [dealer] : [];
      });
    },
  });
}

export function useToggleFollow(userId: string | null) {
  const queryClient = useQueryClient();
  const queryKey = keys.follows(userId ?? 'none');

  return useMutation({
    mutationFn: async (input: FollowedDealer & { following: boolean }) => {
      if (!userId && !isDemo) throw new Error('Sign in to follow a shop.');
      if (isDemo || !userId) {
        if (input.following) demo.follow(input.id);
        else demo.unfollow(input.id);
        return;
      }

      if (input.following) {
        const { error } = await supabase
          .from('dealer_follows')
          .insert({ user_id: userId, dealer_id: input.id });
        if (error && error.code !== '23505') throw error;
        return;
      }

      const { error } = await supabase
        .from('dealer_follows')
        .delete()
        .eq('user_id', userId)
        .eq('dealer_id', input.id);
      if (error) throw error;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<FollowedDealer[]>(queryKey);
      queryClient.setQueryData<FollowedDealer[]>(queryKey, (current = []) => {
        const rest = current.filter((shop) => shop.id !== input.id);
        if (!input.following) return rest;
        return [{ id: input.id, name: input.name, logo_url: input.logo_url }, ...rest];
      });
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });
}
