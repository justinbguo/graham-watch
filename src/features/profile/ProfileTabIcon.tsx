import { View, type ColorValue } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { useProfile } from '@/data/profile';
import { radius, size } from '@/lib/theme';
import { useSession } from '@/providers/session';

export function ProfileTabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
  const { userId } = useSession();
  const { data: profile } = useProfile(userId);
  const px = size.tabIcon - size.rule * 2;

  return (
    <View
      style={{
        width: size.tabIcon,
        height: size.tabIcon,
        borderWidth: size.rule,
        borderColor: focused ? color : 'transparent',
        borderRadius: radius.sm,
      }}>
      <Avatar url={profile?.avatar_url ?? null} px={px} />
    </View>
  );
}
