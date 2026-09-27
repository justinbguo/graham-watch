import { useState } from 'react';

import { Button } from '@/components/ui';
import { signOut } from '@/lib/auth';

import { StepShell } from './StepShell';

/**
 * The age gate. We do not set onboarded_at, so the session would otherwise
 * loop on birthday forever. Sign-out is the only way off this screen.
 */
export function BlockedStep() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <StepShell
      heading="You need to be 18 to use Graham"
      detail="We cannot make an account for you. Sign out to leave."
      error={error}
      actions={
        <Button
          label="Sign out"
          loading={busy}
          onPress={() => {
            setBusy(true);
            setError(null);
            void signOut().catch((caught: unknown) => {
              setBusy(false);
              setError(caught instanceof Error ? caught.message : 'Could not sign out.');
            });
          }}
        />
      }
    />
  );
}
