import { useMarkNewBatchSeen } from '@/data/newListings';
import { CatalogueDeck } from '@/features/deck/CatalogueDeck';

export { TabErrorBoundary as ErrorBoundary } from '@/components/ErrorState';

export default function New() {
  useMarkNewBatchSeen();
  return <CatalogueDeck source="new" />;
}
