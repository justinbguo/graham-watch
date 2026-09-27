-- Onboarding now collects a birthday (Graham is 18+), a few questions about
-- how someone collects, and whether they want notices. None of this is a
-- permission: the columns exist so we can ask later without inventing the
-- answers. Push tokens and the OS permission prompt are a later pass.

create type public.collecting_years as enum (
  'not_yet',
  'under_a_year',
  'one_to_five',
  'five_to_ten',
  'over_ten'
);

create type public.collection_size as enum (
  'none',
  'one_to_three',
  'four_to_ten',
  'eleven_plus'
);

create type public.watch_hunt as enum (
  'dress',
  'sports',
  'tool',
  'anything'
);

alter table public.profiles
  add column date_of_birth date,
  add column collecting_years public.collecting_years,
  add column collection_size public.collection_size,
  add column hunting_for public.watch_hunt[] not null default '{}',
  add column notify_new_arrivals boolean not null default false,
  add column notify_saved_watches boolean not null default false;

-- The UI can refuse a Continue tap. The trigger is what actually stops a
-- client with the anon key from stamping onboarded_at on a child.
create function public.profiles_onboarded_must_be_adult()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Only when they finish. An already-onboarded row with a null birthday
  -- (accounts created before this column) must still be able to change an
  -- avatar; blocking every update would trap them.
  if new.onboarded_at is not null
     and (tg_op = 'INSERT' or old.onboarded_at is distinct from new.onboarded_at) then
    if new.account_type is null then
      raise exception 'account_type is required to finish onboarding';
    end if;
    if new.date_of_birth is null
       or new.date_of_birth > (current_date - interval '18 years') then
      raise exception 'Graham is for people 18 and over';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_onboarded_must_be_adult
before insert or update on public.profiles
for each row
execute function public.profiles_onboarded_must_be_adult();
