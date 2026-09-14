import { router } from 'expo-router';

import { Screen } from '@/components/ui';
import { useShopClaim } from '@/features/dealers/claim';
import { ClaimShopForm } from '@/features/dealers/ClaimShopForm';

export default function ClaimShop() {
  const claim = useShopClaim();

  return (
    <Screen title="Claim your shop" inSheet>
      <ClaimShopForm claim={claim} onDone={() => router.replace('/profile')} />
    </Screen>
  );
}
