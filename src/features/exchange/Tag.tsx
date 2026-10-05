import { Text, View } from 'react-native';

import { radius, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/**
 * A flair: one fact about a post or the person who wrote it, in a filled
 * capsule. What a post is — Selling, Buying, Trading — and what it costs,
 * beside the title when they fit; which collector wrote it, beside their name.
 *
 * Filled and unpressable, at caption size. A flair stays smaller than a
 * control, so a label on a post does not read as a button.
 */
export function Tag({ label, tone = 'plain' }: { label: string; tone?: 'plain' | 'quiet' }) {
  const styles = useThemedStyles(tagStyles);
  return (
    <View style={styles.tag}>
      <Text style={tone === 'quiet' ? styles.quiet : styles.label}>{label}</Text>
    </View>
  );
}

const tagStyles = (theme: Theme) => ({
  tag: {
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.full,
    backgroundColor: theme.color.fill,
  },
  label: {
    ...type.caption,
    color: theme.color.text,
  },
  // A badge that belongs to the byline rather than to the post: it sits in a
  // line of grey type and should not outrank the name in front of it.
  quiet: {
    ...type.caption,
    color: theme.color.textMuted,
  },
});
