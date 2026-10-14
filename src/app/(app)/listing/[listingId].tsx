import { router, useLocalSearchParams } from 'expo-router';
import { Alert, ScrollView, Text, View } from 'react-native';

import { PhotoCarousel } from '@/components/PhotoCarousel';
import { Button, Centered, CloseButton, Message, Screen, Spinner } from '@/components/ui';
import { useOpenMailDraft } from '@/data/inquiries';
import { useListing, useSaved } from '@/data/listings';
import { useRecordSwipe } from '@/data/swipes';
import { ListingDetails } from '@/features/listings/ListingDetails';
import { formatPrice, formatTitle } from '@/lib/format';
import { useOpenStack } from '@/lib/openStack';
import { HIT_TARGET, inset, radius, size, space, stack, type, type Theme } from '@/lib/theme';
import { useSession } from '@/providers/session';
import { useThemedStyles } from '@/providers/theme';

/**
 * The frame a watch gets when there is no card to scroll: opened from the wishlist, a
 * search result, or a grid tile. The deck reads the same content inside the
 * card itself, so everything below the price comes from `ListingDetails`.
 */
// A full-screen modal over scraped fields. Its own boundary keeps the failure
// inside the modal, where "Go back" still returns to the deck.
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ErrorState';

export default function ListingScreen() {
  const { listingId, from } = useLocalSearchParams<{ listingId: string; from?: string }>();
  const { userId } = useSession();
  const { data: card, isPending } = useListing(listingId);
  const { data: saved = [] } = useSaved(userId);
  const save = useRecordSwipe(userId);
  const contact = useOpenMailDraft(userId);
  const open = useOpenStack();
  const styles = useThemedStyles(detailStyles);

  const isSaved = saved.some((entry) => entry.id === listingId);

  const judge = (direction: 'left' | 'right', after?: () => void) => {
    save.mutate(
      { listingId: card!.id, direction },
      {
        onSuccess: () => {
          after?.();
        },
      }
    );
  };
  // Search is a place to look. Passing there would drop a watch out of a deck
  // the user has not reached yet, and writing to a dealer is a step you take
  // about a watch you have kept, so saving is the only verdict it offers.
  const fromSearch = from === 'search';

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
    <Screen>
      {/* Outside the scroll, on the close button's line. A name that leaves
          with the photograph is gone by the time you reach the caliber. */}
      <View style={styles.headline}>
        <Text style={styles.model}>{formatTitle(card)}</Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatPrice(card)}</Text>
          <CloseButton onPress={() => router.back()} />
        </View>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
        <View style={styles.photo}>
          <PhotoCarousel
            photos={card.photos}
            active
            onExpand={(index) =>
              open(
                'photos/[listingId]',
                { listingId: card.id, index: String(index) },
                `/photos/${card.id}?index=${index}`
              )
            }
          />
        </View>

        <ListingDetails
          card={card}
          // A watch already on the wishlist has nothing left to decide here. The row
          // carries Message and slides left to remove, so repeating both
          // on the page put a verdict in front of a watch already chosen.
          actions={
            isSaved ? null : (
              <>
                <Button
                  label="Add to wishlist"
                  icon="bookmark-outline"
                  variant="outline"
                  loading={save.isPending && save.variables?.direction === 'right'}
                  onPress={() => judge('right')}
                />
                {/* The grid has no verdict of its own. Passing here is the left
                    swipe: the watch leaves the deck, and this screen goes with it. */}
                {fromSearch || card.sold_at ? null : (
                  <Button
                    label="Pass"
                    icon="close"
                    variant="ghost"
                    loading={save.isPending && save.variables?.direction === 'left'}
                    disabled={save.isPending}
                    onPress={() => judge('left', () => router.back())}
                  />
                )}
                {/* The whole point of tracking sold stock: no one writes to a dealer
                    about a watch that went months ago. */}
                {fromSearch || card.sold_at ? null : (
                  <Button
                    label="Ask about this watch"
                    icon="email-outline"
                    loading={contact.isPending}
                    onPress={() => {
                      contact.mutate(
                        { card, message: '' },
                        {
                          onError: (error) => Alert.alert('Could not open Gmail', error.message),
                        }
                      );
                    }}
                  />
                )}
              </>
            )
          }
        />
      </ScrollView>
    </Screen>
  );
}

const detailStyles = (theme: Theme) => ({
  scroll: {
    flex: 1,
  },
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
  // One line with the close control. The name takes the leftover width and
  // wraps; the price and the X stay on that line.
  headline: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingHorizontal: inset.screen,
    paddingBottom: space.lg,
    backgroundColor: theme.color.background,
  },
  model: {
    ...type.title,
    color: theme.color.text,
    flex: 1,
    minWidth: 0,
  },
  priceRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flexShrink: 0,
  },
  price: {
    ...type.price,
    color: theme.color.text,
    // The X sits at the end of a 44pt target, so 20 points of that target
    // fall between the price and the glyph. Cancel them, then leave space.sm.
    marginRight: space.sm - (HIT_TARGET - size.icon),
  },
});
