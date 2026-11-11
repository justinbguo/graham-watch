import { CatalogueDeck } from '@/features/deck/CatalogueDeck';

export { TabErrorBoundary as ErrorBoundary } from '@/components/ErrorState';

export default function New() {
  return <CatalogueDeck source="new" />;
}
