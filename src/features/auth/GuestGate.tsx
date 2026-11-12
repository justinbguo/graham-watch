import { Button, Centered, Heading, Message, Screen } from '@/components/ui';
import type { LayoutWidth } from '@/lib/theme';
import { openSignIn } from '@/features/auth/guest';
import { useSession } from '@/providers/session';

/**
 * Tabs that need an account — messages, community, a real wishlist — show this
 * instead of an empty shell. The deck itself is the guest surface.
 */
export function GuestGate({
  title,
  message,
  width = 'reading',
}: {
  title: string;
  message: string;
  width?: LayoutWidth;
}) {
  const { isSignedIn } = useSession();

  if (isSignedIn) return null;

  return (
    <Screen title={title} inTabs width={width}>
      <Centered>
        <Heading>Sign in to continue</Heading>
        <Message text={message} />
        <Button label="Log in or create an account" onPress={() => openSignIn('action')} />
      </Centered>
    </Screen>
  );
}
