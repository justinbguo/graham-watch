import { router } from 'expo-router';

import { GrahamPaywall } from '@/features/subscriptions/GrahamPaywall';

export default function GrahamProScreen() {
  return <GrahamPaywall variant="standalone" onDone={() => router.back()} />;
}
