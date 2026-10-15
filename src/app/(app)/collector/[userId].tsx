import { useLocalSearchParams } from 'expo-router';

import { CollectorProfile } from '@/features/exchange/CollectorProfile';

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ErrorState';

export default function CollectorRoute() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  if (!userId) return null;
  return <CollectorProfile userId={userId} />;
}
