import { router, useLocalSearchParams } from 'expo-router';

import { Button, Centered, CloseButton, Message, Screen, Spinner } from '@/components/ui';
import { useListing } from '@/data/listings';
import { ListingEditor } from '@/features/dealers/ListingEditor';

export default function EditListingScreen() {
  const { listingId } = useLocalSearchParams<{ listingId: string }>();
  const { data: card, isPending } = useListing(listingId);

  if (isPending) {
    return (
      <Screen title="Edit watch" inSheet>
        <Spinner />
      </Screen>
    );
  }

  if (!card) {
    return (
      <Screen title="Edit watch" inSheet>
        <Centered>
          <Message text="That watch is no longer in your inventory." tone="error" />
          <Button label="Close" variant="outline" onPress={() => router.back()} />
        </Centered>
      </Screen>
    );
  }

  return (
    <Screen title="Edit watch" action={<CloseButton onPress={() => router.back()} />} inSheet>
      <ListingEditor card={card} onSaved={() => router.back()} />
    </Screen>
  );
}
