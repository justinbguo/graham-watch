import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';

import { HeaderIcon } from '@/components/HeaderIcon';
import { Screen, Message } from '@/components/ui';
import type { ExchangeAuthor } from '@/data/exchange';
import { inset, motion, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';
import { useSession } from '@/providers/session';

import { Collector } from './Collector';
import { Composer } from './Composer';
import { Feed } from './Feed';
import { IntentFilter, type FeedFilter } from './IntentFilter';
import { Thread } from './Thread';

type Place =
  | { kind: 'feed' }
  | { kind: 'new' }
  | { kind: 'edit'; id: string }
  | { kind: 'post'; id: string }
  | { kind: 'person'; author: ExchangeAuthor };

const DEAL =
  'You pay the other person directly. Graham does not hold the money or the watch. Comment on a post before you deal with them.';

function explainDeal() {
  Alert.alert('How a deal works', DEAL);
}

export function CommunityScreen() {
  const { userId } = useSession();
  const styles = useThemedStyles(screenStyles);
  const [stack, setStack] = useState<Place[]>([{ kind: 'feed' }]);
  // Held here, not in the feed, so a thread opened and closed comes back to
  // the same filter: the feed unmounts while a post is on top.
  const [filter, setFilter] = useState<FeedFilter>('all');
  const { post } = useLocalSearchParams<{ post?: string }>();
  const opened = Array.isArray(post) ? post[0] : post;
  // The Profile tab has no thread of its own. It names the post, and this
  // screen opens it. Clearing the param keeps a later visit on the feed.
  useEffect(() => {
    if (!opened) return;
    setStack((current) => {
      const top = current[current.length - 1];
      if (top?.kind === 'post' && top.id === opened) return current;
      return [...current, { kind: 'post', id: opened }];
    });
    router.setParams({ post: '' });
  }, [opened]);
  const mode = stack[stack.length - 1] ?? { kind: 'feed' };
  const back = () => setStack((current) => (current.length > 1 ? current.slice(0, -1) : current));
  const push = (next: Place) => setStack((current) => [...current, next]);
  const openAuthor = (author: ExchangeAuthor) => {
    if (!author.id) return;
    push({ kind: 'person', author });
  };

  if (!userId) {
    return (
      <Screen title="Community" inTabs>
        <View style={styles.note}>
          <Message text="Sign in to join the community." />
        </View>
      </Screen>
    );
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
        back={{ label: 'Back to posts', onPress: back }}>
        <Animated.View key="compose" entering={arrive} style={styles.view}>
          <Composer
            userId={userId}
            postId={mode.kind === 'edit' ? mode.id : null}
            onPosted={(id) => setStack((current) => [...current.slice(0, -1), { kind: 'post', id }])}
          />
        </Animated.View>
      </Screen>
    );
  }

  if (mode.kind === 'person') {
    const name = mode.author.name ?? (mode.author.handle ? `@${mode.author.handle}` : 'Collector');
    return (
      <Screen
        title={name}
        inTabs
        back={{ label: 'Back', onPress: back }}>
        <Animated.View key={mode.author.id} entering={arrive} style={styles.view}>
          <Collector author={mode.author} onOpenPost={(id) => push({ kind: 'post', id })} />
        </Animated.View>
      </Screen>
    );
  }

  if (mode.kind === 'post') {
    return (
      <Screen
        title="Community"
        inTabs
        back={{ label: 'Back to posts', onPress: back }}>
        <Animated.View key={mode.id} entering={arrive} style={styles.view}>
          <Thread
            userId={userId}
            postId={mode.id}
            onEdit={() => push({ kind: 'edit', id: mode.id })}
            onDeleted={back}
            onOpenAuthor={openAuthor}
          />
        </Animated.View>
      </Screen>
    );
  }

  return (
    <Screen
      title="Community"
      inTabs
      subhead={<IntentFilter value={filter} onChange={setFilter} />}
      action={
        <View style={styles.actions}>
          <HeaderIcon label="How a deal works" name="information-outline" onPress={explainDeal} />
          <HeaderIcon label="New post" name="plus" onPress={() => push({ kind: 'new' })} />
        </View>
      }>
      <Animated.View key="feed" entering={arrive} style={styles.view}>
        <Feed
          userId={userId}
          filter={filter}
          onOpen={(id) => push({ kind: 'post', id })}
          onOpenAuthor={openAuthor}
        />
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
