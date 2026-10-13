import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Tabs } from 'expo-router';

import { BuyTabIcon } from '@/components/BuyTabIcon';
import { TabBar } from '@/components/TabBar';
import { useUnreadCount } from '@/features/messages/count';
import { ProfileTabIcon } from '@/features/profile/ProfileTabIcon';
import { SaveTargetIcon } from '@/features/saved/flight';
import { useSavedCount } from '@/features/saved/count';
import { useIsWide } from '@/lib/layout';
import { size } from '@/lib/theme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

/**
 * The same family as every other glyph, at `size.tabIcon`. They were Ionicons,
 * a heavier stroke, and the current tab swapped to a solid cut. Colour already
 * says which tab is on — full white against 55% — so the glyph stays an outline.
 * Buy is the commissioned watch, one outline tinted to the bar.
 */
const ICONS: Record<string, IconName> = {
  community: 'account-multiple-outline',
  messages: 'message-outline',
};

export default function TabsLayout() {
  const isWide = useIsWide();
  const saved = useSavedCount();
  const unread = useUnreadCount();

  return (
    <Tabs
      // The bar draws itself. All this layout still owns is which tabs exist,
      // what each is called, what it shows, and which edge it sits on.
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarPosition: isWide ? 'left' : 'bottom',
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
          tabBarIcon: ({ color }) => <BuyTabIcon color={color} />,
        }}
      />
      <Tabs.Screen name="community" options={{ title: 'Community' }} />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarBadge: unread || undefined,
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
      {/* Still a tab, so the bar stays on screen. No glyph: the deck's field is the door. */}
      <Tabs.Screen name="search" options={{ title: 'Search', href: null }} />
      {/* Landed on main after this branch replaced that tab with Community. */}
      <Tabs.Screen name="source" options={{ href: null }} />
    </Tabs>
  );
}
