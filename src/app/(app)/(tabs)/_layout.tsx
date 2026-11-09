import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Tabs } from 'expo-router';

import { BuyTabIcon } from '@/components/BuyTabIcon';
import { TabBar } from '@/components/TabBar';
import { useUnseenDropCount } from '@/data/drops';
import { useNewCount } from '@/data/newListings';
import { useUnreadCount } from '@/features/messages/count';
import { useClaimedDealerShop } from '@/features/seller-hub/claimedShop';
import { ProfileTabIcon } from '@/features/profile/ProfileTabIcon';
import { SaveTargetIcon } from '@/features/saved/flight';
import { useSavedCount } from '@/features/saved/count';
import { useIsDesktopWeb, useIsWide } from '@/lib/layout';
import { size } from '@/lib/theme';
import { useTheme } from '@/providers/theme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

/**
 * The same family as every other glyph, at `size.tabIcon`. They were Ionicons,
 * a heavier stroke, and the current tab swapped to a solid cut. Colour already
 * says which tab is on — full white against 55% — so the glyph stays an outline.
 * Buy is the commissioned watch, one outline tinted to the bar.
 */
const ICONS: Record<string, IconName> = {
  new: 'creation-outline',
  community: 'account-multiple-outline',
  // `message-outline` is a box with a tail. `chat-outline` is the same bubble
  // drawn round, which sits with the other round marks in this bar.
  messages: 'chat-outline',
};

export default function TabsLayout() {
  const isDesktopWeb = useIsDesktopWeb();
  const isWide = useIsWide();
  const saved = useSavedCount();
  const fresh = useNewCount();
  const unread = useUnreadCount();
  const drops = useUnseenDropCount();
  // The bar has one count per tab. Threads waiting and unseen drops are both
  // reasons to open Messages, so they share that count.
  const messagesWaiting = unread + drops;
  const { shop, ready } = useClaimedDealerShop();
  const sellerHub = ready && shop;
  const theme = useTheme();

  return (
    <Tabs
      // The bar draws itself. All this layout still owns is which tabs exist,
      // what each is called, what it shows, and which edge it sits on.
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={({ route }) => ({
        headerShown: false,
        sceneStyle: { backgroundColor: theme.color.background },
        tabBarPosition: isDesktopWeb ? 'top' : isWide ? 'left' : 'bottom',
        tabBarIcon: ({ color }) => {
          const icon = ICONS[route.name];
          if (!icon) return null;
          return <MaterialCommunityIcons name={icon} size={size.tabIcon} color={color} />;
        },
      })}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Buy',
          tabBarIcon: ({ color, focused }) => <BuyTabIcon color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen name="new" options={{ title: 'New', tabBarBadge: fresh || undefined }} />
      <Tabs.Screen name="community" options={{ title: 'Community' }} />
      <Tabs.Screen
        name="messages"
        options={{
          title: sellerHub ? 'Deal' : 'Messages',
          tabBarAccessibilityLabel: sellerHub ? 'Deal' : 'Messages',
          tabBarBadge: messagesWaiting || undefined,
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons
              name={sellerHub ? 'storefront-outline' : 'chat-outline'}
              size={size.tabIcon}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: 'Wishlist',
          // The bookmark draws itself so it can report where a saved card
          // should land, which is the glyph the count sits on.
          tabBarIcon: ({ color }) => <SaveTargetIcon color={color} />,
          tabBarBadge: saved || undefined,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => <ProfileTabIcon color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen name="source" options={{ href: null }} />
    </Tabs>
  );
}
