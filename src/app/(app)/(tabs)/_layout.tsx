import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Tabs } from 'expo-router';

import { TabBar } from '@/components/TabBar';
import { SaveTargetIcon } from '@/features/saved/flight';
import { useIsWide } from '@/lib/layout';
import { size } from '@/lib/theme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

// One family, outline when idle and solid when active. Mixing families is the
// fastest way to make a tab bar look assembled rather than designed.
const ICONS: Record<string, { active: IconName; idle: IconName }> = {
  index: { active: 'watch', idle: 'watch-variant' },
  search: { active: 'magnify', idle: 'magnify' },
  profile: { active: 'account', idle: 'account-outline' },
};

export default function TabsLayout() {
  const isWide = useIsWide();

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
            <MaterialCommunityIcons
              name={focused ? icon.active : icon.idle}
              size={size.icon}
              color={color}
            />
          );
        },
      })}>
      <Tabs.Screen name="index" options={{ title: 'Buy' }} />
      <Tabs.Screen name="search" options={{ title: 'Search' }} />
      <Tabs.Screen
        name="saved"
        options={{
          title: 'Saved',
          // The bookmark draws itself so it can report where a saved card
          // should land, which is the glyph rather than the word under it.
          tabBarIcon: ({ color, focused }) => <SaveTargetIcon color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
