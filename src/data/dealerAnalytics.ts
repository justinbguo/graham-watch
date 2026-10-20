import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

import { keys } from './keys';

export type DealerTopCustomer =
  import('@/lib/database').Database['public']['Functions']['dealer_top_customers']['Returns'][number];

async function fetchDealerTopCustomers(dealerId: string): Promise<DealerTopCustomer[]> {
  const { data, error } = await supabase.rpc('dealer_top_customers', { p_dealer_id: dealerId });
  if (error) throw error;
  return data ?? [];
}

export function useDealerTopCustomers(dealerId: string | null) {
  return useQuery({
    queryKey: keys.dealerTopCustomers(dealerId ?? 'none'),
    queryFn: () => fetchDealerTopCustomers(dealerId!),
    enabled: Boolean(dealerId),
  });
}
