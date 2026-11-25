import { PushBridge } from '@/features/notifications/PushBridge';
import { RevenueCatProvider } from '@/providers/revenuecat';

export function NativeBridges() {
  return (
    <RevenueCatProvider>
      <PushBridge />
    </RevenueCatProvider>
  );
}
