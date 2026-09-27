import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Screen, Message } from '@/components/ui';
import type { ExchangeIntent } from '@/data/exchange';
import { inset, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';
import { useSession } from '@/providers/session';

import { Composer } from './Composer';
import { Feed } from './Feed';
import { HeaderIcon } from './HeaderIcon';
import { Thread } from './Thread';

type Mode = { kind: 'feed' } | { kind: 'new' } | { kind: 'edit'; id: string } | { kind: 'post'; id: string };

const DEAL =
  'You pay the other person directly. Graham does not hold the money or the watch. Comment on a post before you deal with them.';

function explainDeal() {
  Alert.alert('How a deal works', DEAL);
}

export function ExchangeScreen() {
  const { userId } = useSession();
  const styles = useThemedStyles(screenStyles);
  const [mode, setMode] = useState<Mode>({ kind: 'feed' });
  const [intent, setIntent] = useState<ExchangeIntent | null>(null);
  const back = () => setMode({ kind: 'feed' });

  if (!userId) {
    return (
      <Screen title="Exchange" inTabs>
        <View style={styles.note}>
          <Message text="Sign in to use the exchange." />
        </View>
      </Screen>
    );
  }

  if (mode.kind === 'new' || mode.kind === 'edit') {
    return (
      <Screen
        title={mode.kind === 'edit' ? 'Edit post' : 'New post'}
        inTabs
        action={<HeaderIcon label="Back to posts" name="arrow-left" onPress={back} />}>
        <Composer
          userId={userId}
          postId={mode.kind === 'edit' ? mode.id : null}
          onPosted={(id) => setMode({ kind: 'post', id })}
        />
      </Screen>
    );
  }

  if (mode.kind === 'post') {
    return (
      <Screen
        title="Exchange"
        inTabs
        action={<HeaderIcon label="Back to posts" name="arrow-left" onPress={back} />}>
        <Thread
          userId={userId}
          postId={mode.id}
          onEdit={() => setMode({ kind: 'edit', id: mode.id })}
          onDeleted={back}
        />
      </Screen>
    );
  }

  return (
    <Screen
      title="Exchange"
      inTabs
      action={
        <View style={styles.actions}>
          <HeaderIcon label="How a deal works" name="information-outline" onPress={explainDeal} />
          <HeaderIcon label="New post" name="plus" onPress={() => setMode({ kind: 'new' })} />
        </View>
      }>
      <Feed
        userId={userId}
        intent={intent}
        onIntent={setIntent}
        onOpen={(id) => setMode({ kind: 'post', id })}
      />
    </Screen>
  );
}

const screenStyles = (_theme: Theme) => ({
  note: {
    paddingHorizontal: inset.screen,
  },
  actions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
});
