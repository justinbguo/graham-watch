import type { FlagFilter } from './dealerTable';

export type Screen =
  | 'attention'
  | 'dealers'
  | 'refresh'
  | 'users'
  | 'activity'
  | 'applications'
  | 'add';

/** Where a Needs attention row sends the operator. */
export type DealerFocus = {
  dealerId?: string;
  flag?: FlagFilter;
  openListings?: boolean;
};

export type Jump =
  | { screen: 'applications' }
  | { screen: 'dealers'; focus: DealerFocus }
  | { screen: 'refresh'; dealerId?: string };
