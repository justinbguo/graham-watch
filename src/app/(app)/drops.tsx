import { useLocalSearchParams } from 'expo-router';

import { dealerIdFromParam, DropsFeed } from '@/features/drops/DropsFeed';

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ErrorState';

export default function DropsRoute() {
  const { dealerId } = useLocalSearchParams<{ dealerId?: string }>();
  return <DropsFeed dealerId={dealerIdFromParam(dealerId)} />;
}
