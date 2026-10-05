import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';

import { TabBar } from '@/components/TabBar';
import { SaveTargetIcon } from '@/features/saved/flight';
import { useSavedCount } from '@/features/saved/count';
import { useIsWide } from '@/lib/layout';
import { size } from '@/lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * Ionicons here, MaterialCommunityIcons everywhere else. The bar carries no
 * words under its glyphs, so they have to hold a screen on their own, and
 * Ionicons draws a heavier stroke at the same point size. A glyph sitting
 * beside a label has the opposite job and stays on the lighter family.
 *
 * Outline when idle, solid when active. Mixing families inside the bar is the
 * fastest way to make it look assembled rather than designed.
 */
const ICONS: Record<string, { active: IconName; idle: IconName }> = {
  index: { active: 'watch', idle: 'watch-outline' },
  search: { active: 'search', idle: 'search-outline' },
  community: { active: 'people', idle: 'people-outline' },
  profile: { active: 'person-circle', idle: 'person-circle-outline' },
};

export default function TabsLayout() {
  const isWide = useIsWide();
  const saved = useSavedCount();

  return (
    <Tabs
      // The bar draws itself. All this layout still owns is which tabs exist,
      // what each is called, what it shows, and which edge it sits on.
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarPosition: isWide ? 'left' : 'bottom',
        tabBarIcon: ({ color, focused }) => {
          const icon = ICONS[route.name];
          if (!icon) return null;
          return (
            <Ionicons name={focused ? icon.active : icon.idle} size={size.tabIcon} color={color} />
          );
        },
      })}>
      <Tabs.Screen name="index" options={{ title: 'Buy' }} />
      <Tabs.Screen name="search" options={{ title: 'Search' }} />
      <Tabs.Screen name="community" options={{ title: 'Community' }} />
      <Tabs.Screen
        name="saved"
        options={{
          title: 'Saved',
          // The bookmark draws itself so it can report where a saved card
          // should land, which is the glyph the count sits on.
          tabBarIcon: ({ color, focused }) => <SaveTargetIcon color={color} focused={focused} />,
          tabBarBadge: saved || undefined,
        }}
      />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
