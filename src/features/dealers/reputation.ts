export type DealerReputation = {
  /** Out of five, one decimal. */
  rating: number;
  reviews: number;
  yearsTrading: number;
  sales: number;
  respondsIn: string;
};

/**
 * Deterministic pseudo-random draws from a string. Sequential calls advance the
 * state, so the same id always yields the same series.
 */
function seeded(seed: string) {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    state ^= seed.charCodeAt(i);
    state = Math.imul(state, 16777619);
  }

  return (range: number) => {
    state = Math.imul(state ^ (state >>> 15), 2246822507);
    state = Math.imul(state ^ (state >>> 13), 3266489909);
    state ^= state >>> 16;
    return (state >>> 0) % range;
  };
}

const RESPONSE_TIMES = ['< 1 hour', '~4 hours', '< 1 day'];

/**
 * Invented numbers, shown behind a "sample" label until dealers have accounts
 * and buyers can leave feedback. Seeded from the dealer id rather than random:
 * a rating that changed every time you opened the watch would read as a bug
 * long before anyone worked out it was never real.
 *
 * This function is the whole seam. Swap it for a query and the panel above it
 * does not change.
 */
export function placeholderReputation(dealerId: string): DealerReputation {
  const draw = seeded(dealerId);

  return {
    rating: (42 + draw(8)) / 10,
    reviews: 40 + draw(260),
    yearsTrading: 6 + draw(25),
    sales: 300 + draw(2400),
    respondsIn: RESPONSE_TIMES[draw(RESPONSE_TIMES.length)],
  };
}
