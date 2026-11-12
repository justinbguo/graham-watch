import { Platform } from 'react-native';

import { Button, Screen } from '@/components/ui';
import { SignInPanel } from '@/features/auth/SignInPanel';
import { SignInWebShell } from '@/features/auth/SignInWebShell';
import { useSignInSheet } from '@/features/auth/useSignInSheet';

export default function SignInSheet() {
  const { reason, dismiss } = useSignInSheet();

  if (Platform.OS === 'web') {
    return (
      <SignInWebShell onClose={dismiss}>
        <SignInPanel presentation="modal" reason={reason} />
      </SignInWebShell>
    );
  }

  return (
    <Screen inSheet action={<Button label="Not now" variant="ghost" onPress={dismiss} />}>
      <SignInPanel reason={reason} />
    </Screen>
  );
}
