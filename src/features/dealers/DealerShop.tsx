import { router } from 'expo-router';
import { FlatList, View } from 'react-native';

import { ListingRow } from '@/components/ListingRow';
import { Centered, CloseButton, Message, Screen, Spinner } from '@/components/ui';
import { useDealerShop } from '@/data/dealers';
import { usePrimeListing } from '@/data/listings';
import { useOpenStack } from '@/lib/openStack';
import { inset, space } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { DealerPanel } from './DealerPanel';
import { FollowDealer } from './FollowDealer';

export function DealerShop({ dealerId }: { dealerId: string }) {
  const styles = useThemedStyles(shopStyles);
  const open = useOpenStack();
  const primeListing = usePrimeListing();
  const { data, isPending, error } = useDealerShop(dealerId);
  const close = () => router.back();

  if (isPending) {
    return (
      <Screen action={<CloseButton onPress={close} />}>
        <Spinner />
      </Screen>
    );
  }

  if (error || !data?.dealer) {
    return (
      <Screen action={<CloseButton onPress={close} />}>
        <Centered>
          <Message text="That shop is no longer listed." tone="error" />
        </Centered>
      </Screen>
    );
  }

  const { dealer, listings } = data;

  return (
    <Screen
      title={dealer.name}
      titleSize="title"
      titleExtra={<FollowDealer dealer={dealer} />}
      action={<CloseButton onPress={close} />}>
      <FlatList
        data={listings}
        keyExtractor={(card) => card.id}
        style={styles.list}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <DealerPanel dealer={dealer} named={false} />
          </View>
        }
        ListEmptyComponent={<Message text="Nothing for sale right now." />}
        renderItem={({ item }) => (
          <ListingRow
            card={item}
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

const shopStyles = () => ({
  list: {
    flex: 1,
  },
  content: {
    paddingHorizontal: inset.screen,
    paddingBottom: space.xxxl,
    gap: space.lg,
  },
  header: {
    paddingBottom: space.lg,
  },
});
