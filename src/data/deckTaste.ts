let epoch = 0;
const listeners = new Set<() => void>();

export function deckTasteEpoch(): string {
  return String(epoch);
}

export function bumpDeckTaste(): void {
  epoch += 1;
  for (const listener of listeners) listener();
}

export function subscribeDeckTaste(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function staleTasteCursor(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  return message.includes('listing cursor does not match this search');
}
