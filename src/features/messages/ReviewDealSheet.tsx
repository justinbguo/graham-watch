import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { SocialButton } from '@/components/SocialButton';
import { Field, Message } from '@/components/ui';
import { useReviewDeal, type ConversationDeal } from '@/data/deals';
import { HIT_TARGET, space, stack, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

import { DealSheetShell, dealSheetActionStyles } from './DealSheetShell';

const STARS = [1, 2, 3, 4, 5] as const;
const STAR_WORDS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];

/** Buyer rates the seller once a deal is complete. One review per deal. */
export function ReviewDealSheet({
  visible,
  deal,
  sellerName,
  onClose,
}: {
  visible: boolean;
  deal: ConversationDeal | null;
  sellerName: string;
  onClose: () => void;
}) {
  const styles = useThemedStyles(reviewStyles);
  const theme = useTheme();
  const review = useReviewDeal(deal?.conversationId ?? '');
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');

  useEffect(() => {
    if (visible) return;
    setRating(0);
    setBody('');
  }, [visible]);

  if (!deal) return null;

  const submit = () => {
    if (!rating) return;
    review.mutate({ dealId: deal.id, rating, body }, { onSuccess: onClose });
  };

  return (
    <DealSheetShell
      visible={visible}
      title={`Rate ${sellerName}`}
      closeLabel="Close review sheet"
      onClose={onClose}>
      <View style={styles.stars} accessibilityRole="radiogroup" accessibilityLabel="Rating">
        {STARS.map((star) => (
          <Pressable
            key={star}
            accessibilityRole="radio"
            accessibilityLabel={`${star} star${star === 1 ? '' : 's'}`}
            accessibilityState={{ selected: rating === star }}
            onPress={() => setRating(star)}
            style={styles.star}>
            <MaterialCommunityIcons
              name={star <= rating ? 'star' : 'star-outline'}
              size={32}
              color={star <= rating ? theme.color.brass : theme.color.textMuted}
            />
          </Pressable>
        ))}
      </View>
      <Text style={styles.word}>{rating ? STAR_WORDS[rating] : 'Tap a star'}</Text>
      <Field
        value={body}
        onChangeText={setBody}
        placeholder="How was the watch, the packing, the communication? (optional)"
        multiline
        maxLength={1000}
        autoCapitalize="sentences"
        editable={!review.isPending}
      />
      {review.error ? <Message text={review.error.message} tone="error" /> : null}
      <View style={dealSheetActionStyles.actions}>
        <SocialButton
          label="Submit review"
          solid
          block
          busy={review.isPending}
          disabled={!rating}
          onPress={submit}
        />
        <SocialButton label="Later" block disabled={review.isPending} onPress={onClose} />
      </View>
    </DealSheetShell>
  );
}

const reviewStyles = (theme: Theme) => ({
  stars: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    gap: space.xs,
    paddingTop: space.sm,
  },
  star: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  word: {
    ...type.label,
    color: theme.color.textMuted,
    textAlign: 'center' as const,
    paddingBottom: stack.tight,
  },
});
