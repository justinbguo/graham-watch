import { Pressable } from 'react-native-gesture-handler';

import { HIT_TARGET, radius, size, space } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';
import type { Theme } from '@/lib/theme';

/**
 * The mark on a saved watch nobody has written about yet. On the wishlist it
 * sits on the row's top-trailing corner, past the type. On a photograph it
 * still hugs the frame's corner when used there.
 */
export function InquireMark({
  label,
  onPress,
  anchor = 'photo',
}: {
  label: string;
  onPress: () => void;
  anchor?: 'photo' | 'row';
}) {
  const styles = useThemedStyles(markStyles);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={(HIT_TARGET - size.unread) / 2}
      onPress={onPress}
      style={anchor === 'row' ? styles.dotRow : styles.dotPhoto}
    />
  );
}

const markStyles = (theme: Theme) => ({
  dotPhoto: {
    position: 'absolute' as const,
    top: -size.unread / 2,
    right: -size.unread / 2,
    width: size.unread,
    height: size.unread,
    borderRadius: radius.full,
    backgroundColor: theme.color.notice,
    zIndex: 1,
  },
  dotRow: {
    position: 'absolute' as const,
    top: space.md,
    right: 0,
    width: size.unread,
    height: size.unread,
    borderRadius: radius.full,
    backgroundColor: theme.color.notice,
    zIndex: 2,
  },
});
