-- Included after BEGIN by database tests; the caller owns ROLLBACK isolation.

-- Arrange: authenticated admin actor.
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'admin.fixture@stok-akurat.test',
  '',
  '2026-08-04 00:00:00+00',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Admin Fixture"}'::jsonb,
  '2026-08-04 00:00:00+00',
  '2026-08-04 00:00:00+00'
);

-- Arrange: deterministic channels, products, and FEFO batches.
insert into public.channels (id, name, code) values
  ('20000000-0000-4000-8000-000000000001', 'Shopee Fixture', 'SHOPEE_FIXTURE'),
  ('20000000-0000-4000-8000-000000000002', 'TikTok Fixture', 'TIKTOK_FIXTURE');

insert into public.products (id, name, sku, category) values
  ('30000000-0000-4000-8000-000000000001', 'Serum Fixture', 'FIX-SERUM', 'Serum'),
  ('30000000-0000-4000-8000-000000000002', 'Cleanser Fixture', 'FIX-CLEANSER', 'Cleanser');

insert into public.batches (
  id,
  product_id,
  batch_number,
  production_date,
  expiry_date,
  initial_stock,
  current_stock,
  origin
) values
  (
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'FIX-SERUM-EARLY',
    '2026-01-01',
    '2027-01-01',
    0,
    0,
    'maklon'
  ),
  (
    '40000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000002',
    'FIX-CLEANSER-LATE',
    '2026-02-01',
    '2027-06-01',
    0,
    0,
    'maklon'
  );

-- Arrange: deterministic versioned bundle recipe.
insert into public.bundle_recipe (id, name) values
  ('50000000-0000-4000-8000-000000000001', 'Paket Fixture');

insert into public.bundle_recipe_version (id, recipe_id, version_no) values
  (
    '50000000-0000-4000-8000-000000000002',
    '50000000-0000-4000-8000-000000000001',
    1
  );

insert into public.bundle_recipe_line (
  id,
  recipe_version_id,
  product_id,
  quantity
) values
  (
    '50000000-0000-4000-8000-000000000003',
    '50000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000001',
    2
  );

insert into public.bundles (id, name, channel_id) values
  (
    '50000000-0000-4000-8000-000000000004',
    'Paket Fixture',
    '20000000-0000-4000-8000-000000000001'
  );

insert into public.bundle_items (id, bundle_id, product_id, quantity) values
  (
    '50000000-0000-4000-8000-000000000005',
    '50000000-0000-4000-8000-000000000004',
    '30000000-0000-4000-8000-000000000001',
    2
  );

-- Arrange: deterministic direct-product and versioned-bundle orders.
insert into public.orders (id, order_number, channel_id, status, created_by) values
  (
    '60000000-0000-4000-8000-000000000001',
    'FIX-ORDER-SHOPEE',
    '20000000-0000-4000-8000-000000000001',
    'RESERVED',
    '10000000-0000-4000-8000-000000000001'
  ),
  (
    '60000000-0000-4000-8000-000000000002',
    'FIX-ORDER-TIKTOK',
    '20000000-0000-4000-8000-000000000002',
    'RESERVED',
    '10000000-0000-4000-8000-000000000001'
  );

insert into public.order_items (
  id,
  order_id,
  product_id,
  quantity,
  is_bundle,
  bundle_id,
  recipe_version_id
) values
  (
    '60000000-0000-4000-8000-000000000003',
    '60000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    2,
    false,
    null,
    null
  ),
  (
    '60000000-0000-4000-8000-000000000004',
    '60000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000001',
    1,
    true,
    '50000000-0000-4000-8000-000000000004',
    '50000000-0000-4000-8000-000000000002'
  );

-- Act: impersonate the fixture actor using the documented local RLS pattern.
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local role authenticated;
