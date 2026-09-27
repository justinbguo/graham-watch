-- Collector #N is this account's place in line. It is assigned when the
-- profile row is created, at sign-up, and it is not counted from whoever is
-- still here: deleting an account must not renumber everyone else.

alter table public.profiles
  add column collector_number integer;

with numbered as (
  select id, row_number() over (order by created_at, id) as n
  from public.profiles
)
update public.profiles as profile
set collector_number = numbered.n
from numbered
where profile.id = numbered.id;

create sequence public.collector_number_seq;

-- is_called is true when a row exists, so the next account is max + 1.
-- An empty table starts at 1.
select setval(
  'public.collector_number_seq',
  greatest(coalesce((select max(collector_number) from public.profiles), 0), 1),
  (select exists (select 1 from public.profiles))
);

alter table public.profiles
  alter column collector_number set default nextval('public.collector_number_seq'),
  alter column collector_number set not null;

alter table public.profiles
  add constraint profiles_collector_number_key unique (collector_number);

alter sequence public.collector_number_seq owned by public.profiles.collector_number;

revoke all on sequence public.collector_number_seq from public, anon, authenticated;

comment on column public.profiles.collector_number is
  'Place in line, assigned at sign-up. Shown as Collector #N. Never reused.';

create function public.profiles_keep_collector_number()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.collector_number is distinct from old.collector_number then
    raise exception 'a collector number cannot change';
  end if;
  return new;
end;
$$;

create trigger profiles_keep_collector_number
before update on public.profiles
for each row
execute function public.profiles_keep_collector_number();
