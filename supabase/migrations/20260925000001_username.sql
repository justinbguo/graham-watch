-- Onboarding slide 2 claims profiles.handle, which was already unique and
-- unused. The check is what a direct update has to satisfy. claim_username
-- is what the slide calls, so a taken name is a sentence rather than a
-- constraint error. src/lib/username.ts mirrors the pattern.

alter table public.profiles
  add constraint profiles_handle_format check (
    handle is null
    or (
      handle ~ '^[a-z][a-z0-9_]{2,19}$'
      and handle not in ('admin', 'graham', 'support', 'help')
    )
  );

comment on column public.profiles.handle is
  'Username from onboarding slide 2. Lowercase, unique, 3–20 characters, starting with a letter.';

create or replace function public.profiles_onboarded_must_be_adult()
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
    if new.handle is null then
      raise exception 'a username is required to finish onboarding';
    end if;
    if new.account_type is null then
      raise exception 'account_type is required to finish onboarding';
    end if;
    if new.date_of_birth is null
       or new.date_of_birth > (current_date - interval '18 years') then
      raise exception 'Graham is for people 18 and over';
    end if;
  end if;

  -- Finishing required one. Clearing a username that was already chosen
  -- would leave the account with nothing to be known by. A profile that
  -- finished before usernames existed still has a null handle, and must
  -- still be able to change an avatar.
  if tg_op = 'UPDATE' and old.handle is not null and new.handle is null then
    raise exception 'a username is required';
  end if;

  return new;
end;
$$;

create function public.claim_username(candidate text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  cleaned text := lower(trim(coalesce(candidate, '')));
begin
  if left(cleaned, 1) = '@' then
    cleaned := substr(cleaned, 2);
  end if;

  if cleaned !~ '^[a-z][a-z0-9_]{2,19}$' then
    raise exception 'Use 3 to 20 letters, numbers, or underscores, starting with a letter.';
  end if;

  -- Reserved words use the same sentence as a collision. The list is not a
  -- hint about which names exist.
  if cleaned in ('admin', 'graham', 'support', 'help') then
    raise exception 'That username is taken.';
  end if;

  update public.profiles
    set handle = cleaned
    where id = (select auth.uid());

  if not found then
    raise exception 'Your account is no longer on this server. Sign out and sign in again.';
  end if;

  return cleaned;
exception
  when unique_violation then
    raise exception 'That username is taken.';
end;
$$;

revoke execute on function public.claim_username(text) from public, anon;
grant execute on function public.claim_username(text) to authenticated, service_role;
