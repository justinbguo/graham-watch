import { Button, Centered, Heading, Message, Screen } from '@/components/ui';
import { useGuest } from '@/features/auth/GuestProvider';
import { useSession } from '@/providers/session';

/**
 * Tabs that need an account — messages, community, a real wishlist — show this
 * instead of an empty shell. The deck itself is the guest surface.
 */
export function GuestGate({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  const { isSignedIn } = useSession();
  const guest = useGuest();

  if (isSignedIn) return null;

  return (
    <Screen title={title} inTabs>
      <Centered>
        <Heading>Sign in to continue</Heading>
        <Message text={message} />
        <Button label="Log in or create an account" onPress={() => guest.openSignIn('action')} />
      </Centered>
    </Screen>
  );
}
