-- Local-only seed: one approved dealer with a handful of watches, imported by a
-- demo account, so the deck has something in it before the importer runs.
-- The on_auth_user_created trigger creates the matching profiles row.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated',
  'authenticated',
  'importer@graham.test',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Graham Importer"}',
  now(),
  now()
)
on conflict (id) do nothing;

insert into public.dealers (id, name, website, contact_email, permission, created_by)
values (
  '22222222-2222-2222-2222-222222222222',
  'Vintage Vault',
  'https://vintagevault.test',
  'sales@vintagevault.test',
  'approved',
  '11111111-1111-1111-1111-111111111111'
)
on conflict (id) do nothing;

with seeded as (
  insert into public.listings (
    dealer_id, imported_by, source_url, brand, model, reference, year, movement,
    case_size_mm, condition, has_box, has_papers, price_cents, currency, description
  )
  values
    ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'https://vintagevault.test/1', 'Omega', 'Speedmaster Professional', 'ST 145.022', 1972, 'Cal. 861 manual wind', 42.0, 'Very good', true, false, 1250000, 'USD', 'Tritium dial with even patina. Recently serviced.'),
    ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'https://vintagevault.test/2', 'Rolex', 'Datejust', '1601', 1968, 'Cal. 1570 automatic', 36.0, 'Good', false, false, 785000, 'USD', 'Silver pie-pan dial on a jubilee bracelet.'),
    ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'https://vintagevault.test/3', 'Heuer', 'Autavia', '2446', 1965, 'Valjoux 72 manual wind', 39.0, 'Excellent', true, true, 3400000, 'USD', 'Second execution dial, screw-back case.'),
    ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'https://vintagevault.test/4', 'Seiko', '6139 Pogue', '6139-6002', 1976, 'Cal. 6139 automatic', 41.0, 'Fair', false, false, 92000, 'USD', 'Yellow dial, original bracelet, honest wear.'),
    ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'https://vintagevault.test/5', 'Universal Genève', 'Polerouter', '20217-4', 1959, 'Cal. 215 micro-rotor', 34.5, 'Very good', false, false, 310000, 'USD', 'Crosshair dial, later crown.'),
    ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'https://vintagevault.test/6', 'Cartier', 'Tank Must', 'Ref. 5057001', 1988, 'Quartz', 30.0, 'Excellent', true, true, 420000, 'USD', 'Vermeil case, original deployant.')
  returning id, reference
)
insert into public.listing_photos (listing_id, url, position)
select
  seeded.id,
  format('https://picsum.photos/seed/%s/900/1200', seeded.reference),
  0
from seeded;
