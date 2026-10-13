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

type Functions = Omit<
  Fn,
  'search_listings' | 'listing_counts' | 'save_exchange_post' | 'exchange_vote'
> & {
  search_listings: WithArgs<Fn['search_listings'], Bands>;
  listing_counts: WithArgs<Fn['listing_counts'], Bands>;
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
