-- ============================================================
-- STOK AKURAT — Aturan Promo & Reference Data CRUD
-- ============================================================
-- 1. Seed Tokopedia & Lazada channels
-- 2. promo_rules, promo_rule_conditions, promo_rule_freebies,
--    promo_rule_channels
-- ============================================================

-- ---------- 1. Seed additional channels ----------
insert into public.channels (name, code, is_active) values
  ('Tokopedia', 'TOKOPEDIA', true),
  ('Lazada', 'LAZADA', true)
on conflict (code) do nothing;

-- ---------- 2. Promo Rules ----------
create table if not exists public.promo_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date timestamptz not null,
  end_date timestamptz not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promo_rules_end_after_start check (end_date > start_date)
);

comment on table public.promo_rules is 'Aturan promo: definisi campaign barang gratis';
comment on column public.promo_rules.name is 'Nama promo, misal "Beli 1 Sabun Free 3"';
comment on column public.promo_rules.start_date is 'Periode mulai promo';
comment on column public.promo_rules.end_date is 'Periode selesai promo';
comment on column public.promo_rules.is_active is 'Soft-delete / nonaktif manual';

grant select on public.promo_rules to authenticated;
grant insert on public.promo_rules to authenticated;
grant update on public.promo_rules to authenticated;
grant delete on public.promo_rules to authenticated;
grant all on public.promo_rules to service_role;

alter table public.promo_rules enable row level security;
create policy "authenticated_all" on public.promo_rules
  for all to authenticated using (true) with check (true);

-- ---------- 3. Promo Rule Conditions (syarat beli) ----------
create table if not exists public.promo_rule_conditions (
  id uuid primary key default gen_random_uuid(),
  promo_rule_id uuid not null references public.promo_rules(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity integer not null default 1 check (quantity >= 1)
);

comment on table public.promo_rule_conditions is 'Syarat beli: produk yang harus dibeli customer (logika AND)';
comment on column public.promo_rule_conditions.quantity is 'Jumlah wajib beli produk ini';

grant select on public.promo_rule_conditions to authenticated;
grant insert on public.promo_rule_conditions to authenticated;
grant update on public.promo_rule_conditions to authenticated;
grant delete on public.promo_rule_conditions to authenticated;
grant all on public.promo_rule_conditions to service_role;

alter table public.promo_rule_conditions enable row level security;
create policy "authenticated_all" on public.promo_rule_conditions
  for all to authenticated using (true) with check (true);

-- ---------- 4. Promo Rule Freebies (barang gratis) ----------
create table if not exists public.promo_rule_freebies (
  id uuid primary key default gen_random_uuid(),
  promo_rule_id uuid not null references public.promo_rules(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity integer not null default 1 check (quantity >= 1)
);

comment on table public.promo_rule_freebies is 'Barang gratis yang diberikan dalam promo';
comment on column public.promo_rule_freebies.quantity is 'Jumlah gratis per produk';

grant select on public.promo_rule_freebies to authenticated;
grant insert on public.promo_rule_freebies to authenticated;
grant update on public.promo_rule_freebies to authenticated;
grant delete on public.promo_rule_freebies to authenticated;
grant all on public.promo_rule_freebies to service_role;

alter table public.promo_rule_freebies enable row level security;
create policy "authenticated_all" on public.promo_rule_freebies
  for all to authenticated using (true) with check (true);

-- ---------- 5. Promo Rule Channels (pivot) ----------
create table if not exists public.promo_rule_channels (
  id uuid primary key default gen_random_uuid(),
  promo_rule_id uuid not null references public.promo_rules(id) on delete cascade,
  channel_code text not null references public.channels(code)
);

comment on table public.promo_rule_channels is 'Channel marketplace tempat promo berlaku';

grant select on public.promo_rule_channels to authenticated;
grant insert on public.promo_rule_channels to authenticated;
grant update on public.promo_rule_channels to authenticated;
grant delete on public.promo_rule_channels to authenticated;
grant all on public.promo_rule_channels to service_role;

alter table public.promo_rule_channels enable row level security;
create policy "authenticated_all" on public.promo_rule_channels
  for all to authenticated using (true) with check (true);

-- ---------- 6. Indexes ----------
create index if not exists idx_promo_rule_conditions_rule
  on public.promo_rule_conditions (promo_rule_id);
create index if not exists idx_promo_rule_freebies_rule
  on public.promo_rule_freebies (promo_rule_id);
create index if not exists idx_promo_rule_channels_rule
  on public.promo_rule_channels (promo_rule_id);
create index if not exists idx_promo_rules_active
  on public.promo_rules (is_active) where is_active = true;
