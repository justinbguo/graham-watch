import { Platform } from 'react-native';

import { Button } from '@/components/ui';

import { StepShell } from './StepShell';

export function NotifyStep({
  error,
  loading,
  onContinue,
  onSkip,
  onBack,
}: {
  error?: string | null;
  loading?: boolean;
  onContinue: () => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  const detail =
    Platform.OS === 'web'
      ? 'Push alerts are available in the mobile app. Continue to save your preference and finish.'
      : 'Continue to let your phone ask once. We use alerts when a dealer you follow lists a watch, and when someone replies.';

  return (
    <StepShell
      heading="Stay close to the watches you care about"
      detail={detail}
      error={error}
      onBack={onBack}
      backDisabled={loading}
      actions={
        <>
          <Button label="Continue" loading={loading} onPress={onContinue} />
          <Button label="Not now" variant="ghost" disabled={loading} onPress={onSkip} />
        </>
      }
    />
  );
}
