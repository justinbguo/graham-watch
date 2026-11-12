import { Platform } from 'react-native';

import { secureStorage } from '@/lib/secureStorage';

const STORAGE_KEY = 'graham.seen-new-batch';

let snapshot: string | null = readStoredBatchId();
const listeners = new Set<() => void>();

function readStoredBatchId(): string | null {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEY);
}

function publish(batchId: string | null) {
  if (snapshot === batchId) return;
  snapshot = batchId;
  for (const listener of listeners) listener();
}

if (Platform.OS !== 'web') {
  void secureStorage.getItem(STORAGE_KEY).then((value) => {
    if (value) publish(value);
  });
}

export function subscribeSeenNewBatch(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function seenNewBatchId(): string | null {
  return snapshot;
}

export function markNewBatchSeen(batchId: string) {
  if (snapshot === batchId) return;
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, batchId);
  } else {
    void secureStorage.setItem(STORAGE_KEY, batchId);
  }
  publish(batchId);
}
