-- The second onboarding pass asks what makes vintage-watch search difficult
-- instead of what style somebody is hunting. Keep the old columns and enum:
-- profiles written by the first pass may still contain useful answers.
create type public.watch_search_pain as enum (
  'trusting_sellers',
  'verifying_originality',
  'judging_condition',
  'finding_fair_prices',
  'finding_specific_watches',
  'understanding_service_history',
  'buying_online'
);

alter type public.collection_size add value if not exists 'one';
alter type public.collection_size add value if not exists 'two_to_three';
alter type public.collection_size add value if not exists 'four_to_six';
alter type public.collection_size add value if not exists 'seven_to_ten';
alter type public.collection_size add value if not exists 'eleven_to_twenty';
alter type public.collection_size add value if not exists 'twenty_one_plus';

alter table public.profiles
  add column search_pain_points public.watch_search_pain[] not null default '{}',
  add column notifications_enabled boolean not null default false;

comment on column public.profiles.notifications_enabled is
  'Whether onboarding obtained an OS notification permission. A true value is not a push token.';
