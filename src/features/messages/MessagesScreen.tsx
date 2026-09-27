import { FlatList, View } from 'react-native';

import { Centered, Heading, Message, Screen, Spinner } from '@/components/ui';
import { useConversations } from '@/data/messages';
import { useOpenStack } from '@/lib/openStack';
import { inset, space, type Theme } from '@/lib/theme';
import { useSession } from '@/providers/session';
import { useThemedStyles } from '@/providers/theme';

import { ConversationRow } from './ConversationRow';

export function MessagesScreen() {
  const { userId } = useSession();
  const styles = useThemedStyles(screenStyles);
  const open = useOpenStack();
  const { data: conversations = [], isPending, error } = useConversations(userId);

  if (!userId) {
    return (
      <Screen title="Messages" inTabs>
        <View style={styles.note}>
          <Message text="Sign in to read your messages." />
        </View>
      </Screen>
    );
  }

  if (isPending) {
    return (
      <Screen title="Messages" inTabs>
        <Spinner />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen title="Messages" inTabs>
        <View style={styles.note}>
          <Message text="Your messages did not load." tone="error" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen title="Messages" inTabs>
      <FlatList
        data={conversations}
        keyExtractor={(conversation) => conversation.id}
        contentContainerStyle={conversations.length === 0 ? styles.empty : styles.list}
        ListEmptyComponent={
          <Centered>
            <Heading>No messages yet</Heading>
            {/* The two ways in, named: there is no directory to search, so a
                conversation always starts from something someone wrote or a
                watch they are selling. */}
            <Message text="Ask a shop about a watch, or write to someone from a post on the exchange." />
          </Centered>
        }
        renderItem={({ item }) => (
          <ConversationRow
            conversation={item}
            onPress={() =>
              open(
                'conversation/[conversationId]',
                { conversationId: item.id },
                `/conversation/${item.id}`
              )
            }
          />
        )}
      />
    </Screen>
  );
}

const screenStyles = (_theme: Theme) => ({
  list: {
    paddingHorizontal: inset.screen,
    paddingBottom: space.xxxl,
  },
  empty: {
    paddingHorizontal: inset.screen,
    flexGrow: 1,
  },
  note: {
    paddingHorizontal: inset.screen,
  },
});
