import { useDealerAccounts } from '@/data/dealers';
import type { DealerAccount } from '@/data/dealers';

/** The shop this login controls, once dealer accounts have loaded. */
export function useClaimedDealerShop(): {
  shop: DealerAccount | null;
  ready: boolean;
} {
  const accounts = useDealerAccounts();
  const shop = accounts.data?.find((dealer) => dealer.claimed) ?? null;
  return { shop, ready: !accounts.isLoading };
}
