import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { PhotoCarousel } from '@/components/PhotoCarousel';
import { Button, Centered, CloseButton, Message, Screen, Spinner } from '@/components/ui';
import { useListing, useSaved } from '@/data/listings';
import { useRecordSwipe, useUnsave } from '@/data/swipes';
import { ListingDetails } from '@/features/listings/ListingDetails';
import { formatPrice, formatTitle } from '@/lib/format';
import { inset, radius, space, stack, type, type Theme } from '@/lib/theme';
import { useSession } from '@/providers/session';
import { useThemedStyles } from '@/providers/theme';

/**
 * The frame a watch gets when there is no card to scroll: opened from Saved, a
 * search result, or a grid tile. The deck reads the same content inside the
 * card itself, so everything below the price comes from `ListingDetails`.
 */
// A full-screen modal over scraped fields. Its own boundary keeps the failure
// inside the modal, where "Go back" still returns to the deck.
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ErrorState';

export default function ListingScreen() {
  const { listingId } = useLocalSearchParams<{ listingId: string }>();
  const { userId } = useSession();
  const { data: card, isPending } = useListing(listingId);
  const { data: saved = [] } = useSaved(userId);
  const save = useRecordSwipe(userId);
  const unsave = useUnsave(userId);
  const styles = useThemedStyles(detailStyles);

  const isSaved = saved.some((entry) => entry.id === listingId);

  if (isPending) {
    return (
      <Screen action={<CloseButton onPress={() => router.back()} />}>
        <Spinner />
      </Screen>
    );
  }

  if (!card) {
    return (
      <Screen action={<CloseButton onPress={() => router.back()} />}>
        <Centered>
          <Message text="That watch is no longer available." tone="error" />
          <Button label="Close" variant="outline" onPress={() => router.back()} />
        </Centered>
      </Screen>
    );
  }

  return (
    <Screen action={<CloseButton onPress={() => router.back()} />}>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.photo}>
          <PhotoCarousel
            photos={card.photos}
            active
            onExpand={(index) => router.push(`/photos/${card.id}?index=${index}`)}
          />
        </View>

        <View style={styles.headline}>
          <Text style={styles.model}>{formatTitle(card)}</Text>
          <Text style={styles.price}>{formatPrice(card)}</Text>
        </View>

        <ListingDetails
          card={card}
          actions={
            <>
              {/* A toggle, not a button that greys out once used. Saving from here
                  is the same right swipe, so undoing it has to be reachable too. */}
              <Button
                label={isSaved ? 'Saved' : 'Save watch'}
                variant="outline"
                loading={save.isPending || unsave.isPending}
                onPress={() =>
                  isSaved
                    ? unsave.mutate(card.id)
                    : save.mutate({ listingId: card.id, direction: 'right' })
                }
              />
              {/* The whole point of tracking sold stock: no one writes to a dealer
                  about a watch that went months ago. */}
              {card.sold_at ? null : (
                <Button
                  label="Ask about this watch"
                  onPress={() => router.push(`/inquiry/${card.id}`)}
                />
              )}
            </>
          }
        />
      </ScrollView>
    </Screen>
  );
}

const detailStyles = (theme: Theme) => ({
  body: {
    paddingHorizontal: inset.screen,
    paddingBottom: space.xxl,
    gap: stack.group,
  },
  photo: {
    aspectRatio: 4 / 5,
    borderRadius: radius.lg,
    overflow: 'hidden' as const,
  },
  headline: {
    gap: stack.tight,
  },
  model: {
    ...type.display,
    color: theme.color.text,
  },
  price: {
    ...type.price,
    color: theme.color.text,
    paddingTop: space.sm,
  },
});
