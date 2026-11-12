-- Desktop finishes onboarding without a birthday or a username. A birthday
-- that is present and under 18 is still refused. A username that was already
-- chosen cannot be cleared.

create or replace function public.profiles_onboarded_must_be_adult()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.onboarded_at is not null
     and (tg_op = 'INSERT' or old.onboarded_at is distinct from new.onboarded_at) then
    if new.account_type is null then
      raise exception 'account_type is required to finish onboarding';
    end if;
    if new.date_of_birth is not null
       and new.date_of_birth > (current_date - interval '18 years') then
      raise exception 'Graham is for people 18 and over';
    end if;
  end if;

  if tg_op = 'UPDATE' and old.handle is not null and new.handle is null then
    raise exception 'a username is required';
  end if;

  return new;
end;
$$;
