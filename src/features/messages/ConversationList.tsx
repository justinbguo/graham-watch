import { FlatList, View } from 'react-native';

import { Centered, Heading, Message, Spinner } from '@/components/ui';
import { useConversations } from '@/data/messages';
import { useOpenStack } from '@/lib/openStack';
import { inset, space, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { ConversationRow } from './ConversationRow';

/**
 * Every thread you are in, newest movement first. The body only: the
 * Community screen owns the header, because this list is one of its views and
 * the back arrow has to sit where that screen keeps its controls.
 */
export function ConversationList({ userId }: { userId: string }) {
  const styles = useThemedStyles(listStyles);
  const open = useOpenStack();
  const { data: conversations = [], isPending, error } = useConversations(userId);

  if (isPending) return <Spinner />;

  if (error) {
    return (
      <View style={styles.note}>
        <Message text="Your messages did not load." tone="error" />
      </View>
    );
  }

  return (
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
          <Message text="Ask a shop about a watch, or write to someone from a post in the community." />
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
  );
}

const listStyles = (_theme: Theme) => ({
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
