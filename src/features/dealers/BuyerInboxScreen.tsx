import { View } from 'react-native';

import { Screen } from '@/components/ui';
import type { DealerAccount } from '@/data/dealers';
import { inset } from '@/lib/theme';

import { BuyerInboxList } from './BuyerInboxList';

/** Modal entry for buyer threads. Prefer Seller hub → Messages when on a tab. */
export function BuyerInboxScreen({ shop }: { shop: DealerAccount }) {
  return (
    <Screen title="Buyer inbox" subtitle={shop.name} width="reading">
      <View style={{ flex: 1, paddingHorizontal: inset.screen }}>
        <BuyerInboxList dealerId={shop.id} />
      </View>
    </Screen>
  );
}
