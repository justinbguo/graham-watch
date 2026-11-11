import type { Database as Generated } from './database.types';

export { Constants } from './database.types';
export type { Json } from './database.types';

/**
 * The generated schema, corrected where Postgres says more than the generator
 * can read. `database.types.ts` is rewritten by `npm run db:types` and CI
 * fails if it differs from a fresh run, so corrections live here, not there.
 *
 * - A band is a pair of arrays where a null end means open: "over $10,000"
 *   has no max. SQL arrays hold nulls; the generator types them `number[]`.
 * - Function arguments are typed non-null, but a SQL argument with no
 *   `strict` takes null: a new post has no id, a trade has no price.
 *   `search_listings_v2` and `rank_buy_feed` also return a null cursor on the
 *   last page.
 * - `author_number` is set by a trigger, so an insert leaves it out.
 */
type G = Generated['public'];
type Fn = G['Functions'];
type Band = (number | null)[];

type Bands = {
  p_price_mins?: Band;
  p_price_maxs?: Band;
  p_size_mins?: Band;
  p_size_maxs?: Band;
  p_year_mins?: Band;
  p_year_maxs?: Band;
};

type WithArgs<F extends { Args: unknown }, A> = Omit<F, 'Args'> & { Args: Omit<F['Args'], keyof A> & A };

type SearchV2 = Fn['search_listings_v2'];
type SearchV2Row = SearchV2['Returns'][number];
type RankFeed = Fn['rank_buy_feed'];
type RankFeedRow = RankFeed['Returns'][number];

type Functions = Omit<
  Fn,
  | 'search_listings'
  | 'listing_counts'
  | 'search_listings_v2'
  | 'rank_buy_feed'
  | 'save_exchange_post'
  | 'exchange_vote'
> & {
  search_listings: WithArgs<Fn['search_listings'], Bands>;
  listing_counts: WithArgs<Fn['listing_counts'], Bands>;
  // The next-page cursor is null on the last page, and the first call passes
  // null. The generator types both as a plain string.
  search_listings_v2: Omit<SearchV2, 'Args' | 'Returns'> & {
    Args: Omit<SearchV2['Args'], 'p_cursor'> & { p_cursor?: string | null };
    Returns: (Omit<SearchV2Row, 'cursor'> & { cursor: string | null })[];
  };
  rank_buy_feed: Omit<RankFeed, 'Args' | 'Returns'> & {
    Args: Omit<RankFeed['Args'], 'p_cursor'> & { p_cursor?: string | null };
    Returns: (Omit<RankFeedRow, 'cursor'> & { cursor: string | null })[];
  };
  save_exchange_post: WithArgs<
    Fn['save_exchange_post'],
    { p_post_id?: string | null; p_price_cents?: number | null }
  >;
  exchange_vote: WithArgs<
    Fn['exchange_vote'],
    { p_post_id: string | null; p_comment_id: string | null }
  >;
};

type Comments = G['Tables']['exchange_comments'];

type Tables = Omit<G['Tables'], 'exchange_comments'> & {
  exchange_comments: Omit<Comments, 'Insert'> & {
    Insert: Omit<Comments['Insert'], 'author_number'> & { author_number?: number };
  };
};

export type Database = Omit<Generated, 'public'> & {
  public: Omit<G, 'Tables' | 'Functions'> & { Tables: Tables; Functions: Functions };
};
