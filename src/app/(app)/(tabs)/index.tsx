import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, Text, View } from 'react-native';
import { usePathname } from 'expo-router';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { DeckGrid } from '@/components/DeckGrid';
import { FilterButton } from '@/components/FilterButton';
import { SearchDoor } from '@/components/SearchBar';
import { PhotoRollBars } from '@/components/PhotoRollBars';
import { SwipeCard, type SwipeCardHandle } from '@/components/SwipeCard';
import { UndoButton } from '@/components/UndoButton';
import { ViewToggle, type DeckView } from '@/components/ViewToggle';
import { Button, Centered, Heading, Message, Screen, Spinner } from '@/components/ui';
import { useDeck, useListingCounts, usePrimeListing, type ListingCounts } from '@/data/listings';
import { usePassCount, useRecordSwipe, useStartOver, useUndoPass } from '@/data/swipes';
import { useGuest } from '@/features/auth/GuestProvider';
import { useOpenFilters } from '@/features/filters/open';
import { useFilters } from '@/features/filters/provider';
import { activeCount } from '@/features/filters/types';
import { useSaveFlight, type Rect } from '@/features/saved/flight';
import { useIsWide } from '@/lib/layout';
import { useOpenStack } from '@/lib/openStack';
import { setSearchLaunchRect } from '@/lib/searchLaunch';
import type { DeckCard, SwipeDirection } from '@/lib/models';
import { GUEST_SWIPE_BUDGET, inset, layout, motion, space, type, type Theme } from '@/lib/theme';
import { useWebArrowSwipe } from '@/lib/webKeys';
import { useThemedStyles } from '@/providers/theme';
import { useSession } from '@/providers/session';

// Claimed here rather than left to the layout so the tab bar stays mounted: a
// deck that cannot draw should not also strand the user away from the wishlist.
export { TabErrorBoundary as ErrorBoundary } from '@/components/ErrorState';

export default function Deck() {
  const { userId, isSignedIn } = useSession();
  const guest = useGuest();
  const { data: cards = [], isPending, error, refetch } = useDeck();
  const { data: counts } = useListingCounts();
  const swipe = useRecordSwipe(userId);
  const primeListing = usePrimeListing();
  const { data: passes = 0 } = usePassCount(userId);
  const startOver = useStartOver(userId);
  const undoPass = useUndoPass(userId);
  const isWide = useIsWide();
  const styles = useThemedStyles(deckStyles);
  const open = useOpenStack();
  const pathname = usePathname();
  const { filters, clear } = useFilters('deck');
  const openFilters = useOpenFilters();
  const count = activeCount(filters);
  // Sheets sit above the tabs on the app stack; the deck stays mounted under
  // them, so keys must not keep judging watches while a listing or sign-in is up.
  const deckOnTop = pathname === '/' || pathname === '/index';

  const [view, setView] = useState<DeckView>(isWide ? 'grid' : 'cards');
  const [lastPass, setLastPass] = useState<DeckCard | null>(null);
  // The card an undo just put back, so it can come in by the edge it left.
  const [returning, setReturning] = useState<string | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const topListing = cards[0];
  const footerReveal = useSharedValue(0);

  useEffect(() => {
    setPhotoIndex(0);
    footerReveal.value = 0;
  }, [topListing?.id, footerReveal]);

  const footerStyle = useAnimatedStyle(() => ({
    opacity: footerReveal.value,
  }));

  // Where the card is on screen, which is the stage it fills. Measured here
  // rather than in the card: the card is mid-gesture and about to unmount, and
  // this frame is the one thing on the deck that holds still.
  const { launch } = useSaveFlight();
  const stage = useRef<View>(null);
  const stageRect = useRef<Rect | null>(null);
  const topCard = useRef<SwipeCardHandle>(null);

  const measureStage = useCallback(() => {
    stage.current?.measureInWindow((x, y, width, height) => {
      stageRect.current = { x, y, width, height };
    });
  }, []);

  // One step back, and only for a pass. A save is recoverable from the wishlist
  // tab, so a right swipe retires the offer instead of queueing behind it.
  const judge = (card: DeckCard, direction: SwipeDirection, from?: Rect) => {
    if (!isSignedIn && guest.exhausted) {
      guest.openSignIn('budget');
      return;
    }

    // A save flies from wherever it was judged, and only the view that judged
    // it knows where that was: the card stage here, the tile in the grid.
    if (direction === 'right' && from) {
      launch({ from, photo: card.photos[0]?.url });
    }

    const used = guest.swipes.length + 1;
    swipe.mutate(
      { listingId: card.id, direction },
      {
        onSuccess: () => {
          if (!isSignedIn && used >= GUEST_SWIPE_BUDGET) {
            guest.openSignIn('budget');
          }
        },
      }
    );
    setLastPass(direction === 'left' ? card : null);
    setReturning(null);
  };

  const judgeCard = (card: DeckCard, direction: SwipeDirection, releaseX: number) => {
    const from = stageRect.current;
    judge(card, direction, from ? { ...from, x: from.x + releaseX } : undefined);
  };

  // Desktop: left passes, right saves. The top card flings the same way a
  // committed drag would. Ignored while the grid is up — that view owns keys.
  useWebArrowSwipe(
    () => topCard.current?.fling('left'),
    () => topCard.current?.fling('right'),
    deckOnTop && view === 'cards' && cards.length > 0
  );

  const undo = lastPass
    ? () => {
        undoPass.mutate(lastPass);
        setReturning(lastPass.id);
        setLastPass(null);
      }
    : undefined;

  const actions = (
    <View style={styles.actions}>
      {/* Web only. On iOS the unsigned app is the sign-in wall, and this
          slot is already undo, filters, and the view toggle. */}
      {Platform.OS !== 'ios' && !isSignedIn ? (
        <Button label="Log in" variant="ghost" onPress={() => guest.openSignIn('action')} />
      ) : null}
      <UndoButton onPress={undo} />
      <FilterButton count={count} onPress={() => openFilters('deck')} />
      <ViewToggle value={view} onChange={setView} />
    </View>
  );

  if (isPending) {
    return (
      <Screen titleControl={<DeckHeader actions={actions} />} inTabs>
        <Spinner />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen titleControl={<DeckHeader actions={actions} />} inTabs>
        <Centered>
          <Message text={error.message} tone="error" />
          <Button label="Try again" variant="outline" onPress={() => refetch()} />
        </Centered>
      </Screen>
    );
  }

  if (cards.length === 0) {
    return (
      <Screen titleControl={<DeckHeader actions={actions} />} inTabs>
        <Centered>
          <Heading>
            {count ? 'Nothing matches' : passes ? "That's everything" : 'Nothing left to swipe'}
          </Heading>
          <Message
            text={
              count
                ? 'Your filters are narrower than the deck.'
                : passes
                  ? `Start over to see the ${passes} you passed on again. Watches on your wishlist stay there.`
                  : 'Check back once more dealers are approved.'
            }
          />
          {count ? (
            <Button label="Clear filters" variant="outline" onPress={clear} />
          ) : passes ? (
            <Button
              label="Start over"
              variant="outline"
              loading={startOver.isPending}
              onPress={() => startOver.mutate()}
            />
          ) : (
            <Button label="Refresh" variant="outline" onPress={() => refetch()} />
          )}
        </Centered>
      </Screen>
    );
  }

  const remaining = tally(counts, count > 0);

  if (view === 'grid') {
    return (
      <Screen titleControl={<DeckHeader actions={actions} />} width="grid" inTabs>
        <Animated.View key="grid" entering={FadeIn.duration(motion.base)} style={styles.view}>
          <DeckGrid
            cards={cards}
            active={deckOnTop}
            onOpen={(card) => {
              primeListing(card);
              open('listing/[listingId]', { listingId: card.id }, `/listing/${card.id}`);
            }}
          />
          {remaining ? <Text style={styles.deckFooter}>{remaining}</Text> : null}
        </Animated.View>
      </Screen>
    );
  }

  // Render a few cards deep so the next one shows under the top card.
  const visible = cards.slice(0, 3).reverse();

  return (
    <Screen
      titleControl={<DeckHeader actions={actions} />}
      subhead={
        topListing.photos.length > 1 ? (
          <View style={styles.roll}>
            <PhotoRollBars photos={topListing.photos} index={photoIndex} placement="deck" />
          </View>
        ) : undefined
      }
      width="card"
      inTabs>
      {/* The two views trade places rather than cutting. Entering only: the
          old view is gone the frame the state changes, so there is nothing to
          fade out, and the new one arrives over the page rather than over a
          corpse of the last one. */}
      <Animated.View key="cards" entering={FadeIn.duration(motion.base)} style={styles.view}>
        <View style={styles.deck}>
          <View ref={stage} onLayout={measureStage} style={styles.stage}>
          {visible.map((card, index) => {
            const onTop = index === visible.length - 1;
            return (
              <SwipeCard
                key={card.id}
                ref={onTop ? topCard : undefined}
                card={card}
                isTop={onTop}
                photoIndex={onTop ? photoIndex : undefined}
                onPhotoIndexChange={onTop ? setPhotoIndex : undefined}
                returning={card.id === returning}
                nextPhoto={onTop ? cards[1]?.photos[0]?.url : undefined}
                onSwipe={(direction, releaseX) => judgeCard(card, direction, releaseX)}
                onExpandPhoto={(photoIndex) => {
                  primeListing(card);
                  open(
                    'photos/[listingId]',
                    { listingId: card.id, index: String(photoIndex) },
                    `/photos/${card.id}?index=${photoIndex}`
                  );
                }}
                footerReveal={onTop ? footerReveal : undefined}
              />
            );
          })}
          </View>
          {remaining ? (
            <Animated.Text pointerEvents="none" style={[styles.deckFooter, styles.deckFooterFloat, footerStyle]}>
              {remaining}
            </Animated.Text>
          ) : null}
        </View>
      </Animated.View>
    </Screen>
  );
}

/**
 * The line under the title: how much of the marketplace you are looking at.
 *
 * Filtered, it is both numbers — "12 of 148 watches available" — because a
 * small number on its own reads as an empty marketplace rather than a narrow
 * filter. Unfiltered, before a swipe, the two counts are the same, so the
 * line is the catalogue alone. A swipe drops the first number in the same
 * moment the card leaves, and the line becomes "147 of 148". The brass count
 * on the Filters button beside it says how many choices made a filtered
 * first number small. The line sits under the card stack and fades in near
 * the bottom of the scroll; it is hidden until then.
 *
 * Nothing until the count lands. The old line counted the deck in hand, which
 * capped at `DECK_LIMIT` and said "20+" — a number that was never the answer
 * to either question.
 */
/** Search and deck controls on one row so the split stays 60 / 40. */
function DeckHeader({ actions }: { actions: ReactNode }) {
  const open = useOpenStack();
  const styles = useThemedStyles(deckStyles);
  const door = useRef<View>(null);
  const searchWidth = `${layout.deckHeaderSearchShare * 100}%` as const;
  return (
    <View style={styles.headerBar}>
      <View
        ref={door}
        collapsable={false}
        style={[styles.searchSlot, { width: searchWidth }]}>
        <SearchDoor
          accessibilityLabel="Search brand, model or reference"
          onPress={() => {
            door.current?.measureInWindow((x, y, width, height) => {
              setSearchLaunchRect({ x, y, width, height });
              open('search', { compose: '1' }, '/search?compose=1');
            });
          }}
        />
      </View>
      <View style={styles.actionsSlot}>{actions}</View>
    </View>
  );
}

function tally(counts: ListingCounts | undefined, filtered: boolean) {
  if (!counts) return undefined;

  const noun = counts.total === 1 ? 'watch' : 'watches';
  if (!filtered && counts.matched === counts.total) {
    return `${counts.total} ${noun} available`;
  }
  return `${counts.matched} of ${counts.total} ${noun} available`;
}

const deckStyles = (_theme: Theme) => ({
  headerBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    width: '100%' as const,
    gap: space.md,
    marginBottom: space.sm,
  },
  searchSlot: {
    flexShrink: 0,
    minWidth: 0,
  },
  actionsSlot: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'flex-end' as const,
    gap: space.xs,
    minWidth: 0,
  },
  actions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
  },
  view: {
    flex: 1,
  },
  roll: {
    paddingHorizontal: inset.screen,
    alignItems: 'center' as const,
    // `Screen` headed padding is for the title block; tuck the roll toward the stack.
    marginBottom: -space.md,
  },
  deck: {
    flex: 1,
    paddingBottom: layout.deckTallyBand,
  },
  stage: {
    flex: 1,
    marginHorizontal: inset.screen,
  },
  deckFooter: {
    ...type.caption,
    color: _theme.color.textMuted,
    textAlign: 'center' as const,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    marginHorizontal: inset.screen,
  },
  deckFooterFloat: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
