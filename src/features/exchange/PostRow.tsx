import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';

import type { CollectorPost } from '@/data/exchange';
import { radius, size, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { PostTitle } from './PostTitle';

/**
 * One post in a person's list: the cover, the watch and its price, and two
 * lines of what they wrote. The community profile and the Profile tab share
 * this row so the same post does not grow a second shape.
 */
export function PostRow({ post, onPress }: { post: CollectorPost; onPress: () => void }) {
  const styles = useThemedStyles(rowStyles);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={post.title}
      onPress={onPress}
      style={({ pressed }) => [styles.post, pressed && styles.pressed]}>
      {post.cover_url ? (
        <Image source={{ uri: post.cover_url }} style={styles.cover} contentFit="cover" accessible={false} />
      ) : (
        <View style={styles.cover} />
      )}
      <View style={styles.copy}>
        <PostTitle title={post.title} post={post} />
        <Text style={styles.body} numberOfLines={2}>
          {post.body}
        </Text>
      </View>
    </Pressable>
  );
}

const rowStyles = (theme: Theme) => ({
  post: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingVertical: space.md,
    borderTopWidth: 1,
    borderTopColor: theme.color.border,
  },
  cover: {
    width: size.gridPhoto,
    height: size.gridPhoto,
    borderRadius: radius.md,
    backgroundColor: theme.color.surfaceSunken,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: space.sm,
  },
  body: {
    ...type.label,
    color: theme.color.textMuted,
  },
  pressed: {
    opacity: 0.72,
  },
});
