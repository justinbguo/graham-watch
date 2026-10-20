import { useCallback, useEffect, useState } from 'react';

import { loadDeckTutorialPhase, saveDeckTutorialPhase, type DeckTutorialPhase } from './tutorialProgress';

type ActivePhase = 'photos' | 'listings';

/**
 * Two-step coach on the buy deck: photos first, then pass or save. Persists so
 * it does not return once the user has done each thing once.
 */
export function useDeckTutorial({ multiPhoto, photoIndex }: { multiPhoto: boolean; photoIndex: number }) {
  const [phase, setPhase] = useState<DeckTutorialPhase | 'loading'>('loading');

  useEffect(() => {
    let live = true;
    void loadDeckTutorialPhase().then((stored) => {
      if (!live) return;
      if (stored === 'done') {
        setPhase('done');
        return;
      }
      if (stored === 'listings') {
        setPhase('listings');
        return;
      }
      if (stored === 'photos') {
        setPhase('photos');
        return;
      }
      setPhase(multiPhoto ? 'photos' : 'listings');
    });
    return () => {
      live = false;
    };
  }, [multiPhoto]);

  const finishPhotos = useCallback(() => {
    setPhase('listings');
    void saveDeckTutorialPhase('listings');
  }, []);

  const finishListings = useCallback(() => {
    setPhase('done');
    void saveDeckTutorialPhase('done');
  }, []);

  useEffect(() => {
    if (phase !== 'photos') return;
    if (!multiPhoto) {
      finishPhotos();
      return;
    }
    if (photoIndex === 0) return;
    finishPhotos();
  }, [phase, photoIndex, multiPhoto, finishPhotos]);

  const active: ActivePhase | null =
    phase === 'photos' || phase === 'listings' ? phase : null;

  return { active, finishListings };
}
