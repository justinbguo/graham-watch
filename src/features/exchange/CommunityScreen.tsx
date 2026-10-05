import { useState } from 'react';
import { Alert, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { HeaderIcon } from '@/components/HeaderIcon';
import { Screen, Message } from '@/components/ui';
import { MessagesButton } from '@/features/messages/MessagesButton';
import { MessagesView } from '@/features/messages/MessagesView';
import { inset, motion, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';
import { useSession } from '@/providers/session';

import { Composer } from './Composer';
import { Feed } from './Feed';
import { Thread } from './Thread';

type Mode =
  | { kind: 'feed' }
  | { kind: 'messages' }
  | { kind: 'new' }
  | { kind: 'edit'; id: string }
  | { kind: 'post'; id: string };

const DEAL =
  'You pay the other person directly. Graham does not hold the money or the watch. Comment on a post before you deal with them.';

function explainDeal() {
  Alert.alert('How a deal works', DEAL);
}

export function CommunityScreen() {
  const { userId } = useSession();
  const styles = useThemedStyles(screenStyles);
  const [mode, setMode] = useState<Mode>({ kind: 'feed' });
  const back = () => setMode({ kind: 'feed' });

  if (!userId) {
    return (
      <Screen title="Community" inTabs>
        <View style={styles.note}>
          <Message text="Sign in to join the community." />
        </View>
      </Screen>
    );
  }

  if (mode.kind === 'messages') {
    return <MessagesView onClose={back} />;
  }

  // The views trade places rather than cutting, the way the deck's two views
  // do. Entering only: the old one is gone the frame the mode changes. The
  // moment this is for is the composer closing onto the post it just made.
  const arrive = FadeIn.duration(motion.base);

  if (mode.kind === 'new' || mode.kind === 'edit') {
    return (
      <Screen
        title={mode.kind === 'edit' ? 'Edit post' : 'New post'}
        inTabs
        action={<HeaderIcon label="Back to posts" name="arrow-left" onPress={back} />}>
        <Animated.View key="compose" entering={arrive} style={styles.view}>
          <Composer
            userId={userId}
            postId={mode.kind === 'edit' ? mode.id : null}
            onPosted={(id) => setMode({ kind: 'post', id })}
          />
        </Animated.View>
      </Screen>
    );
  }

  if (mode.kind === 'post') {
    return (
      <Screen
        title="Community"
        inTabs
        action={<HeaderIcon label="Back to posts" name="arrow-left" onPress={back} />}>
        <Animated.View key={mode.id} entering={arrive} style={styles.view}>
          <Thread
            userId={userId}
            postId={mode.id}
            onEdit={() => setMode({ kind: 'edit', id: mode.id })}
            onDeleted={back}
          />
        </Animated.View>
      </Screen>
    );
  }

  return (
    <Screen
      title="Community"
      inTabs
      action={
        <View style={styles.actions}>
          <MessagesButton onPress={() => setMode({ kind: 'messages' })} />
          <HeaderIcon label="How a deal works" name="information-outline" onPress={explainDeal} />
          <HeaderIcon label="New post" name="plus" onPress={() => setMode({ kind: 'new' })} />
        </View>
      }>
      <Animated.View key="feed" entering={arrive} style={styles.view}>
        <Feed userId={userId} onOpen={(id) => setMode({ kind: 'post', id })} />
      </Animated.View>
    </Screen>
  );
}

const screenStyles = (_theme: Theme) => ({
  note: {
    paddingHorizontal: inset.screen,
  },
  view: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
});
