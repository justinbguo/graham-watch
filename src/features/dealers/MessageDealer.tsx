import { Image } from 'expo-image';
import { ActivityIndicator, Alert, Pressable, Text } from 'react-native';

import { useMessageDealer } from '@/data/messages';
import { type Theme } from '@/lib/theme';
import { useOpenConversation } from '@/features/messages/useOpenConversation';
import { useSession } from '@/providers/session';
import { useTheme, useThemedStyles } from '@/providers/theme';

import { dealerSocialButtonStyles, dealerSocialHitSlop } from './socialButton';

const MARK = require('../../../assets/message.svg');

/** Same chrome as Follow. Outline in every state. Opens the shop's thread. */
export function MessageDealer({
  dealer,
  listingId,
  block = false,
}: {
  dealer: { id: string; name: string };
  /** Set when the button sits under one watch, so the message names it. */
  listingId?: string;
  /** Half of a full-width pair beside Follow. */
  block?: boolean;
}) {
  const { userId } = useSession();
  const theme = useTheme();
  const styles = useThemedStyles(messageStyles);
  const openConversation = useOpenConversation();
  const start = useMessageDealer();

  if (!userId) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Message ${dealer.name}`}
      accessibilityState={{ busy: start.isPending }}
      disabled={start.isPending}
      hitSlop={dealerSocialHitSlop()}
      onPress={() =>
        start.mutate(dealer.id, {
          onSuccess: (conversationId) =>
            openConversation({ conversationId, listingId }),
          onError: (error) => Alert.alert('Could not open that message', error.message),
        })
      }
      style={({ pressed }) => [styles.button, block && styles.block, pressed && styles.pressed]}>
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
      <Text style={styles.label} numberOfLines={1}>Message</Text>
    </Pressable>
  );
}

const messageStyles = (theme: Theme) => dealerSocialButtonStyles(theme);
