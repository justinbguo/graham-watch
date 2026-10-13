import { useCallback, useMemo } from 'react';

import { useMyApplication } from '@/data/applications';
import {
  useDealerAccounts,
  useDealerInventory,
  useUpdateDealerListing,
  type DealerAccount,
  type DealerInventoryItem,
} from '@/data/dealers';

export type DealerTotals = { live: number; saves: number; inquiries: number };

const NO_INVENTORY: DealerInventoryItem[] = [];

/**
 * The shop half of the Profile tab: which dealer this login owns, what that shop
 * has in the catalogue, and how to retire a watch. A buyer gets a workspace with
 * no shop and no claim, and Profile renders nothing extra.
 *
 * `isLoading` rather than `isPending`: a disabled query stays pending forever, so
 * a buyer with no shop would sit under a spinner.
 */
export function useDealerWorkspace() {
  const accounts = useDealerAccounts();
  const shop = accounts.data?.find((dealer) => dealer.claimed) ?? null;
  const claimable = accounts.data?.find((dealer) => !dealer.claimed) ?? null;

  // Only asked for when there is no shop yet. A dealer whose application was
  // approved has a claimed shop, and that outranks the application that got
  // them there.
  const application = useMyApplication();

  const inventory = useDealerInventory(shop?.id ?? null);
  const update = useUpdateDealerListing(shop?.id ?? null);
  const items = inventory.data ?? NO_INVENTORY;

  const totals = useMemo<DealerTotals>(
    () => ({
      live: items.filter((item) => item.status === 'active' && !item.sold_at).length,
      saves: items.reduce((sum, item) => sum + item.saves, 0),
      inquiries: items.reduce((sum, item) => sum + item.inquiries, 0),
    }),
    [items]
  );

  const { mutate } = update;

  const togglePublished = useCallback(
    (item: DealerInventoryItem) =>
      mutate({
        listingId: item.id,
        changes: { status: item.status === 'hidden' ? 'active' : 'hidden' },
      }),
    [mutate]
  );

  const toggleSold = useCallback(
    (item: DealerInventoryItem) =>
      mutate({
        listingId: item.id,
        changes: { sold_at: item.sold_at ? null : new Date().toISOString() },
      }),
    [mutate]
  );

  return {
    shop,
    claimable,
    application: shop || claimable ? null : (application.data ?? null),
    inventory: items,
    totals,
    isLoading: accounts.isLoading || inventory.isLoading,
    error: accounts.error ?? inventory.error ?? update.error ?? null,
    isSaving: update.isPending,
    reload: inventory.refetch,
    togglePublished,
    toggleSold,
  };
}

export type { DealerAccount, DealerInventoryItem };
