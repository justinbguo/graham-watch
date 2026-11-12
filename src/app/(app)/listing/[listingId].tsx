import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Platform, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { PhotoCarousel } from '@/components/PhotoCarousel';
import { Button, Centered, CloseButton, Message, Screen, Spinner } from '@/components/ui';
import { logEvent, useExposure } from '@/data/listingEvents';
import { useListing, useSaved } from '@/data/listings';
import { useRecordSwipe } from '@/data/swipes';
import { useGuest } from '@/features/auth/GuestProvider';
import { AddToWishlist } from '@/features/listings/AddToWishlist';
import { DealerSiteButton } from '@/features/listings/DealerSiteButton';
import { ListingDetails } from '@/features/listings/ListingDetails';
import { PassWatch } from '@/features/listings/PassWatch';
import { deckStage } from '@/lib/layout';
import { listingSourceUrl } from '@/lib/listingSource';
import { formatPrice, formatTitle } from '@/lib/format';
import { useOpenStack } from '@/lib/openStack';
import {
  GUEST_SWIPE_BUDGET,
  HIT_TARGET,
  inset,
  radius,
  size,
  space,
  stack,
  type,
  type Theme,
} from '@/lib/theme';
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
  const { userId, isSignedIn } = useSession();
  const guest = useGuest();
  const { data: card, isPending } = useListing(listingId);
  const { data: saved = [] } = useSaved(userId);
  const save = useRecordSwipe(userId);
  const open = useOpenStack();
  const styles = useThemedStyles(detailStyles);
  const stage = deckStage(Platform.OS, useWindowDimensions().width);
  const photoRef = useRef<View>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  useExposure(card, { surface: 'detail', photo: { listingId: card?.id, index: photoIndex } });

  const isSaved =
    saved.some((entry) => entry.id === listingId) || guest.savedIds.includes(listingId);

  const judge = (direction: 'left' | 'right', after?: () => void) => {
    if (!isSignedIn && guest.exhausted) {
      guest.openSignIn('budget');
      return;
    }
    const used = guest.swipes.length + 1;
    logEvent({ kind: direction === 'right' ? 'save' : 'pass', surface: 'detail', listing: card! });
    save.mutate(
      { listingId: card!.id, direction },
      {
        onSuccess: () => {
          if (!isSignedIn && used >= GUEST_SWIPE_BUDGET) guest.openSignIn('budget');
          after?.();
        },
      }
    );
  };
  // Search is a place to look. Passing there would drop a watch out of a deck
  // the user has not reached yet, and writing to a dealer is a step you take
  // about a watch you have kept, so saving is the only verdict it offers.
  const fromSearch = from === 'search';

  const showPass = !isSaved && !fromSearch && !card?.sold_at;
  const showSave = !isSaved;
  const dealerUrl = listingSourceUrl(card?.source_url);
  const verdictActions =
    showPass || showSave || dealerUrl ? (
      <View style={styles.verdict}>
        {showSave ? (
          <View style={styles.verdictRow}>
            {showPass ? (
              <PassWatch
                block
                loading={save.isPending && save.variables?.direction === 'left'}
                onPress={() => judge('left', () => router.back())}
              />
            ) : null}
            <AddToWishlist
              block
              loading={save.isPending && save.variables?.direction === 'right'}
              onPress={() => judge('right')}
            />
          </View>
        ) : null}
        <DealerSiteButton card={card} surface="detail" grouped />
      </View>
    ) : null;

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
    <Screen width={Platform.OS === 'web' ? stage.width : 'reading'}>
      {/* Outside the scroll, on the close button's line. A name that leaves
          with the photograph is gone by the time you reach the caliber. */}
      <View style={styles.headline}>
        <Text style={styles.model} numberOfLines={2}>{formatTitle(card)}</Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatPrice(card)}</Text>
          <CloseButton onPress={() => router.back()} />
        </View>
      </View>
      {stage.split ? (
        <View style={styles.webRow}>
          <View ref={photoRef} style={styles.webPhoto}>
            <PhotoCarousel
              photos={card.photos}
              active
              showBars
              measureRef={photoRef}
              onIndexChange={setPhotoIndex}
              onExpand={(index) =>
                open(
                  'photos/[listingId]',
                  { listingId: card.id, index: String(index) },
                  `/photos/${card.id}?index=${index}`
                )
              }
            />
          </View>
          <ScrollView style={styles.webDetailScroll} contentContainerStyle={styles.webDetailBody}>
            <ListingDetails card={card} actions={verdictActions} surface="detail" />
          </ScrollView>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
          <View ref={photoRef} style={styles.photo}>
            <PhotoCarousel
              photos={card.photos}
              active
              showBars
              measureRef={photoRef}
              onIndexChange={setPhotoIndex}
              onExpand={(index) =>
                open(
                  'photos/[listingId]',
                  { listingId: card.id, index: String(index) },
                  `/photos/${card.id}?index=${index}`
                )
              }
            />
          </View>

          <ListingDetails card={card} actions={verdictActions} surface="detail" />
        </ScrollView>
      )}
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
  verdict: {
    alignSelf: 'stretch' as const,
    width: '100%' as const,
    gap: space.sm,
  },
  verdictRow: {
    flexDirection: 'row' as const,
    alignSelf: 'stretch' as const,
    alignItems: 'stretch' as const,
    gap: space.sm,
    width: '100%' as const,
  },
  webRow: {
    flex: 1,
    flexDirection: 'row' as const,
    gap: stack.group,
    paddingHorizontal: inset.screen,
    minHeight: 0,
  },
  webPhoto: {
    flex: 1,
    minWidth: 0,
    borderRadius: radius.lg,
    overflow: 'hidden' as const,
  },
  webDetailScroll: {
    flex: 1,
    minWidth: 0,
  },
  webDetailBody: {
    paddingBottom: space.xxl,
    gap: stack.group,
  },
});
