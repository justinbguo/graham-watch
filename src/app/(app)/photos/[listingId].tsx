import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PhotoCarousel } from '@/components/PhotoCarousel';
import { Spinner } from '@/components/ui';
import { useListing } from '@/data/listings';
import { radius, size, space } from '@/lib/theme';

/**
 * The photograph on its own. No price, no dealer, no name — you long-pressed
 * because you wanted to look at the watch, and anything else here is in the way.
 */
export default function PhotoViewer() {
  const { listingId, index } = useLocalSearchParams<{ listingId: string; index?: string }>();
  const { data: card } = useListing(listingId);
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      {card ? (
        <PhotoCarousel
          photos={card.photos}
          active
          variant="viewer"
          initialIndex={Number(index ?? 0) || 0}
        />
      ) : (
        <Spinner />
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        hitSlop={space.sm}
        onPress={() => router.back()}
        style={[styles.close, { top: insets.top + space.sm }]}>
        <MaterialCommunityIcons name="close" size={size.tabIcon} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

// Not themed: this screen is black in light mode too, so its chrome is fixed white.
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  close: {
    position: 'absolute',
    right: space.md,
    padding: space.sm,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
});
