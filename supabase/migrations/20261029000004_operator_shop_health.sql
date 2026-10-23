-- Which shops need a person.
--
-- Three flags, any of which is enough:
--   unclaimed  — nobody has claimed_by
--   quiet      — the claimer has not signed in for 14 days (or never has)
--   unanswered — a buyer inquiry or shop-thread message has sat for 48 hours
--                with no later message from the claimer
--
-- last_sign_in_at lives on auth.users, which a client cannot read. This
-- function is the only way out, and it checks the operators table first.
-- A non-operator still cannot list shops, addresses, or sign-in times.

drop function public.operator_dealers();

create function public.operator_dealers()
returns table (
  id uuid,
  name text,
  website text,
  contact_email text,
  permission public.dealer_permission,
  claimed_by uuid,
  created_at timestamptz,
  listings_held bigint,
  listings_in_deck bigint,
  catalog_total bigint,
  catalog_queued bigint,
  catalog_failed bigint,
  can_import boolean,
  last_synced_at timestamptz,
  last_sync_complete boolean,
  last_sync_error text,
  last_sync_found integer,
  last_sync_added integer,
  last_sync_changed integer,
  last_sync_retired integer,
  last_sync_relisted integer,
  last_refresh_at timestamptz,
  last_refresh_published integer,
  last_refresh_skipped integer,
  last_refresh_error text,
  photo_count bigint,
  listings_missing_photos bigint,
  claimer_name text,
  claimer_handle text,
  claimer_last_sign_in_at timestamptz,
  neglect_flags text[],
  unanswered_count integer,
  claim_code_expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_operator();

  return query
    with listing_counts as (
      select
        l.dealer_id,
        count(*) as held,
        count(*) filter (where l.status = 'active' and l.sold_at is null) as sellable
      from public.listings l
      group by l.dealer_id
    ),
    catalog_counts as (
      select
        s.dealer_id,
        count(*) filter (where s.available) as total,
        count(*) filter (
          where s.publish and s.listing_id is null and s.error is null
        ) as queued,
        count(*) filter (where s.error is not null) as failed
      from public.source_items s
      group by s.dealer_id
    ),
    latest_run as (
      select distinct on (r.dealer_id)
        r.dealer_id,
        r.finished_at,
        r.published,
        r.skipped_listings,
        r.error
      from public.refresh_runs r
      order by r.dealer_id, r.finished_at desc
    ),
    waiting_threads as (
      select c.dealer_id, c.id
      from public.conversations c
      join public.dealers d on d.id = c.dealer_id
      where c.dealer_id is not null
        and exists (
          select 1
          from public.messages m
          where m.conversation_id = c.id
            and m.created_at < now() - interval '48 hours'
            and m.sender_id is distinct from d.claimed_by
            and not exists (
              select 1
              from public.messages reply
              where reply.conversation_id = c.id
                and d.claimed_by is not null
                and reply.sender_id = d.claimed_by
                and reply.created_at > m.created_at
            )
        )
    ),
    waiting_inquiries as (
      select i.dealer_id, i.id
      from public.inquiries i
      join public.dealers d on d.id = i.dealer_id
      where i.created_at < now() - interval '48 hours'
        -- An inquiry also drops a message into the shop thread, with the same
        -- timestamp. That thread is the ask. Counting both would say two
        -- things are waiting when the buyer sent one.
        and not exists (
          select 1
          from public.conversations c
          join public.messages m on m.conversation_id = c.id
          where c.dealer_id = i.dealer_id
            and c.opener_id = i.buyer_id
            and m.sender_id = i.buyer_id
            and m.created_at = i.created_at
        )
        and not exists (
          select 1
          from public.conversations c
          join public.messages m on m.conversation_id = c.id
          where c.dealer_id = i.dealer_id
            and c.opener_id = i.buyer_id
            and d.claimed_by is not null
            and m.sender_id = d.claimed_by
            and m.created_at > i.created_at
        )
    ),
    unanswered as (
      select w.dealer_id, count(*)::integer as n
      from (
        select waiting_threads.dealer_id from waiting_threads
        union all
        select waiting_inquiries.dealer_id from waiting_inquiries
      ) w
      group by w.dealer_id
    )
    select
      d.id,
      d.name,
      d.website,
      d.contact_email,
      d.permission,
      d.claimed_by,
      d.created_at,
      coalesce(lc.held, 0),
      case when d.permission = 'approved' then coalesce(lc.sellable, 0) else 0 end,
      coalesce(cc.total, 0),
      coalesce(cc.queued, 0),
      coalesce(cc.failed, 0),
      public.controls_dealer(d.id),
      d.last_synced_at,
      d.last_sync_complete,
      d.last_sync_error,
      d.last_sync_found,
      d.last_sync_added,
      d.last_sync_changed,
      d.last_sync_retired,
      d.last_sync_relisted,
      lr.finished_at,
      lr.published,
      lr.skipped_listings,
      lr.error,
      coalesce(photos.photo_count, 0),
      coalesce(photos.missing_photos, 0),
      nullif(btrim(concat_ws(' ', claimer.first_name, claimer.last_name)), ''),
      claimer.handle,
      claimer_user.last_sign_in_at,
      coalesce((
        select array_agg(flag)
        from (
          select 'unclaimed'::text as flag where d.claimed_by is null
          union all
          select 'quiet'
          where d.claimed_by is not null
            and (
              claimer_user.last_sign_in_at is null
              or claimer_user.last_sign_in_at < now() - interval '14 days'
            )
          union all
          select 'unanswered'
          where coalesce(unanswered.n, 0) > 0
        ) flags
      ), '{}'::text[]),
      coalesce(unanswered.n, 0),
      live_code.expires_at
    from public.dealers d
    left join listing_counts lc on lc.dealer_id = d.id
    left join catalog_counts cc on cc.dealer_id = d.id
    left join latest_run lr on lr.dealer_id = d.id
    left join public.listing_photo_counts() photos on photos.dealer_id = d.id
    left join public.profiles claimer on claimer.id = d.claimed_by
    left join auth.users claimer_user on claimer_user.id = d.claimed_by
    left join unanswered on unanswered.dealer_id = d.id
    left join lateral (
      select c.expires_at
      from public.dealer_claim_codes c
      where c.dealer_id = d.id
        and c.handoff
        and c.consumed_at is null
        and c.expires_at > now()
      order by c.created_at desc
      limit 1
    ) live_code on true
    order by d.created_at desc;
end;
$$;

revoke all on function public.operator_dealers() from public, anon;
grant execute on function public.operator_dealers() to authenticated, service_role;
