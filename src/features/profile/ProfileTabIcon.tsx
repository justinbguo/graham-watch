import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { View, type ColorValue } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { useProfile } from '@/data/profile';
import { radius, size } from '@/lib/theme';
import { useSession } from '@/providers/session';

/**
 * The Profile tab is you, so it wears your photograph. A photo has no outline
 * glyph, so the current tab draws a `size.rule` stroke in the bar's colour. It
 * was a fill behind the photo. With no photo, the glyph stays an outline
 * either way; colour says whether the tab is on.
 */
export function ProfileTabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
  const { userId } = useSession();
  const { data: profile } = useProfile(userId);

  if (!profile?.avatar_url) {
    return (
      <MaterialCommunityIcons name="account-circle-outline" size={size.tabIcon} color={color} />
    );
  }

  return (
    <View
      style={{
        width: size.tabIcon,
        height: size.tabIcon,
        borderWidth: size.rule,
        borderColor: focused ? color : 'transparent',
        borderRadius: radius.sm,
      }}>
      <Avatar url={profile.avatar_url} px={size.tabIcon - size.rule * 2} />
    </View>
  );
}
