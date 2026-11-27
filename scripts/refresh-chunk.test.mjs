import { spawnSync } from 'node:child_process';

import { config } from './_supabase.mjs';

if (!config().isLocal) {
  console.error(`Refusing to run: ${config().url} is not the local stack.`);
  process.exit(1);
}

const listed = spawnSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' });
const database = listed.stdout
  .split('\n')
  .find((name) => name.startsWith('supabase_db_'));
if (!database) {
  console.error(listed.stderr || 'No local Supabase database container is running.');
  process.exit(1);
}

const sql = String.raw`
begin;

create or replace function public.proof_slow_source_update()
returns trigger
language plpgsql
as $$
begin
  perform pg_sleep(0.008);
  return new;
end;
$$;

create trigger proof_slow_source_update
  before update on public.source_items
  for each row
  execute function public.proof_slow_source_update();

do $proof$
declare
  owner uuid := '5eed0000-0000-4000-8000-000000000001';
  shop uuid := '11111111-1111-4111-8111-111111111111';
  stamp timestamptz := '2026-11-26T16:12:17Z';
  older timestamptz := '2026-11-25T16:12:17Z';
  seen uuid[];
  whole jsonb;
begin
  insert into public.dealers (id, name, website, permission, created_by)
  values (shop, 'Chunk Proof', 'https://chunk-proof.test', 'approved', owner);

  insert into public.listings (dealer_id, imported_by, source_url, brand, currency)
  select shop, owner, 'https://chunk-proof.test/w/' || g, 'Proof', 'USD'
  from generate_series(1, 4) as g;

  insert into public.source_items (
    dealer_id, provider, external_id, source_url, raw, text_hash, content_hash,
    available, publish, hold_reason, listing_id, last_seen_at
  )
  select
    shop,
    'shopify',
    'proof:' || g,
    'https://chunk-proof.test/w/' || g,
    jsonb_build_object('body', repeat('x', 2000)),
    't',
    'c',
    true,
    true,
    case when g = 4 then 'strap' else null end,
    (select l.id from public.listings l where l.dealer_id = shop and l.source_url = 'https://chunk-proof.test/w/' || g),
    case when g = 3 then older else stamp end
  from generate_series(1, 4) as g;

  select array_agg(id order by external_id)
    into seen
  from public.source_items
  where dealer_id = shop
    and external_id in ('proof:1', 'proof:2', 'proof:4');

  whole := public.sync_source_availability(shop, seen, true);
  if (whole->>'retired')::int <> 2 then
    raise exception 'one availability call retired %, expected 2', whole->>'retired';
  end if;

  update public.listings
  set sold_at = null, sold_source = null, availability_checked_at = null
  where dealer_id = shop;
  update public.source_items
  set last_seen_at = case when external_id = 'proof:3' then older else stamp end
  where dealer_id = shop;

  perform public.sync_source_availability(shop, seen[1:2], false);
  perform public.sync_source_availability(shop, seen[3:3], false);
  perform public.sync_source_availability(shop, seen[1:1], true);

  if (select count(*) from public.listings where dealer_id = shop and sold_source = 'missing_from_catalog') <> 1 then
    raise exception 'split availability retired the wrong missing rows';
  end if;
  if (select count(*) from public.listings where dealer_id = shop and sold_source = 'not_a_watch') <> 1 then
    raise exception 'split availability did not withdraw the held listing';
  end if;
  if (select count(*) from public.listings where dealer_id = shop and sold_at is null) <> 2 then
    raise exception 'split availability sold a listing that was still in the read';
  end if;

  delete from public.source_items where dealer_id = shop;
  delete from public.listings where dealer_id = shop;

  insert into public.source_items (
    dealer_id, provider, external_id, source_url, raw, text_hash, content_hash,
    available, publish, hold_reason, last_seen_at
  )
  select
    shop, 'shopify', 'held:' || g, 'https://chunk-proof.test/h/' || g,
    jsonb_build_object('body', repeat('y', 4000)),
    't', 'c', false, true, 'accessory', stamp
  from generate_series(1, 400) as g;
end;
$proof$;

savepoint wide;
set local statement_timeout = '2000ms';
\set ON_ERROR_STOP off
update public.source_items
set publish = false
where dealer_id = '11111111-1111-4111-8111-111111111111'
  and hold_reason is not null;
\set ON_ERROR_STOP on
rollback to savepoint wide;

set local statement_timeout = '2000ms';
update public.source_items
set publish = false
where id in (
  select id from public.source_items
  where dealer_id = '11111111-1111-4111-8111-111111111111'
    and publish and hold_reason is not null
  order by id
  limit 100
);
update public.source_items
set publish = false
where id in (
  select id from public.source_items
  where dealer_id = '11111111-1111-4111-8111-111111111111'
    and publish and hold_reason is not null
  order by id
  limit 100
);
update public.source_items
set publish = false
where id in (
  select id from public.source_items
  where dealer_id = '11111111-1111-4111-8111-111111111111'
    and publish and hold_reason is not null
  order by id
  limit 100
);
update public.source_items
set publish = false
where id in (
  select id from public.source_items
  where dealer_id = '11111111-1111-4111-8111-111111111111'
    and publish and hold_reason is not null
  order by id
  limit 100
);

do $check$
begin
  if (
    select count(*)
    from public.source_items
    where dealer_id = '11111111-1111-4111-8111-111111111111'
      and publish
  ) <> 0 then
    raise exception 'chunked update left publish true';
  end if;
end;
$check$;

rollback;
`;

const ran = spawnSync(
  'docker',
  ['exec', '-i', database, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
  { encoding: 'utf8', input: sql }
);
process.stdout.write(ran.stdout ?? '');
process.stderr.write(ran.stderr ?? '');
if (ran.status !== 0) process.exit(ran.status ?? 1);
if (!/canceling statement due to statement timeout/.test(`${ran.stdout}\n${ran.stderr}`)) {
  console.error('The shop-wide update was not canceled.');
  process.exit(1);
}
console.log('refresh chunk proof passed');
