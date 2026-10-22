-- A phone's Expo push token, so a reply in a thread can reach the other person
-- when the app is closed. The token is a secret: anyone who can read it can
-- send that phone a notification. RLS lets you read only your own. Delivery
-- reads every recipient's tokens from a definer trigger, which is the one
-- place that is allowed to.

create extension if not exists pg_net;

create table public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null unique,
  platform text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint device_push_tokens_platform check (platform in ('ios', 'android')),
  constraint device_push_tokens_token_len check (char_length(token) between 20 and 512)
);

create index device_push_tokens_user_idx on public.device_push_tokens (user_id);

alter table public.device_push_tokens enable row level security;

create policy "you read your own push tokens"
on public.device_push_tokens for select to authenticated
using (user_id = (select auth.uid()));

revoke all on public.device_push_tokens from anon, public, authenticated;
grant select on public.device_push_tokens to authenticated;

comment on table public.device_push_tokens is
  'Expo push tokens for the signed-in account. One row per device. Not readable by other users.';

/**
 * Remember this device for the signed-in account.
 *
 * The same token may already belong to whoever used the phone last. It has to
 * move: a token left on the previous account would notify them of the new
 * person's replies. The token is unguessable, so deleting by its exact value
 * does not let one account clear another's devices.
 */
create function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'sign in to turn on notifications';
  end if;
  if p_platform is null or p_platform not in ('ios', 'android') then
    raise exception 'unknown platform';
  end if;
  if p_token is null
    or p_token !~ '^Expo(nent)?PushToken\[[^][]{10,180}\]$' then
    raise exception 'that token is not an Expo push token';
  end if;

  delete from public.device_push_tokens where token = p_token;

  insert into public.device_push_tokens (user_id, token, platform, updated_at)
  values (uid, p_token, p_platform, now());

  -- A person with a drawer of old phones should not accumulate a row forever.
  delete from public.device_push_tokens
  where user_id = uid
    and id not in (
      select id
      from public.device_push_tokens
      where user_id = uid
      order by updated_at desc
      limit 8
    );
end;
$$;

revoke all on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;

/** Drop this device. Other devices signed in as the same person stay registered. */
create function public.unregister_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'sign in to turn off notifications';
  end if;
  if p_token is null then
    return;
  end if;

  delete from public.device_push_tokens
  where token = p_token
    and user_id = uid;
end;
$$;

revoke all on function public.unregister_push_token(text) from public, anon;
grant execute on function public.unregister_push_token(text) to authenticated;

/**
 * Tell everyone else in the thread that a message arrived.
 *
 * Messages are written by the app and by the inquiry trigger, so the send has
 * to live here rather than in one client. pg_net queues the HTTP call and
 * returns; a failure to reach Expo must not roll back the message the person
 * just sent. No token means no request, which is the normal case in tests.
 *
 * Expo's push API does not require a secret. The token is the capability.
 * Turning on Expo's enhanced push security would reject these calls until a
 * token is added — leave that off for the first TestFlight.
 */
create function public.notify_message_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tokens text[];
  sender_name text;
  title text;
begin
  select coalesce(array_agg(token), '{}')
  into tokens
  from (
    select distinct t.token
    from public.device_push_tokens t
    where t.user_id in (
      select recipient.user_id
      from (
        select m.user_id
        from public.conversations c
        join public.conversation_members m on m.conversation_id = c.id
        where c.id = new.conversation_id
          and c.is_group

        union

        select case
          when c.opener_id = new.sender_id then c.partner_id
          else c.opener_id
        end
        from public.conversations c
        where c.id = new.conversation_id
          and not c.is_group
          and c.partner_id is not null

        union

        select case
          when c.opener_id = new.sender_id then d.claimed_by
          else c.opener_id
        end
        from public.conversations c
        join public.dealers d on d.id = c.dealer_id
        where c.id = new.conversation_id
          and not c.is_group
      ) recipient
      where recipient.user_id is not null
        and recipient.user_id <> new.sender_id
    )
    limit 100
  ) picked;

  if cardinality(tokens) = 0 then
    return new;
  end if;

  select coalesce(
    nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
    'Someone'
  )
  into sender_name
  from public.profiles p
  where p.id = new.sender_id;

  title := case
    when new.via = 'email' then 'New inquiry'
    else coalesce(sender_name, 'New message')
  end;

  begin
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := jsonb_build_object(
        'to', to_jsonb(tokens),
        'title', title,
        'body', left(btrim(new.body), 180),
        'sound', 'default',
        'priority', 'high',
        'channelId', 'watch-updates',
        'data', jsonb_build_object('conversationId', new.conversation_id)
      ),
      headers := '{"Content-Type":"application/json"}'::jsonb
    );
  exception
    when others then
      -- The message is the product. A push is a courtesy on top of it.
      raise warning 'message % was saved but the push was not queued: %', new.id, sqlerrm;
      return new;
  end;

  return new;
end;
$$;

-- Fail the migration if this Postgres has no pg_net post function, rather than
-- shipping a trigger that only discovers the mismatch when the first reply is sent.
do $$
begin
  if to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)') is null then
    raise exception 'pg_net http_post is not available';
  end if;
end
$$;

create trigger messages_notify_push
after insert on public.messages
for each row
execute function public.notify_message_push();

revoke all on function public.notify_message_push() from public, anon, authenticated;
