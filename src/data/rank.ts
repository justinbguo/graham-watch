/**
 * Buy orders the deck with one score. A click weighs more than a save, and a
 * pass is a mild negative. The brand takes that full weight. The style and
 * the price band take a smaller share of the same gesture, so one watch
 * cannot rewrite the feed. Undo pops the action it takes back, and the undo
 * itself adds nothing. Unsave pops the latest save on that watch. A followed
 * shop adds more than one click. A price, photos, and recency belong to the
 * watch.
 *
 * `orderFeed` does not sort by that score alone. It takes each brand's best
 * remaining watch before a brand is allowed a second seat, then picks among
 * that round by score. One loved brand cannot fill the top of the feed while
 * other brands still have a watch to show. The same numbers are in
 * `rank_buy_feed`, which is what the deck asks the database for.
 */

export const RANK = {
  click: 300,
  save: 200,
  pass: -100,
  /** Style and price band. Smaller than the brand, same gesture. */
  clickFacet: 100,
  saveFacet: 60,
  passFacet: -30,
  follow: 500,
  price: 50,
  photo: 10,
  photoCap: 3,
  recent: 120,
  month: 60,
  quarter: 20,
  brandPick: 250,
  stylePick: 100,
  bandPick: 100,
  recentDays: 7,
  monthDays: 30,
  quarterDays: 90,
} as const;

export const PRICE_BAND_CENTS = {
  low: 500_000,
  high: 1_500_000,
} as const;

export type PriceBand = 'low' | 'mid' | 'high';

export type RankKind = 'save' | 'pass' | 'dealer_click' | 'undo' | 'unsave';

export type RankEvent = {
  kind: RankKind;
  listingId: string;
  /** Order among events. Smaller happened first. */
  at: number;
};

export type RankWatch = {
  id: string;
  brandKey: string;
  style: string | null;
  priceCents: number | null;
  createdAtMs: number;
  dealerId: string;
  photoCount: number;
};

export type RankSeed = {
  brands: readonly string[];
  styles: readonly string[];
  priceBand: PriceBand | null;
};

export type RankTaste = {
  events: readonly RankEvent[];
  /** The watch an event pointed at. A deleted watch is absent and does not score. */
  watched: ReadonlyMap<string, Pick<RankWatch, 'brandKey' | 'style' | 'priceCents'>>;
  followedDealerIds: ReadonlySet<string>;
  seed: RankSeed;
  favoriteBrandKeys: readonly string[];
};

const ACTION_WEIGHT: Record<'save' | 'pass' | 'dealer_click', number> = {
  dealer_click: RANK.click,
  save: RANK.save,
  pass: RANK.pass,
};

const FACET_WEIGHT: Record<'save' | 'pass' | 'dealer_click', number> = {
  dealer_click: RANK.clickFacet,
  save: RANK.saveFacet,
  pass: RANK.passFacet,
};

const DAY_MS = 86_400_000;

/** The same key `brand_key()` stores: letters and digits, lower case. */
export function brandKey(brand: string): string {
  return brand
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function priceBand(cents: number | null): PriceBand | null {
  if (cents == null) return null;
  if (cents < PRICE_BAND_CENTS.low) return 'low';
  if (cents < PRICE_BAND_CENTS.high) return 'mid';
  return 'high';
}

export function emptySeed(): RankSeed {
  return { brands: [], styles: [], priceBand: null };
}

export function emptyTaste(seed: RankSeed = emptySeed()): RankTaste {
  return {
    events: [],
    watched: new Map(),
    followedDealerIds: new Set(),
    seed,
    favoriteBrandKeys: [],
  };
}

/**
 * Actions that still count. Undo removes the latest action on that watch.
 * Unsave removes the latest save. Neither writes a weight of its own.
 */
export function netActions(events: readonly RankEvent[]): Map<string, RankKind[]> {
  const open = new Map<string, RankKind[]>();
  const ordered = [...events].sort((a, b) => a.at - b.at);
  for (const event of ordered) {
    const stack = open.get(event.listingId) ?? [];
    if (event.kind === 'undo') {
      stack.pop();
    } else if (event.kind === 'unsave') {
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        if (stack[index] === 'save') {
          stack.splice(index, 1);
          break;
        }
      }
    } else {
      stack.push(event.kind);
    }
    open.set(event.listingId, stack);
  }
  return open;
}

function add(map: Map<string, number>, key: string | null | undefined, amount: number) {
  if (!key || amount === 0) return;
  map.set(key, (map.get(key) ?? 0) + amount);
}

export function tasteWeights(taste: RankTaste): {
  brand: Map<string, number>;
  style: Map<string, number>;
  band: Map<string, number>;
} {
  const brand = new Map<string, number>();
  const style = new Map<string, number>();
  const band = new Map<string, number>();
  for (const [listingId, stack] of netActions(taste.events)) {
    const watch = taste.watched.get(listingId);
    if (!watch) continue;
    for (const kind of stack) {
      if (kind === 'undo' || kind === 'unsave') continue;
      const weight = ACTION_WEIGHT[kind];
      const facet = FACET_WEIGHT[kind];
      add(brand, watch.brandKey, weight);
      add(style, watch.style, facet);
      add(band, priceBand(watch.priceCents), facet);
    }
  }
  for (const key of taste.favoriteBrandKeys) add(brand, brandKey(key), RANK.brandPick);
  for (const name of taste.seed.brands) add(brand, brandKey(name), RANK.brandPick);
  for (const name of taste.seed.styles) add(style, name, RANK.stylePick);
  add(band, taste.seed.priceBand, RANK.bandPick);
  return { brand, style, band };
}

export function recency(createdAtMs: number, nowMs: number): number {
  const days = (nowMs - createdAtMs) / DAY_MS;
  if (days < RANK.recentDays) return RANK.recent;
  if (days < RANK.monthDays) return RANK.month;
  if (days < RANK.quarterDays) return RANK.quarter;
  return 0;
}

export function scoreWatch(
  watch: RankWatch,
  weights: ReturnType<typeof tasteWeights>,
  followed: ReadonlySet<string>,
  nowMs: number,
): number {
  const band = priceBand(watch.priceCents);
  return (
    (weights.brand.get(watch.brandKey) ?? 0) +
    (watch.style ? (weights.style.get(watch.style) ?? 0) : 0) +
    (band ? (weights.band.get(band) ?? 0) : 0) +
    (followed.has(watch.dealerId) ? RANK.follow : 0) +
    (watch.priceCents != null ? RANK.price : 0) +
    Math.min(Math.max(watch.photoCount, 0), RANK.photoCap) * RANK.photo +
    recency(watch.createdAtMs, nowMs)
  );
}

function byScore(nowMs: number, weights: ReturnType<typeof tasteWeights>, followed: ReadonlySet<string>) {
  return (a: RankWatch, b: RankWatch) => {
    const delta =
      scoreWatch(b, weights, followed, nowMs) - scoreWatch(a, weights, followed, nowMs);
    if (delta !== 0) return delta;
    if (a.createdAtMs !== b.createdAtMs) return b.createdAtMs - a.createdAtMs;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  };
}

/**
 * One round per depth. Round 0 is every brand's best watch, highest score
 * first. Round 1 is every brand's second watch. A brand with nothing left
 * sits out that round.
 */
export function orderFeed(
  watches: readonly RankWatch[],
  taste: RankTaste,
  nowMs: number,
): RankWatch[] {
  const weights = tasteWeights(taste);
  const compare = byScore(nowMs, weights, taste.followedDealerIds);
  const byBrand = new Map<string, RankWatch[]>();
  for (const watch of watches) {
    const key = watch.brandKey || watch.id;
    const list = byBrand.get(key) ?? [];
    list.push(watch);
    byBrand.set(key, list);
  }
  let depth = 0;
  for (const list of byBrand.values()) {
    list.sort(compare);
    depth = Math.max(depth, list.length);
  }
  const ordered: RankWatch[] = [];
  for (let slot = 0; slot < depth; slot += 1) {
    const round: RankWatch[] = [];
    for (const list of byBrand.values()) {
      const watch = list[slot];
      if (watch) round.push(watch);
    }
    round.sort(compare);
    ordered.push(...round);
  }
  return ordered;
}
