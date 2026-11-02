import { useEffect, useMemo } from 'react';
import { Image } from 'expo-image';

import { DECK_STACK } from './stack';

/** The mounted stack, plus the card that will fill the next hole. */
const PREFETCH_CARDS = DECK_STACK + 1;
/** Cover, and the photo a tap on the right would show. */
const PREFETCH_PHOTOS = 2;

/**
 * Ask expo-image to fetch the next few photographs before those cards are
 * what's under the thumb. The carousel already prefetches the next frame of
 * the photo you are on. It does not fetch the next watch. A card that mounts
 * into the back slot then decodes from the network, and the crossfade reads
 * as the card arriving late.
 */
export function usePrefetchDeckPhotos(cards: readonly { photos: readonly { url: string }[] }[]) {
  const key = useMemo(() => {
    const urls: string[] = [];
    for (const card of cards.slice(0, PREFETCH_CARDS)) {
      for (const photo of card.photos.slice(0, PREFETCH_PHOTOS)) {
        if (photo.url) urls.push(photo.url);
      }
    }
    return urls.join('\n');
  }, [cards]);

  useEffect(() => {
    const urls = key.split('\n').filter(Boolean);
    if (urls.length === 0) return;
    void Image.prefetch(urls);
  }, [key]);
}
