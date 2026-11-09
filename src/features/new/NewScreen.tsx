import { ActivityIndicator, FlatList } from 'react-native';

import { ListingRow } from '@/components/ListingRow';
import { Centered, Divider, Message, Screen, Spinner } from '@/components/ui';
import { usePrimeListing } from '@/data/listings';
import { useNewListings } from '@/data/newListings';
import { formatShortDate } from '@/lib/format';
import { useOpenStack } from '@/lib/openStack';
import { inset, space, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

const LAST_NIGHT_MS = 36 * 60 * 60 * 1000;

/** A batch older than a night says its date, so a failed refresh does not read as last night. */
function updateName(sealedAt: string): string {
  return Date.now() - new Date(sealedAt).getTime() < LAST_NIGHT_MS
    ? "last night's update"
    : `the update on ${formatShortDate(sealedAt)}`;
}

function subtitle(total: number, sealedAt: string): string {
  if (total === 0) return `Nothing new from ${updateName(sealedAt)}.`;
  return `${total} ${total === 1 ? 'watch' : 'watches'} from ${updateName(sealedAt)}.`;
}

/** The watches the latest full catalogue refresh put on the deck. */
export function NewScreen() {
  const view = useNewListings();
  const theme = useTheme();
  const styles = useThemedStyles(newStyles);
  const open = useOpenStack();
  const primeListing = usePrimeListing();

  switch (view.state) {
    case 'loading':
      return (
        <Screen title="New" inTabs width="wishlist">
          <Spinner />
        </Screen>
      );
    case 'error':
      return (
        <Screen title="New" inTabs width="wishlist">
          <Centered>
            <Message text="New watches could not be loaded." tone="error" />
          </Centered>
        </Screen>
      );
    case 'none':
      return (
        <Screen title="New" inTabs width="wishlist">
          <Centered>
            <Message text="New watches appear here after the nightly update." />
          </Centered>
        </Screen>
      );
    case 'ready':
      return (
        <Screen title="New" subtitle={subtitle(view.total, view.sealedAt)} inTabs width="wishlist">
          <FlatList
            data={view.cards}
            keyExtractor={(card) => card.id}
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={Divider}
            onEndReached={view.loadMore}
            ListFooterComponent={
              view.loadingMore ? (
                <ActivityIndicator color={theme.color.textMuted} style={styles.more} />
              ) : null
            }
            renderItem={({ item }) => (
              <ListingRow
                card={item}
                compact
                onPress={() => {
                  primeListing(item);
                  open('listing/[listingId]', { listingId: item.id }, `/listing/${item.id}`);
                }}
              />
            )}
          />
        </Screen>
      );
  }
}

const newStyles = (_theme: Theme) => ({
  list: {
    paddingHorizontal: inset.screen,
    paddingBottom: space.xxxl,
    flexGrow: 1,
  },
  more: {
    paddingVertical: space.lg,
  },
});
