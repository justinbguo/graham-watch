import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { usePathname } from 'expo-router';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { DeckGrid } from '@/components/DeckGrid';
import { DeckDisplayButton } from '@/components/DeckDisplayButton';
import { DeckRailButton } from '@/components/DeckRailButton';
import { DeckDesktopFrame } from '@/components/DeckDesktopFrame';
import { DeckRailTools, DeckToolRail } from '@/components/DeckToolRail';
import { DeckCoach } from '@/features/deck/DeckCoach';
import { deckCardZ } from '@/features/deck/stack';
import { useDeckStack } from '@/features/deck/useDeckStack';
import { useDeckColumns } from '@/features/deck/useGridColumns';
import { useDeckTutorial } from '@/features/deck/useDeckTutorial';
import { usePrefetchDeckPhotos } from '@/features/deck/usePrefetchDeckPhotos';
import { DeckDealerHeader } from '@/features/deck/DeckDealerHeader';
import { DealerDirectory } from '@/features/dealers/DealerDirectory';
import { GiveFeedback } from '@/features/feedback/GiveFeedback';
import { FilterMenu } from '@/features/filters/FilterMenu';
import { SearchDoor } from '@/components/SearchBar';
import { PhotoRollBars } from '@/components/PhotoRollBars';
import { deckPhotoHeight, SwipeCard, type SwipeCardHandle } from '@/components/SwipeCard';
import { UndoButton } from '@/components/UndoButton';
import { ViewToggle, type DeckView } from '@/components/ViewToggle';
import { Button, Centered, Heading, Message, Screen, Spinner } from '@/components/ui';
import { showDeckEmpty, useDeck, useListingCounts, usePrimeListing, type ListingCounts } from '@/data/listings';
import { usePassCount, useRecordSwipe, useStartOver, useUndoPass } from '@/data/swipes';
import { useGuest } from '@/features/auth/GuestProvider';
import { useSignInOnArrival } from '@/features/auth/useSignInOnArrival';
import { useFilters } from '@/features/filters/provider';
import { filterCacheToken } from '@/features/filters/spec';
import { activeCount, soleDealer } from '@/features/filters/types';
import { useSaveFlight, type Rect } from '@/features/saved/flight';
import { isGridColumnOption } from '@/lib/gridColumns';
import { deckStage, useIsDesktopWeb, useIsWide } from '@/lib/layout';
import { useOpenStack } from '@/lib/openStack';
import { setSearchLaunchRect } from '@/lib/searchLaunch';
import type { DeckCard, SwipeDirection } from '@/lib/models';
import { useWebArrowSwipe } from '@/lib/webKeys';
import { GUEST_SWIPE_BUDGET, inset, layout, motion, size, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';
import { useSession } from '@/providers/session';

// Claimed here rather than left to the layout so the tab bar stays mounted: a
// deck that cannot draw should not also strand the user away from the wishlist.
export { TabErrorBoundary as ErrorBoundary } from '@/components/ErrorState';

export default function Deck() {
  const { userId, isSignedIn } = useSession();
  const guest = useGuest();
  const {
    data: cards = [],
    isPending,
    error,
    refetch,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
    latestPageAdded,
  } = useDeck();
  // Cards still playing their exit stay mounted in the slot they already
  // occupy. The set is updated before the pile drops them, so the render that
  // follows a swipe does not move the native views underneath.
  const retainedRef = useRef(new Set<string>());
  const [, setRetainEpoch] = useState(0);
  const retainCard = useCallback((id: string) => {
    if (retainedRef.current.has(id)) return;
    retainedRef.current.add(id);
    setRetainEpoch((n) => n + 1);
  }, []);
  const releaseCard = useCallback((id: string) => {
    if (!retainedRef.current.delete(id)) return;
    setRetainEpoch((n) => n + 1);
  }, []);
  const { slots } = useDeckStack(cards, retainedRef.current);
  usePrefetchDeckPhotos(cards);
  const { data: counts } = useListingCounts();
  const swipe = useRecordSwipe(userId);
  const primeListing = usePrimeListing();
  const { data: passes = 0 } = usePassCount(userId);
  const startOver = useStartOver(userId);
  const undoPass = useUndoPass(userId);
  const isWide = useIsWide();
  const isDesktopWeb = useIsDesktopWeb();
  const { width: windowWidth } = useWindowDimensions();
  const styles = useThemedStyles(deckStyles);
  const open = useOpenStack();
  const pathname = usePathname();
  const { filters, clear, showOnlyDealer, showAllDealers } = useFilters('deck');
  const shownDealer = soleDealer(filters);
  const count = activeCount(filters);
  // Sheets sit above the tabs on the app stack; the deck stays mounted under
  // them, so keys must not keep judging watches while a listing or sign-in is up.
  const deckOnTop = pathname === '/' || pathname === '/index';
  useSignInOnArrival(deckOnTop);

  const [view, setView] = useState<DeckView>(isWide ? 'grid' : 'cards');
  const { columns, columnChoice, choose: chooseColumns } = useDeckColumns();
  const [lastPass, setLastPass] = useState<DeckCard | null>(null);
  // The card an undo just put back, so it can come in by the edge it left.
  const [returning, setReturning] = useState<string | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const topListing = cards[0];
  const footerReveal = useSharedValue(0);

  useEffect(() => {
    setPhotoIndex(0);
  }, [topListing?.id]);

  const footerStyle = useAnimatedStyle(() => ({
    opacity: footerReveal.value,
  }));

  // Where the card is on screen, which is the stage it fills. Measured here
  // rather than in the card: the card is mid-gesture and about to unmount, and
  // this frame is the one thing on the deck that holds still.
  const { launch } = useSaveFlight();
  const stage = useRef<View>(null);
  const stageRect = useRef<Rect | null>(null);
  const [stageFrame, setStageFrame] = useState({ width: 0, height: 0 });
  const plateHeight = deckPhotoHeight(stageFrame);
  // One ref moved between cards was null for the whole exit: React detached
  // the leaving card's handle and the next card's handle did not stick until
  // the leaving card unmounted. Each card keeps its own handle instead.
  const cardHandles = useRef(new Map<string, SwipeCardHandle>());
  const bindCard = useRef(new Map<string, (handle: SwipeCardHandle | null) => void>());
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const handleFor = (id: string) => {
    let bind = bindCard.current.get(id);
    if (!bind) {
      bind = (handle: SwipeCardHandle | null) => {
        if (handle) cardHandles.current.set(id, handle);
        else cardHandles.current.delete(id);
      };
      bindCard.current.set(id, bind);
    }
    return bind;
  };

  const measureStage = useCallback(() => {
    stage.current?.measureInWindow((x, y, width, height) => {
      stageRect.current = { x, y, width, height };
    });
  }, []);

  const onStageLayout = useCallback(() => {
    measureStage();
    stage.current?.measure((x, y, width, height) => {
      setStageFrame((current) =>
        current.width === width && current.height === height ? current : { width, height },
      );
    });
  }, [measureStage]);

  // One step back, and only for a pass. A save is recoverable from the wishlist
  // tab, so a right swipe retires the offer instead of queueing behind it.
  const guestRef = useRef(guest);
  guestRef.current = guest;
  const judge = useCallback(
    (card: DeckCard, direction: SwipeDirection, from?: Rect) => {
      const current = guestRef.current;
      if (!isSignedIn && current.exhausted) {
        current.openSignIn('budget');
        return false;
      }

      // A save flies from wherever it was judged, and only the view that judged
      // it knows where that was: the card stage here, the tile in the grid.
      if (direction === 'right' && from) {
        launch({ from, photo: card.photos[0]?.url });
      }

      // Hold the slot before the pile drops the card, so the exit keeps the
      // same native view and the cards behind it do not shift.
      if (direction === 'left') retainCard(card.id);

      const used = current.swipes.length + 1;
      swipe.mutate(
        { listingId: card.id, direction },
        {
          onSuccess: () => {
            if (!isSignedIn && used >= GUEST_SWIPE_BUDGET) {
              current.openSignIn('budget');
            }
          },
        },
      );
      setLastPass(direction === 'left' ? card : null);
      setReturning(null);
      return true;
    },
    [isSignedIn, launch, retainCard, swipe],
  );

  const multiPhoto = (topListing?.photos.length ?? 0) > 1;
  const { active: tutorialStep, finishListings } = useDeckTutorial({
    multiPhoto,
    photoIndex,
  });

  const openPhoto = useCallback(
    (card: DeckCard, index: number) => {
      primeListing(card);
      open('photos/[listingId]', { listingId: card.id, index: String(index) }, `/photos/${card.id}?index=${index}`);
    },
    [open, primeListing],
  );

  const judgeCard = useCallback(
    (card: DeckCard, direction: SwipeDirection, releaseX: number) => {
      if (tutorialStep === 'listings') finishListings();
      const from = stageRect.current;
      return judge(card, direction, from ? { ...from, x: from.x + releaseX } : undefined);
    },
    [finishListings, judge, tutorialStep],
  );

  const stepPhoto = useCallback(
    (by: number) => {
      const count = topListing?.photos.length ?? 0;
      if (count <= 1) return;
      setPhotoIndex((current) => {
        const next = current + by;
        if (next < 0) return count - 1;
        if (next >= count) return 0;
        return next;
      });
    },
    [topListing?.photos.length],
  );

  const toggleView = useCallback(() => {
    setView((current) => (current === 'cards' ? 'grid' : 'cards'));
  }, []);

  const chooseDensity = useCallback(
    (next: number) => {
      if (!isGridColumnOption(next)) {
        setView('cards');
        return;
      }
      chooseColumns(next);
      setView('grid');
    },
    [chooseColumns],
  );

  const loadMore = useCallback(() => {
    void fetchNextPage();
  }, [fetchNextPage]);

  const deckKeysOn = deckOnTop && Platform.OS === 'web' && cards.length > 0;
  const cardSwipeKeysOn = deckKeysOn && view === 'cards';

  useWebArrowSwipe(
    cardSwipeKeysOn
      ? () => {
          const id = cardsRef.current[0]?.id;
          if (id) cardHandles.current.get(id)?.fling('left');
        }
      : undefined,
    cardSwipeKeysOn
      ? () => {
          const id = cardsRef.current[0]?.id;
          if (id) cardHandles.current.get(id)?.fling('right');
        }
      : undefined,
    deckKeysOn,
    cardSwipeKeysOn && multiPhoto ? () => stepPhoto(-1) : undefined,
    cardSwipeKeysOn && multiPhoto ? () => stepPhoto(1) : undefined,
    deckKeysOn ? toggleView : undefined,
  );

  const undo = lastPass
    ? () => {
        releaseCard(lastPass.id);
        undoPass.mutate(lastPass);
        setReturning(lastPass.id);
        setLastPass(null);
      }
    : undefined;

  const deckToolsMobile = (
    <>
      {Platform.OS === 'android' && !isSignedIn ? (
        <Button label="Log in" variant="ghost" onPress={() => guest.openSignIn('action')} />
      ) : null}
      <UndoButton onPress={undo} />
      <FilterMenu surface="deck" count={count} />
      <ViewToggle value={view} onChange={setView} />
      <GiveFeedback placement="header" />
    </>
  );

  const deckToolsDesktop = (
    <>
      <DeckRailButton
        label="Rewind"
        icon="undo-variant"
        onPress={undo}
        disabled={!undo}
        accessibilityLabel="Undo, bring back the watch you passed on"
      />
      <DeckDisplayButton value={view === 'cards' ? 1 : columnChoice} onChange={chooseDensity} />
      <FilterMenu surface="deck" count={count} triggerVariant="text" />
      <GiveFeedback placement="rail" />
    </>
  );

  const deckTools = isDesktopWeb ? deckToolsDesktop : deckToolsMobile;

  const desktopRail = isDesktopWeb ? (
    <DeckToolRail width="dealers">
      <DeckRailTools>{deckTools}</DeckRailTools>
      <DealerDirectory selectedId={shownDealer} onSelect={showOnlyDealer} />
    </DeckToolRail>
  ) : null;
  const frameDesktop = (content: ReactNode) => {
    const column =
      shownDealer === null ? (
        content
      ) : (
        <View style={styles.watchArea}>
          <DeckDealerHeader dealerId={shownDealer} onShowAll={showAllDealers} />
          {content}
        </View>
      );
    return desktopRail ? <DeckDesktopFrame rail={desktopRail}>{column}</DeckDesktopFrame> : column;
  };
  const titleControl = isDesktopWeb ? undefined : (
    <DeckHeader>
      <View style={styles.actions}>{deckToolsMobile}</View>
    </DeckHeader>
  );

  // An empty pile is the end of the deck only when nothing matches. While
  // `matched` is still above zero the next page is on its way, and the empty
  // copy here would tell the buyer the catalogue was finished.
  const showEmpty = showDeckEmpty(cards.length, counts?.matched);

  if (isPending || (cards.length === 0 && !error && !showEmpty)) {
    return (
      <Screen titleControl={titleControl} inTabs>
        {frameDesktop(<Spinner />)}
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen titleControl={titleControl} inTabs>
        {frameDesktop(
        <Centered>
          <Message text={error.message} tone="error" />
          <Button label="Try again" variant="outline" onPress={() => refetch()} />
        </Centered>
        )}
      </Screen>
    );
  }

  if (showEmpty) {
    return (
      <Screen titleControl={titleControl} inTabs>
        {frameDesktop(
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
        )}
      </Screen>
    );
  }

  const remaining = tally(counts, count > 0);

  if (view === 'grid') {
    return (
      <Screen
        titleControl={titleControl}
        width="grid"
        desktopBleed={isDesktopWeb}
        inTabs>
        {frameDesktop(
          <Animated.View
            key="grid"
            entering={FadeIn.duration(motion.base)}
            style={[styles.view, styles.gridView]}>
            {/* Same pile as the cards. The list asks when its tail is on
                screen; the cards ask when the pile is thin. A new filter is
                a new query, and this key sends the list back to the top. */}
            <DeckGrid
              key={filterCacheToken(filters)}
              columns={columns}
              cards={cards}
              active={deckOnTop}
              paging={{
                hasNextPage,
                isFetching,
                isFetchingNextPage,
                isFetchNextPageError,
                latestPageAdded,
                onLoadMore: loadMore,
                endLabel: remaining,
              }}
              onOpen={(card) => {
                primeListing(card);
                open('listing/[listingId]', { listingId: card.id }, `/listing/${card.id}`);
              }}
            />
          </Animated.View>
        )}
      </Screen>
    );
  }

  const topId = cards[0]?.id;

  const roll = (
    <View style={[styles.roll, isDesktopWeb && styles.rollDesktop]}>
      {topListing.photos.length > 1 ? (
        <PhotoRollBars photos={topListing.photos} index={photoIndex} placement="deck" />
      ) : (
        <View style={styles.rollStandIn} />
      )}
    </View>
  );

  return (
    <Screen
      titleControl={titleControl}
      desktopBleed
      subhead={isDesktopWeb ? undefined : roll}
      width={isDesktopWeb ? 'grid' : deckStage(Platform.OS, windowWidth).width}
      inTabs>
      {frameDesktop(
        <View style={[styles.desktopDeck, isDesktopWeb && styles.desktopDeckCapped]}>
          {isDesktopWeb ? roll : null}
          {/* The two views trade places rather than cutting. Entering only: the
              old view is gone the frame the state changes, so there is nothing to
              fade out, and the new one arrives over the page rather than over a
              corpse of the last one. */}
          <Animated.View key="cards" entering={FadeIn.duration(motion.base)} style={styles.view}>
            <View style={[styles.deck, isDesktopWeb && styles.deckDesktop]}>
              <View
                ref={stage}
                onLayout={onStageLayout}
                style={[styles.stage, isDesktopWeb && styles.stageDesktop]}>
          {slots.map((card, index) => {
            if (!card) {
              return (
                <View
                  key={`deck-hole-${index}`}
                  collapsable={false}
                  style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}
                />
              );
            }
            const onTop = card.id === topId;
            const neighbor = cards[cards.findIndex((item) => item.id === card.id) + 1];
            return (
              <SwipeCard
                key={card.id}
                ref={handleFor(card.id)}
                card={card}
                zIndex={deckCardZ(
                  card.id,
                  cards.slice(0, 3).map((item) => item.id),
                  retainedRef.current,
                )}
                isTop={onTop}
                photoIndex={onTop ? photoIndex : undefined}
                onPhotoIndexChange={onTop ? setPhotoIndex : undefined}
                returning={card.id === returning}
                nextPhoto={onTop ? neighbor?.photos[0]?.url : undefined}
                onSwipe={judgeCard}
                onExitDone={releaseCard}
                onExpandPhoto={openPhoto}
                footerReveal={footerReveal}
                plateHeight={plateHeight}
              />
            );
          })}
          </View>
          {remaining ? (
            <Animated.Text pointerEvents="none" style={[styles.deckFooter, styles.deckFooterFloat, footerStyle]}>
              {remaining}
            </Animated.Text>
          ) : null}
              {deckOnTop && tutorialStep ? <DeckCoach step={tutorialStep} /> : null}
            </View>
          </Animated.View>
        </View>
      )}
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
function DeckHeader({ children }: { children: ReactNode }) {
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
      <View style={styles.actionsSlot}>{children}</View>
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
  watchArea: {
    flex: 1,
    minHeight: 0,
    gap: space.md,
  },
  view: {
    flex: 1,
  },
  // The list, not the page, has to be the scroller once more pages append.
  gridView: {
    minHeight: 0,
  },
  desktopDeck: {
    flex: 1,
    minHeight: 0,
  },
  // The page stays as wide as the grid's so the rail does not move between
  // views; only the card stage is held to its hand-sized width.
  desktopDeckCapped: {
    width: '100%' as const,
    maxWidth: layout.cardWeb,
    alignSelf: 'center' as const,
  },
  roll: {
    paddingHorizontal: inset.screen,
    alignItems: 'center' as const,
    // `Screen` headed padding is for the title block; tuck the roll toward the stack.
    marginBottom: -space.md,
  },
  rollStandIn: {
    height: size.segmentDeck,
    width: `${layout.photoRollTrackShare * 100}%` as const,
  },
  rollDesktop: {
    width: '100%' as const,
    paddingHorizontal: 0,
    alignItems: 'center' as const,
    marginBottom: space.sm,
    gap: space.xs,
  },
  deck: {
    flex: 1,
    position: 'relative' as const,
    paddingBottom: layout.deckTallyBand,
  },
  // Same band as mobile: the tally line is absolute at the bottom, and a
  // smaller pad lets the card's lower edge sit on the text.
  deckDesktop: {
    paddingBottom: layout.deckTallyBand,
  },
  stage: {
    flex: 1,
    marginHorizontal: inset.screen,
  },
  stageDesktop: {
    marginLeft: 0,
    marginRight: 0,
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
