import { useLocalSearchParams } from 'expo-router';

import { DealerShop } from '@/features/dealers/DealerShop';

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ErrorState';

export default function DealerRoute() {
  const { dealerId } = useLocalSearchParams<{ dealerId: string }>();
  if (!dealerId) return null;
  return <DealerShop dealerId={dealerId} />;
}
