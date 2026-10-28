import {
  importListings,
  queueCatalogForPublish,
  syncCatalog,
  type PublishTotals,
} from './importer.ts';
import { type RefreshShopResult, type RefreshShopTarget } from './refreshAllLogic.ts';

export { shopsToRefresh, summariseRefreshAll } from './refreshAllLogic.ts';
export type { RefreshShopResult, RefreshShopTarget } from './refreshAllLogic.ts';

export async function refreshAllShops(
  shops: RefreshShopTarget[],
  options: { publish: boolean },
  onProgress: (message: string) => void
): Promise<RefreshShopResult[]> {
  const results: RefreshShopResult[] = [];

  for (const shop of shops) {
    onProgress(`Syncing ${shop.name}…`);
    try {
      const sync = await syncCatalog({ sourceUrl: shop.website, dealerId: shop.id });
      let publish: PublishTotals | undefined;

      if (options.publish) {
        onProgress(`${shop.name}: queuing for-sale watches…`);
        const { pending } = await queueCatalogForPublish(shop.id);
        if (pending > 0) {
          publish = await importListings(
            shop.id,
            (totals) => {
              onProgress(
                `${shop.name}: ${totals.published} published, ${totals.skipped} skipped (photos), ${totals.pending} left…`
              );
            },
            (line) => onProgress(`${shop.name}: ${line}`)
          );
        } else {
          publish = {
            processed: 0,
            published: 0,
            skipped: 0,
            failed: 0,
            pending: 0,
          };
        }
      }

      results.push({ id: shop.id, name: shop.name, ok: true, sync, publish });
      onProgress(
        `${shop.name}: ${sync.forSale} for sale, ${sync.added} new, ${sync.retired} gone.${
          publish ? ` ${publish.published} published.` : ''
        }`
      );
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Sync failed.';
      results.push({ id: shop.id, name: shop.name, ok: false, error: message });
      onProgress(`${shop.name}: ${message}`);
    }
  }

  return results;
}
