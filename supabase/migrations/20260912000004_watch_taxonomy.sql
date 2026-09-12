-- Free text cannot be filtered on. "manual", "manually wound" and "Venus 150"
-- all arrived in one movement column, so no query could ask for hand-wound
-- watches. These enums are the vocabulary the extractor is held to: a value
-- outside the list is not something the model can return.

create type public.winding as enum ('manual', 'automatic', 'quartz');

create type public.case_material as enum (
  'steel', 'yellow_gold', 'rose_gold', 'white_gold', 'platinum',
  'two_tone', 'titanium', 'bronze', 'silver', 'other'
);

create type public.dial_color as enum (
  'black', 'white', 'silver', 'champagne', 'gilt', 'blue', 'green',
  'grey', 'salmon', 'brown', 'cream', 'other'
);

create type public.watch_style as enum (
  'dress', 'diver', 'chronograph', 'pilot', 'field', 'racing',
  'gmt', 'jewellery', 'pocket', 'other'
);

create type public.complication as enum (
  'chronograph', 'date', 'day_date', 'triple_calendar', 'annual_calendar',
  'perpetual_calendar', 'moonphase', 'gmt', 'world_time', 'alarm',
  'power_reserve', 'tourbillon', 'minute_repeater', 'jump_hour', 'skeleton'
);

-- movement held a caliber name as often as a winding type. Split the two.
alter table public.listings rename column movement to caliber;

alter table public.listings
  add column winding public.winding,
  add column case_material public.case_material,
  add column dial_color public.dial_color,
  add column style public.watch_style,
  add column complications public.complication[] not null default '{}',
  -- Dealers write "Vacheron & Constantin" and "Vacheron Constantin" for one
  -- brand. brand stays as printed; brand_key is what filters and groups.
  add column brand_key text;

create index listings_brand_key_idx on public.listings (brand_key);
create index listings_price_cents_idx on public.listings (price_cents);
create index listings_style_idx on public.listings (style);
create index listings_case_material_idx on public.listings (case_material);
create index listings_year_idx on public.listings (year);
create index listings_complications_idx on public.listings using gin (complications);

-- Brand and model are what people actually type when hunting for a watch.
create index listings_text_idx on public.listings
  using gin (to_tsvector('english', coalesce(brand, '') || ' ' || coalesce(model, '') || ' ' || coalesce(reference, '')));
