import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// SecureStore rejects values over 2048 bytes on Android, and a Supabase session
// with a large JWT clears that easily. Split into chunks and keep a count key.
const CHUNK_SIZE = 1536;

const countKey = (key: string) => `${key}.chunks`;
const chunkKey = (key: string, index: number) => `${key}.${index}`;

const webStorage = {
  getItem: (key: string) => (typeof localStorage === 'undefined' ? null : localStorage.getItem(key)),
  setItem: (key: string, value: string) => localStorage?.setItem(key, value),
  removeItem: (key: string) => localStorage?.removeItem(key),
};

async function clearChunks(key: string) {
  const count = Number((await SecureStore.getItemAsync(countKey(key))) ?? 0);
  for (let i = 0; i < count; i++) {
    await SecureStore.deleteItemAsync(chunkKey(key, i));
  }
  await SecureStore.deleteItemAsync(countKey(key));
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return webStorage.getItem(key);

    const count = Number((await SecureStore.getItemAsync(countKey(key))) ?? 0);
    if (!count) return null;

    const chunks: string[] = [];
    for (let i = 0; i < count; i++) {
      const chunk = await SecureStore.getItemAsync(chunkKey(key, i));
      if (chunk === null) return null;
      chunks.push(chunk);
    }
    return chunks.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') return webStorage.setItem(key, value);

    await clearChunks(key);
    const chunks = value.match(new RegExp(`.{1,${CHUNK_SIZE}}`, 'gs')) ?? [];
    for (const [i, chunk] of chunks.entries()) {
      await SecureStore.setItemAsync(chunkKey(key, i), chunk);
    }
    await SecureStore.setItemAsync(countKey(key), String(chunks.length));
  },

  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') return webStorage.removeItem(key);
    await clearChunks(key);
  },
};
