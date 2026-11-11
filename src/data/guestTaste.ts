import { useCallback, useEffect, useState } from 'react';

import { secureStorage } from '@/lib/secureStorage';

import { brandKey, type PriceBand, type RankSeed } from './rank';

const STORAGE_KEY = 'graham.taste';

export const TASTE_BRANDS = [
  'Rolex',
  'Omega',
  'Patek Philippe',
  'Cartier',
  'Audemars Piguet',
  'Heuer',
] as const;

export const TASTE_STYLES = [
  { value: 'dress', label: 'Dress' },
  { value: 'diver', label: 'Diver' },
  { value: 'chronograph', label: 'Chronograph' },
  { value: 'pilot', label: 'Pilot' },
] as const;

export type GuestTaste = {
  brands: string[];
  styles: string[];
  priceBand: PriceBand | null;
  settled: boolean;
};

const EMPTY: GuestTaste = { brands: [], styles: [], priceBand: null, settled: false };

let current: GuestTaste = EMPTY;
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function parse(raw: string | null): GuestTaste {
  if (!raw) return EMPTY;
  try {
    const value = JSON.parse(raw) as Partial<GuestTaste>;
    const band = value.priceBand;
    return {
      brands: strings(value.brands),
      styles: strings(value.styles),
      priceBand: band === 'low' || band === 'mid' || band === 'high' ? band : null,
      settled: value.settled === true,
    };
  } catch {
    return EMPTY;
  }
}

function load(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (!loading) {
    loading = secureStorage.getItem(STORAGE_KEY).then((raw) => {
      current = parse(raw);
      loaded = true;
      emit();
    });
  }
  return loading;
}

export function tasteCacheKey(taste: GuestTaste): string {
  return JSON.stringify({
    brands: [...new Set(taste.brands.map(brandKey))].sort(),
    styles: [...new Set(taste.styles)].sort(),
    priceBand: taste.priceBand,
  });
}

export function tasteSeed(taste: GuestTaste): RankSeed {
  return {
    brands: [...new Set(taste.brands)],
    styles: [...new Set(taste.styles)],
    priceBand: taste.priceBand,
  };
}

/**
 * The guest's picks, kept on the device. Signed-in ranking still sends them:
 * the picks are a prior on top of events, and they survive the sign-in that
 * happens on the same phone.
 */
export function useGuestTaste() {
  const [taste, setTaste] = useState(current);
  const [ready, setReady] = useState(loaded);

  useEffect(() => {
    const listener = () => {
      setTaste(current);
      setReady(loaded);
    };
    listeners.add(listener);
    void load().then(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const settle = useCallback(async (next: Omit<GuestTaste, 'settled'>) => {
    current = { ...next, settled: true };
    loaded = true;
    emit();
    await secureStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  }, []);

  const active = taste.settled ? taste : EMPTY;

  return {
    taste,
    ready,
    seed: tasteSeed(active),
    cacheKey: taste.settled ? tasteCacheKey(taste) : 'none',
    settle,
  };
}
