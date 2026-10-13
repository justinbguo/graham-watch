import type { Database } from '@/lib/database';

export type CollectionSize = Database['public']['Enums']['collection_size'];
export type WatchSearchPain = Database['public']['Enums']['watch_search_pain'];

export const COLLECTION_SIZES: { value: CollectionSize; label: string }[] = [
  { value: 'none', label: '0' },
  { value: 'one', label: '1' },
  { value: 'two_to_three', label: '2–3' },
  { value: 'four_to_six', label: '4–6' },
  { value: 'seven_to_ten', label: '7–10' },
  { value: 'eleven_to_twenty', label: '11–20' },
  { value: 'twenty_one_plus', label: '21+' },
];

export const WATCH_SEARCH_PAINS: { value: WatchSearchPain; label: string }[] = [
  { value: 'trusting_sellers', label: 'Knowing which sellers to trust' },
  { value: 'verifying_originality', label: 'Verifying originality and authenticity' },
  { value: 'judging_condition', label: 'Judging condition from photos' },
  { value: 'finding_fair_prices', label: 'Knowing whether a price is fair' },
  { value: 'finding_specific_watches', label: 'Finding a specific watch or reference' },
  { value: 'understanding_service_history', label: 'Understanding service history' },
  { value: 'buying_online', label: 'Feeling confident buying online' },
];
