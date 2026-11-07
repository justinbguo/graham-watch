import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { Button, Screen } from '@/components/ui';
import { SignInPanel } from '@/features/auth/SignInPanel';
import { SignInWebShell } from '@/features/auth/SignInWebShell';
import { useSession } from '@/providers/session';

/**
 * Sign-in as a sheet over the app. Guests browse the deck first; this opens from
 * itself when a web guest lands on Buy, and again after the swipe budget. Dismissible — the next swipe
 * asks again if the budget is spent.
 */
export default function SignInSheet() {
  const { isSignedIn } = useSession();
  const params = useLocalSearchParams<{ reason?: string }>();
  const reason = params.reason === 'budget' ? 'budget' : 'action';
  const dismiss = () => router.back();

  useEffect(() => {
    if (isSignedIn) router.back();
  }, [isSignedIn]);

  if (Platform.OS === 'web') {
    return (
      <SignInWebShell onClose={dismiss}>
        <SignInPanel presentation="modal" reason={reason} />
      </SignInWebShell>
    );
  }

  return (
    <Screen inSheet action={<Button label="Not now" variant="ghost" onPress={dismiss} />}>
      <SignInPanel
        reason={reason}
        footer={
          reason === 'budget' ? (
            <Button label="Keep browsing" variant="ghost" onPress={dismiss} />
          ) : null
        }
      />
    </Screen>
  );
}
