import { GrahamPaywall } from './GrahamPaywall';

export function OnboardingPaywall({
  error,
  loading,
  onComplete,
  onBack,
}: {
  error?: string | null;
  loading?: boolean;
  onComplete: () => void;
  onBack: () => void;
}) {
  return (
    <GrahamPaywall
      variant="onboarding"
      error={error}
      loading={loading}
      onDone={onComplete}
      onBack={onBack}
    />
  );
}
