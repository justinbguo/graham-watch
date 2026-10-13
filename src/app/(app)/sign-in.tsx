import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { Button, Screen } from '@/components/ui';
import { SignInPanel } from '@/features/auth/SignInPanel';
import { useSession } from '@/providers/session';

/**
 * Sign-in as a sheet over the app. Guests browse the deck first; this opens from
 * the top-right control or after the swipe budget. Dismissible — the next swipe
 * asks again if the budget is spent.
 */
export default function SignInSheet() {
  const { isSignedIn } = useSession();
  const params = useLocalSearchParams<{ reason?: string }>();
  const reason = params.reason === 'budget' ? 'budget' : 'action';

  useEffect(() => {
    if (isSignedIn) router.back();
  }, [isSignedIn]);

  return (
    <Screen
      inSheet
      action={<Button label="Not now" variant="ghost" onPress={() => router.back()} />}>
      <SignInPanel
        reason={reason}
        footer={
          reason === 'budget' ? (
            <Button label="Keep browsing" variant="ghost" onPress={() => router.back()} />
          ) : null
        }
      />
    </Screen>
  );
}
