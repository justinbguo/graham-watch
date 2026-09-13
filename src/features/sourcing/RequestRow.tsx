import { Pressable, Text, View } from 'react-native';

import { formatRelativeTime } from '@/lib/format';
import { space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import type { SourcingRequest } from './types';

function meta(request: SourcingRequest): string {
  const replies =
    request.replies.length === 1 ? '1 reply' : `${request.replies.length} replies`;
  const looking =
    request.lookingCount === 1 ? '1 looking' : `${request.lookingCount} looking`;
  return `${request.authorName} · ${formatRelativeTime(request.createdAt)} · ${replies} · ${looking}`;
}

export function RequestRow({
  request,
  onPress,
}: {
  request: SourcingRequest;
  onPress: () => void;
}) {
  const styles = useThemedStyles(rowStyles);
  const detail = [request.reference, request.budget].filter(Boolean).join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <Text style={styles.brand}>{request.brand}</Text>
      <Text style={styles.model}>{request.model}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      {request.body ? (
        <Text style={styles.body} numberOfLines={2}>
          {request.body}
        </Text>
      ) : null}
      <Text style={styles.meta}>{meta(request)}</Text>
    </Pressable>
  );
}

const rowStyles = (theme: Theme) => ({
  row: {
    paddingVertical: space.lg,
    gap: stack.tight,
  },
  pressed: {
    opacity: 0.72,
  },
  brand: {
    ...type.eyebrow,
    color: theme.color.textMuted,
  },
  model: {
    ...type.titleSmall,
    color: theme.color.text,
  },
  detail: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  body: {
    ...type.body,
    color: theme.color.textMuted,
    paddingTop: space.xs,
  },
  meta: {
    ...type.caption,
    color: theme.color.textFaint,
    paddingTop: space.sm,
  },
});
