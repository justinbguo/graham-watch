import { View, type ColorValue } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { fullName, useProfile } from '@/data/profile';
import { personMonogram } from '@/lib/avatarMonogram';
import { radius, size } from '@/lib/theme';
import { useSession } from '@/providers/session';

/**
 * The Profile tab is you, so it wears your photograph or your initial. The
 * focused tab draws a `size.rule` stroke in the bar's colour around the square.
 */
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
      <Avatar
        url={profile?.avatar_url ?? null}
        px={px}
        monogram={personMonogram({
          userId,
          name: fullName(profile),
          handle: profile?.handle,
        })}
      />
    </View>
  );
}
