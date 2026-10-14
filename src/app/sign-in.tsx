import { Screen } from '@/components/ui';
import { SignInPanel } from '@/features/auth/SignInPanel';

/**
 * The front door. The app stack is Protected until a session exists, so this
 * page is the only place an unsigned visitor lands — create an account or
 * log in, then the gate opens.
 */
export default function SignIn() {
  return (
    <Screen>
      <SignInPanel />
    </Screen>
  );
}
