-- Stok Akurat — Seed master data

-- Deterministic non-login actor for local seed ledger entries.
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
  '00000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'system.seed@stok-akurat.local',
  '',
  '2026-08-04 00:00:00+00',
  '{"provider":"system","providers":[]}'::jsonb,
  '{"display_name":"System Seed"}'::jsonb,
  '2026-08-04 00:00:00+00',
  '2026-08-04 00:00:00+00'
)
on conflict (id) do nothing;

-- Channels
insert into public.channels (name, code, is_active) values
  ('Shopee', 'SHOPEE', true),
  ('TikTok Shop', 'TIKTOK', true),
  ('Offline', 'OFFLINE', true),
  ('Internal', 'INTERNAL', true)
on conflict (code) do nothing;

-- Movement types
insert into public.movement_types (name, label) values
  ('IN', 'Masuk'),
  ('OUT', 'Keluar')
on conflict (name) do nothing;

-- Movement reasons
insert into public.movement_reasons (code, name, direction, is_system) values
  ('maklon_in',      'Penerimaan Maklon',      'in',  true),
  ('initial_stock',  'Saldo Awal',             'in',  true),
  ('return_resalable','Retur Layak Jual',      'in',  true),
  ('cancellation',   'Pembatalan Pesanan',     'in',  true),
  ('opname_plus',    'Opname Plus',            'in',  true),
  ('sale_online',    'Penjualan Online',       'out', true),
  ('manual_out',     'Pengeluaran Manual',     'out', true),
  ('opname_minus',   'Opname Minus',           'out', true),
  ('bonus',          'Bonus / Hadiah',         'out', false),
  ('promo',          'Promo',                  'out', false),
  ('sample',         'Sample',                 'out', false)
on conflict (code) do nothing;

-- Sample products (skincare)
insert into public.products (name, sku, category, low_stock_threshold, critical_stock_threshold) values
  ('Brightening Serum 30ml',  'BR-SER-30',  'Serum',  100, 50),
  ('Retinol Night Cream 50g', 'RT-CRM-50',  'Moisturizer', 80, 30),
  ('Sunscreen SPF50 50ml',    'SS-SPF-50',  'Sunscreen', 200, 80),
  ('Micellar Water 200ml',    'MC-WTR-200', 'Cleanser', 120, 50),
  ('Niacinamide Toner 150ml', 'NC-TON-150', 'Toner', 90, 40),
  ('Vitamin C Booster 15ml',  'VT-BST-15',  'Serum', 60, 25),
  ('Hydra Gel Moisturizer 50g','HY-GEL-50', 'Moisturizer', 100, 40),
  ('AHA BHA Exfoliant 100ml', 'AH-EXF-100', 'Exfoliator', 70, 30),
  ('Sheet Mask Box 10pcs',    'SH-MSK-10',  'Mask', 150, 60),
  ('Lip Sleeping Mask 20g',   'LP-SLP-20',  'Lip Care', 50, 20)
on conflict (sku) do nothing;

-- Sample batches for each product
insert into public.batches (product_id, batch_number, production_date, expiry_date, initial_stock, current_stock, origin)
select
  p.id,
  'BCH-' || substr(p.sku, 1, 2) || '-202607',
  '2026-07-01'::date,
  '2027-07-01'::date,
  500, 0,
  'maklon'
from public.products p
where not exists (select 1 from public.batches b where b.product_id = p.id)
on conflict (product_id, batch_number) do nothing;

-- Insert initial ledger entries for sample batches
-- Uses the deterministic non-login seed actor as recorded_by.
insert into public.stock_ledger (batch_id, movement_type_id, reason_id, quantity, direction, stock_before, stock_after, source_type, notes, recorded_by)
select
  b.id,
  mt.id,
  mr.id,
  b.initial_stock,
  'in',
  0,
  b.initial_stock,
  'initial_balance',
  'Seed: saldo awal batch ' || b.batch_number,
  '00000000-0000-4000-8000-000000000001'::uuid
from public.batches b
cross join (select id from public.movement_types where name = 'IN') mt
cross join (select id from public.movement_reasons where code = 'initial_stock') mr
where not exists (select 1 from public.stock_ledger l where l.batch_id = b.id and l.source_type = 'initial_balance');
