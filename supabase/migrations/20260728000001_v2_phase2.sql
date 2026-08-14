
-- ============================================================
-- STOK AKURAT — v2 Phase 2: Schema alignment with SRS v2
-- ============================================================
-- Perubahan:
-- 1. source_type enum + column di stock_ledger
-- 2. reference_note, idempotency_key di stock_ledger
-- 3. origin di product_batch
-- 4. is_unverified flag untuk initial_balance
-- 5. stock_balance_summary (cache O(1))
-- 6. claim_loss_record (retur rusak/hilang)
-- 7. event_log (idempotency)
-- 8. bundle_recipe_version (versioning resep)
-- 9. 1 role: Admin (sederhanakan user_roles)
-- ============================================================

-- ---------- 1. Source type enum ----------
create type public.source_type as enum (
  'goods_in_maklon',
  'manual_out',
  'order_fulfillment',
  'order_cancel_reversal',
  'return_resellable',
  'manual_correction',
  'opname_correction',
  'initial_balance'
);

comment on type public.source_type is 'SRS v2 FR-206: jenis sumber entri ledger';

-- ---------- 2. Add columns to stock_ledger ----------
alter table public.stock_ledger
  add column if not exists source_type public.source_type,
  add column if not exists reference_note text,
  add column if not exists idempotency_key text;

-- idempotency_key unique index (nullable, so partial)
create unique index if not exists idx_stock_ledger_idempotency 
  on public.stock_ledger (idempotency_key) 
  where idempotency_key is not null;

comment on column public.stock_ledger.source_type is 'FR-206: jenis sumber pergerakan';
comment on column public.stock_ledger.reference_note is 'FR-202: wajib untuk bonus/promo/sample';
comment on column public.stock_ledger.idempotency_key is 'FR-207: cegah duplikasi event';

-- ---------- 3. origin on batches ----------
alter table public.batches
  add column if not exists origin text not null default 'maklon'
  check (origin in ('maklon', 'retur'));

comment on column public.batches.origin is 'FR-102: asal batch — maklon atau retur';

-- ---------- 4. is_unverified untuk initial_balance ----------
alter table public.stock_ledger
  add column if not exists is_unverified boolean default false;

comment on column public.stock_ledger.is_unverified is 'FR-306: true untuk opening balance sebelum opname pertama';

-- ---------- 5. stock_balance_summary (cache O(1)) ----------
create table if not exists public.stock_balance_summary (
  batch_id uuid not null references public.batches(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  balance_qty integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (batch_id, product_id)
);

grant select on public.stock_balance_summary to authenticated;
grant all on public.stock_balance_summary to service_role;
alter table public.stock_balance_summary enable row level security;
create policy "read stock_balance_summary" on public.stock_balance_summary
  for select to authenticated using (true);
create policy "service manage stock_balance_summary" on public.stock_balance_summary
  for all to service_role using (true) with check (true);

comment on table public.stock_balance_summary is 'FR-208: cache saldo O(1), diverifikasi ulang dari ledger';

-- Trigger: update stock_balance_summary on every ledger insert
create or replace function public.maintain_stock_balance_summary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_id uuid;
  v_balance integer;
begin
  -- Get product_id from batch
  select product_id into v_product_id from public.batches where id = new.batch_id;

  -- Calculate new balance from ledger (source of truth)
  select coalesce(sum(
    case when direction = 'in' then quantity else -quantity end
  ), 0) into v_balance
  from public.stock_ledger
  where batch_id = new.batch_id;

  insert into public.stock_balance_summary (batch_id, product_id, balance_qty, updated_at)
  values (new.batch_id, v_product_id, v_balance, now())
  on conflict (batch_id, product_id)
  do update set balance_qty = v_balance, updated_at = now();

  return new;
end;
$$;

create trigger trg_stock_balance_summary
  after insert on public.stock_ledger
  for each row execute function public.maintain_stock_balance_summary();

-- ---------- 6. claim_loss_record (retur rusak/hilang) ----------
create table if not exists public.claim_loss_record (
  id uuid primary key default gen_random_uuid(),
  return_case_id uuid not null references public.returns(id) on delete cascade,
  type text not null check (type in ('damaged', 'lost_in_transit')),
  claim_status text not null default 'pending'
    check (claim_status in ('pending', 'filed', 'resolved', 'expired')),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  unique (return_case_id, type)
);

grant select, insert, update on public.claim_loss_record to authenticated;
grant all on public.claim_loss_record to service_role;
alter table public.claim_loss_record enable row level security;
create policy "read claim_loss_record" on public.claim_loss_record
  for select to authenticated using (true);
create policy "insert claim_loss_record" on public.claim_loss_record
  for insert to authenticated with check (true);
create policy "update claim_loss_record" on public.claim_loss_record
  for update to authenticated using (true) with check (true);

comment on table public.claim_loss_record is 'FR-504/505: catatan retur rusak/hilang — bukan entri ledger';

-- ---------- 7. event_log (idempotency) ----------
create table if not exists public.event_log (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  idempotency_key text not null unique,
  payload jsonb,
  status text not null default 'processed'
    check (status in ('processed', 'skipped_duplicate', 'error')),
  error_message text,
  created_at timestamptz not null default now()
);

grant select, insert on public.event_log to authenticated;
grant all on public.event_log to service_role;
alter table public.event_log enable row level security;
create policy "read event_log" on public.event_log
  for select to authenticated using (true);
create policy "insert event_log" on public.event_log
  for insert to authenticated with check (true);

comment on table public.event_log is 'FR-410: jejak event masuk, dasar idempotency';

-- ---------- 8. Bundle recipe versioning ----------
create table if not exists public.bundle_recipe (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

grant select, insert, update on public.bundle_recipe to authenticated;
grant all on public.bundle_recipe to service_role;
alter table public.bundle_recipe enable row level security;
create policy "read bundle_recipe" on public.bundle_recipe
  for select to authenticated using (true);
create policy "write bundle_recipe" on public.bundle_recipe
  for all to authenticated using (true) with check (true);

create table if not exists public.bundle_recipe_version (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.bundle_recipe(id) on delete cascade,
  version_no integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (recipe_id, version_no)
);

grant select, insert on public.bundle_recipe_version to authenticated;
grant all on public.bundle_recipe_version to service_role;
alter table public.bundle_recipe_version enable row level security;
create policy "read bundle_recipe_version" on public.bundle_recipe_version
  for select to authenticated using (true);
create policy "write bundle_recipe_version" on public.bundle_recipe_version
  for all to authenticated using (true) with check (true);

create table if not exists public.bundle_recipe_line (
  id uuid primary key default gen_random_uuid(),
  recipe_version_id uuid not null references public.bundle_recipe_version(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity integer not null check (quantity > 0)
);

grant select, insert on public.bundle_recipe_line to authenticated;
grant all on public.bundle_recipe_line to service_role;
alter table public.bundle_recipe_line enable row level security;
create policy "read bundle_recipe_line" on public.bundle_recipe_line
  for select to authenticated using (true);
create policy "write bundle_recipe_line" on public.bundle_recipe_line
  for all to authenticated using (true) with check (true);

-- Add recipe_version_id to order_items
alter table public.order_items
  add column if not exists recipe_version_id uuid references public.bundle_recipe_version(id);

comment on column public.order_items.recipe_version_id is 'FR-407: versi resep saat order dibuat';

-- ---------- 9. Simplify roles — 1 admin only ----------
-- Make all existing users admin
update public.user_roles set role = 'admin' where is_active = true;

-- Alter handle_new_user to always create admin
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  -- Always create as admin (single role)
  insert into public.user_roles (user_id, role) values (new.id, 'admin')
  on conflict (user_id, role) do nothing;
  return new;
end;
$$;

-- Drop role-based RLS policies, replace with simple authenticated checks
do $$
declare
  tbl text;
begin
  for tbl in
    select unnest(array[
      'products', 'batches', 'bundles', 'bundle_items',
      'orders', 'order_items', 'returns',
      'opname_sessions', 'opname_entries',
      'stock_ledger', 'channels', 'movement_reasons', 'movement_types',
      'claim_loss_record', 'event_log', 'bundle_recipe',
      'bundle_recipe_version', 'bundle_recipe_line'
    ])
  loop
    execute format('
      drop policy if exists "staff read %1$s" on %1$s;
      drop policy if exists "staff write %1$s" on %1$s;
      drop policy if exists "staff insert %1$s" on %1$s;
      drop policy if exists "staff update %1$s" on %1$s;
      drop policy if exists "admin delete %1$s" on %1$s;
      drop policy if exists "admin manages %1$s" on %1$s;
      drop policy if exists "auth manage %1$s" on %1$s;
      drop policy if exists "auth insert %1$s" on %1$s;
      drop policy if exists "auth update %1$s" on %1$s;
      drop policy if exists "read %1$s" on %1$s;
      drop policy if exists "read own or elevated profile" on %1$s;
    ', tbl);
  end loop;
end $$;

-- Recreate simple policies: all authenticated users can read/write
-- (single role = admin, no distinction needed)
create policy "authenticated_all" on public.products
  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on public.batches
  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on public.bundles
  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on public.bundle_items
  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on public.orders
  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on public.order_items
  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on public.returns
  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on public.opname_sessions
  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on public.opname_entries
  for all to authenticated using (true) with check (true);
create policy "authenticated_read" on public.stock_ledger
  for select to authenticated using (true);
-- stock_ledger writes only via RPC, not direct insert
create policy "authenticated_all" on public.channels
  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on public.movement_reasons
  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on public.movement_types
  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on public.claim_loss_record
  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on public.event_log
  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on public.bundle_recipe
  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on public.bundle_recipe_version
  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on public.bundle_recipe_line
  for all to authenticated using (true) with check (true);

-- Keep profiles with standard policies
drop policy if exists "read own or elevated profile" on public.profiles;
drop policy if exists "read profiles" on public.profiles;
drop policy if exists "update own profile" on public.profiles;
drop policy if exists "insert own profile" on public.profiles;
create policy "read profiles" on public.profiles
  for select to authenticated using (true);
create policy "update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "insert own profile" on public.profiles
  for insert to authenticated with check (id = auth.uid());
