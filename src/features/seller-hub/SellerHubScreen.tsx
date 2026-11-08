import { useState } from 'react';
import { Platform, View } from 'react-native';

import { DeckDesktopFrame } from '@/components/DeckDesktopFrame';
import { DeckRailTools, DeckToolRail } from '@/components/DeckToolRail';
import { PausedFrame } from '@/components/PausedBanner';
import { Screen } from '@/components/ui';
import type { DealerAccount } from '@/data/dealers';
import { DesktopMessagesLayout } from '@/features/messages/DesktopMessagesLayout';
import { ConversationList } from '@/features/messages/ConversationList';
import { useUnreadCount } from '@/features/messages/count';
import { useIsDesktopWeb } from '@/lib/layout';
import { useOpenStack } from '@/lib/openStack';
import { inset, space, stack, type Theme } from '@/lib/theme';
import { useSession } from '@/providers/session';
import { useThemedStyles } from '@/providers/theme';

import { HubNewMessageButton } from './HubNewMessageButton';
import { HubPanel } from './HubPanel';
import { HubPlaceholder } from './HubPlaceholder';
import type { HubSectionId } from './HubSection';
import { HubSellerToolsHeader } from './HubSellerToolsHeader';
import { HubSectionRail } from './HubSectionRail';
import { HubTabBar } from './HubTabBar';
import { SellerAnalyticsPanel } from './SellerAnalyticsPanel';
import { SellerListingsPanel } from './SellerListingsPanel';
import { SellerSupportPanel } from './SellerSupportPanel';

export function SellerHubScreen({
  shop: _shop,
  conversationId = null,
  listingId = null,
}: {
  shop: DealerAccount;
  conversationId?: string | null;
  listingId?: string | null;
}) {
  const isDesktopWeb = useIsDesktopWeb();
  const styles = useThemedStyles(hubStyles);
  const open = useOpenStack();
  const { userId } = useSession();
  const unread = useUnreadCount();
  const [tab, setTab] = useState<HubSectionId>('messages');

  const openNewMessage = () => open('new-message', undefined, '/new-message');

  const hubContent = (
    <View style={styles.content}>
      {tab === 'messages' && userId ? (
        <PausedFrame>
        <View style={styles.messages}>
          {isDesktopWeb ? (
            <DesktopMessagesLayout
              userId={userId}
              embedded
              conversationId={conversationId}
              listingId={listingId}
            />
          ) : (
            <ConversationList
              userId={userId}
              embedded
              selectedConversationId={conversationId}
              toolbarTrailing={<HubNewMessageButton onPress={openNewMessage} />}
            />
          )}
        </View>
        </PausedFrame>
      ) : null}
      {tab === 'payments' ? (
        <HubPanel>
          <HubPlaceholder
            body="Holds, payouts, and Graham fees on in-app deals will show here. Apple Pay and seller payouts are not wired yet."
          />
        </HubPanel>
      ) : null}
      {tab === 'analytics' ? (
        <HubPanel fill>
          <SellerAnalyticsPanel active={tab === 'analytics'} />
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
      {tab === 'support' ? (
        <HubPanel>
          <SellerSupportPanel />
        </HubPanel>
      ) : null}
    </View>
  );

  const desktopRail = (
    <DeckToolRail>
      <DeckRailTools>
        <HubSectionRail value={tab} onChange={setTab} messagesUnread={unread > 0} />
      </DeckRailTools>
    </DeckToolRail>
  );

  return (
    <Screen
      title="Deal"
      inTabs
      width={isDesktopWeb ? 'deckFrameWeb' : Platform.OS === 'web' ? 'hub' : 'reading'}
      desktopBleed={isDesktopWeb}>
      {isDesktopWeb ? (
        <DeckDesktopFrame rail={desktopRail}>{hubContent}</DeckDesktopFrame>
      ) : (
        <View style={styles.body}>
          <HubSellerToolsHeader />
          <HubTabBar value={tab} onChange={setTab} messagesUnread={unread > 0} />
          {hubContent}
        </View>
      )}
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
