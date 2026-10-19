import { useState } from 'react';
import { Platform, View } from 'react-native';

import { Screen } from '@/components/ui';
import type { DealerAccount } from '@/data/dealers';
import { ConversationList } from '@/features/messages/ConversationList';
import { useUnreadCount } from '@/features/messages/count';
import { useOpenStack } from '@/lib/openStack';
import { inset, space, stack, type Theme } from '@/lib/theme';
import { useSession } from '@/providers/session';
import { useThemedStyles } from '@/providers/theme';

import { HubNewMessageButton } from './HubNewMessageButton';
import { HubPanel } from './HubPanel';
import { HubPlaceholder } from './HubPlaceholder';
import type { HubSectionId } from './HubSection';
import { HubTabBar } from './HubTabBar';
import { SellerListingsPanel } from './SellerListingsPanel';

export function SellerHubScreen({ shop: _shop }: { shop: DealerAccount }) {
  const styles = useThemedStyles(hubStyles);
  const open = useOpenStack();
  const { userId } = useSession();
  const unread = useUnreadCount();
  const [tab, setTab] = useState<HubSectionId>('messages');

  const openNewMessage = () => open('new-message', undefined, '/new-message');

  return (
    <Screen title="Your Shop" inTabs width={Platform.OS === 'web' ? 'hub' : 'reading'}>
      <View style={styles.body}>
        <HubTabBar value={tab} onChange={setTab} messagesUnread={unread > 0} />
        <View style={styles.content}>
          {tab === 'messages' && userId ? (
            <View style={styles.messages}>
              <ConversationList
                userId={userId}
                embedded
                toolbarTrailing={<HubNewMessageButton onPress={openNewMessage} />}
              />
            </View>
          ) : null}
          {tab === 'payments' ? (
            <HubPanel>
              <HubPlaceholder
                body="Holds, payouts, and Graham fees on in-app deals will show here. Apple Pay and seller payouts are not wired yet."
              />
            </HubPanel>
          ) : null}
          {tab === 'customers' ? (
            <HubPanel>
              <HubPlaceholder
                body="Repeat buyers and inquiry history will live here. Open Messages for buyer threads."
              />
            </HubPanel>
          ) : null}
          {tab === 'listings' ? (
            Platform.OS === 'web' ? (
              <View style={styles.listingsWeb}>
                <SellerListingsPanel active={tab === 'listings'} />
              </View>
            ) : (
              <View style={styles.listingsFlat}>
                <SellerListingsPanel active={tab === 'listings'} />
              </View>
            )
          ) : null}
        </View>
      </View>
    </Screen>
  );
}

const hubStyles = (_theme: Theme) => ({
  body: {
    flex: 1,
    paddingHorizontal: inset.screen,
    gap: stack.related,
    minHeight: 0,
    marginTop: -space.md,
  },
  content: {
    flex: 1,
    minHeight: 0,
  },
  messages: {
    flex: 1,
    minHeight: 0,
  },
  listingsFlat: {
    flex: 1,
    minHeight: 0,
  },
  listingsWeb: {
    flex: 1,
    minHeight: 0,
    paddingTop: space.md,
  },
});
