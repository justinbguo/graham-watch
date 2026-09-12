import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Tabs } from 'expo-router';

import { font, space } from '@/lib/theme';
import { useTheme } from '@/providers/theme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

// One icon family, outline when idle and solid when active. Mixing families is
// the fastest way to make a tab bar look assembled rather than designed.
const ICONS: Record<string, { active: IconName; idle: IconName }> = {
  index: { active: 'watch', idle: 'watch-variant' },
  saved: { active: 'bookmark', idle: 'bookmark-outline' },
  profile: { active: 'account', idle: 'account-outline' },
};

export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.color.text,
        tabBarInactiveTintColor: theme.color.textFaint,
        tabBarStyle: {
          backgroundColor: theme.color.surface,
          borderTopColor: theme.color.border,
        },
        tabBarLabelStyle: {
          fontFamily: font.text.medium,
          fontSize: 11,
          letterSpacing: 0.2,
          paddingTop: space.xs / 2,
        },
        tabBarIcon: ({ color, focused }) => {
          const icon = ICONS[route.name];
          if (!icon) return null;
          return (
            <MaterialCommunityIcons
              name={focused ? icon.active : icon.idle}
              size={24}
              color={color}
            />
          );
        },
      })}>
      <Tabs.Screen name="index" options={{ title: 'Deck' }} />
      <Tabs.Screen name="saved" options={{ title: 'Saved' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
