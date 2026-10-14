import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { Button, Screen } from '@/components/ui';
import { SignInPanel } from '@/features/auth/SignInPanel';
import { useDesktopSignInWall } from '@/lib/layout';
import { useSession } from '@/providers/session';

/**
 * Two jobs, one route. On a wide browser it is the landing wall before the app.
 * On phone and narrow web it is the dismissible sheet over guest browse.
 */
export default function SignIn() {
  const { isSignedIn } = useSession();
  const wall = useDesktopSignInWall();
  const params = useLocalSearchParams<{ reason?: string }>();
  const reason = params.reason === 'budget' ? 'budget' : 'action';

  useEffect(() => {
    if (!isSignedIn) return;
    // The wall has nowhere to pop; the sheet does. After auth the Protected
    // guard swaps the stack to the app (or onboarding).
    if (wall) return;
    router.back();
  }, [isSignedIn, wall]);

  return (
    <Screen
      inSheet={!wall}
      action={
        wall ? undefined : (
          <Button label="Not now" variant="ghost" onPress={() => router.back()} />
        )
      }>
      <SignInPanel
        reason={wall ? undefined : reason}
        footer={
          !wall && reason === 'budget' ? (
            <Button label="Keep browsing" variant="ghost" onPress={() => router.back()} />
          ) : null
        }
      />
    </Screen>
  );
}
