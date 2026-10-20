import { secureStorage } from '@/lib/secureStorage';

const STORAGE_KEY = 'graham.deck.tutorial';

export type DeckTutorialPhase = 'photos' | 'listings' | 'done';

export async function loadDeckTutorialPhase(): Promise<DeckTutorialPhase | null> {
  const raw = await secureStorage.getItem(STORAGE_KEY);
  if (raw === 'photos' || raw === 'listings' || raw === 'done') return raw;
  return null;
}

export async function saveDeckTutorialPhase(phase: DeckTutorialPhase): Promise<void> {
  if (phase === 'done') {
    await secureStorage.setItem(STORAGE_KEY, 'done');
    return;
  }
  await secureStorage.setItem(STORAGE_KEY, phase);
}
