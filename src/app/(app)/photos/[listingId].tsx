import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PhotoCarousel } from '@/components/PhotoCarousel';
import { PhotoZoomEnter } from '@/components/PhotoZoomEnter';
import { Spinner } from '@/components/ui';
import { useExposure } from '@/data/listingEvents';
import { useListing } from '@/data/listings';
import { takePhotoLaunchRect } from '@/lib/photoLaunch';
import { HIT_TARGET, radius, size, space } from '@/lib/theme';

/**
 * The photograph on its own. No price, no dealer, no name — you long-pressed
 * because you wanted to look at the watch, and anything else here is in the way.
 */
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ErrorState';

export default function PhotoViewer() {
  const { listingId, index } = useLocalSearchParams<{ listingId: string; index?: string }>();
  const { data: card } = useListing(listingId);
  const insets = useSafeAreaInsets();
  const launch = useMemo(() => takePhotoLaunchRect(), []);
  const at = Number(index ?? 0) || 0;
  const [entered, setEntered] = useState(!launch);
  const photo = card?.photos[Math.min(at, (card?.photos.length ?? 1) - 1)];
  const [photoIndex, setPhotoIndex] = useState(at);
  useExposure(card, { surface: 'viewer', photo: { listingId: card?.id, index: photoIndex } });

  return (
    <View style={styles.screen}>
      {card && entered ? (
        <PhotoCarousel
          photos={card.photos}
          active
          variant="viewer"
          initialIndex={at}
          onIndexChange={setPhotoIndex}
        />
      ) : card ? (
        <View style={styles.hold} />
      ) : (
        <Spinner />
      )}

      {launch && photo?.url && !entered ? (
        <PhotoZoomEnter from={launch} uri={photo.url} onDone={() => setEntered(true)} />
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        hitSlop={space.sm}
        onPress={() => router.back()}
        style={[styles.close, { top: insets.top + space.sm }]}>
        <MaterialCommunityIcons name="close" size={size.icon} color="#FFFFFF" />
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
  hold: {
    flex: 1,
    backgroundColor: '#000000',
  },
  close: {
    position: 'absolute',
    right: space.md,
    minWidth: HIT_TARGET,
    minHeight: HIT_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
});
