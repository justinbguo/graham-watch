import { useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';

import { Screen } from '@/components/ui';
import { desktopSplitRailEdge } from '@/lib/desktopSplit';
import { useDesktopColumnWidth } from '@/lib/layout';
import { useOpenStack } from '@/lib/openStack';
import { layout, radius, space, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { ConversationList } from './ConversationList';
import type { InboxFilter } from './inboxFilter';
import { ConversationScreen } from './ConversationScreen';
import { MessagesPanePlaceholder } from './MessagesPanePlaceholder';
import { NewMessageButton } from './NewMessageButton';

type DesktopMessagesLayoutProps = {
  userId: string;
  conversationId?: string | null;
  listingId?: string | null;
  /** Seller Hub: inbox sits inside hub tabs without an outer `Screen`. */
  embedded?: boolean;
  back?: { label: string; onPress: () => void };
};

/**
 * WhatsApp-style inbox on the left, thread on the right. Desktop web only.
 * Inbox filters are pills under search; the outer tool rail is hub sections.
 */
export function DesktopMessagesLayout({
  userId,
  conversationId = null,
  listingId = null,
  embedded = false,
  back,
}: DesktopMessagesLayoutProps) {
  const styles = useThemedStyles(layoutStyles);
  const columnWidth = useDesktopColumnWidth();
  const inboxWidth = Math.round(columnWidth * layout.messagesPaneShare);
  const open = useOpenStack();
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>('all');

  function clearThread() {
    router.setParams({ conversationId: '', listingId: '' });
  }

  const openNewMessage = () => open('new-message', undefined, '/new-message');

  const body = (
    <View style={styles.split}>
      <View style={[styles.inbox, { width: inboxWidth }]}>
        <ConversationList
          userId={userId}
          embedded
          desktopInbox
          inboxFilter={inboxFilter}
          onInboxFilterChange={setInboxFilter}
          selectedConversationId={conversationId}
          toolbarTrailing={<NewMessageButton compact onPress={openNewMessage} />}
        />
      </View>
      <View style={styles.thread}>
        {conversationId ? (
          <ConversationScreen
            key={`${conversationId}:${listingId ?? ''}`}
            conversationId={conversationId}
            listingId={listingId}
            layout="pane"
            onLeaveThread={clearThread}
          />
        ) : (
          <MessagesPanePlaceholder />
        )}
      </View>
    </View>
  );

  if (embedded) {
    return body;
  }

  return (
    <Screen inTabs={!back} back={back} width="deckFrameWeb" desktopBleed>
      {body}
    </Screen>
  );
}

const layoutStyles = (theme: Theme) => ({
  split: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'stretch' as const,
    minHeight: 0,
    marginTop: 0,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    overflow: 'hidden' as const,
    backgroundColor: theme.color.messageInbox,
  },
  inbox: {
    flexShrink: 0,
    minHeight: 0,
    backgroundColor: theme.color.messageInbox,
    ...desktopSplitRailEdge(theme),
  },
  thread: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    backgroundColor: theme.color.background,
  },
});
