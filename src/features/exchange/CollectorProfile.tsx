import { router } from 'expo-router';

import { Centered, CloseButton, Message, Screen, Spinner } from '@/components/ui';
import { useCollectorProfile } from '@/data/exchange';
import { useOpenTab } from '@/lib/openStack';

import { Collector } from './Collector';

/** A collector profile opened from a message avatar. */
export function CollectorProfile({ userId }: { userId: string }) {
  const { data: author, isPending, error } = useCollectorProfile(userId);
  const openTab = useOpenTab();
  const close = () => router.back();

  if (isPending) {
    return (
      <Screen action={<CloseButton onPress={close} />}>
        <Spinner />
      </Screen>
    );
  }

  if (error || !author) {
    return (
      <Screen action={<CloseButton onPress={close} />}>
        <Centered>
          <Message text="That collector is not there." tone="error" />
        </Centered>
      </Screen>
    );
  }

  const name = author.name ?? (author.handle ? `@${author.handle}` : 'Collector');
  return (
    <Screen title={name} action={<CloseButton onPress={close} />}>
      <Collector
        author={author}
        onOpenPost={(post) => {
          openTab('community', { post });
        }}
      />
    </Screen>
  );
}
