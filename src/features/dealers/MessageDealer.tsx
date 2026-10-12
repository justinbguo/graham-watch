import { Image } from 'expo-image';
import { ActivityIndicator, Alert, Pressable, Text } from 'react-native';

import { useMessageDealer } from '@/data/messages';
import { HIT_TARGET, radius, size, space, type, type Theme } from '@/lib/theme';
import { useOpenStack } from '@/lib/openStack';
import { useSession } from '@/providers/session';
import { useTheme, useThemedStyles } from '@/providers/theme';

const MARK = require('../../../assets/message.svg');

/**
 * The same capsule as Following: the body line, outline, the word in
 * `control`. Follow stays the loud one. This one opens the shop's thread.
 */
export function MessageDealer({
  dealer,
  listingId,
}: {
  dealer: { id: string; name: string };
  /** Set when the button sits under one watch, so the message names it. */
  listingId?: string;
}) {
  const { userId } = useSession();
  const theme = useTheme();
  const styles = useThemedStyles(messageStyles);
  const open = useOpenStack();
  const start = useMessageDealer();

  if (!userId) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Message ${dealer.name}`}
      accessibilityState={{ busy: start.isPending }}
      disabled={start.isPending}
      hitSlop={(HIT_TARGET - type.body.lineHeight) / 2}
      onPress={() =>
        start.mutate(dealer.id, {
          onSuccess: (conversationId) =>
            open(
              'conversation/[conversationId]',
              listingId ? { conversationId, listingId } : { conversationId },
              listingId
                ? `/conversation/${conversationId}?listingId=${listingId}`
                : `/conversation/${conversationId}`,
            ),
          onError: (error) => Alert.alert('Could not open that message', error.message),
        })
      }
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      {start.isPending ? (
        <ActivityIndicator size="small" color={theme.color.text} />
      ) : (
        <Image
          source={MARK}
          style={styles.mark}
          contentFit="contain"
          tintColor={theme.color.text}
          accessible={false}
        />
      )}
      <Text style={styles.label}>Message</Text>
    </Pressable>
  );
}

const messageStyles = (theme: Theme) => ({
  button: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    alignSelf: 'flex-start' as const,
    gap: space.xs,
    height: type.body.lineHeight,
    paddingHorizontal: type.body.lineHeight / 2,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: theme.color.text,
    backgroundColor: theme.color.background,
  },
  mark: {
    width: size.iconSmall,
    height: size.iconSmall,
  },
  pressed: {
    opacity: 0.72,
  },
  label: {
    ...type.control,
    color: theme.color.text,
  },
});
