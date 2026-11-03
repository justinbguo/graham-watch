import { DropsFeed } from '@/features/drops/DropsFeed';

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ErrorState';

export default function DropsRoute() {
  return <DropsFeed />;
}
