
-- ============================================================
-- STOK AKURAT — Full schema, RLS, and business logic functions
-- ============================================================

-- ---------- Roles ----------
create type public.app_role as enum ('admin','manager','operator');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role and is_active = true
  )
$$;

create or replace function public.current_user_role()
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.user_roles where user_id = auth.uid() and is_active = true
  order by case role when 'admin' then 1 when 'manager' then 2 else 3 end limit 1
$$;

create policy "authenticated read own roles" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "admin manages roles" on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- ---------- Profiles (display name) ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "read profiles" on public.profiles for select to authenticated using (true);
create policy "update own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "insert own profile" on public.profiles for insert to authenticated
  with check (id = auth.uid());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  -- First user becomes admin; others default to operator
  if not exists (select 1 from public.user_roles) then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'operator')
    on conflict (user_id, role) do nothing;
  end if;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Master data ----------
create table public.channels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.channels to authenticated;
grant all on public.channels to service_role;
alter table public.channels enable row level security;
create policy "read channels" on public.channels for select to authenticated using (true);
create policy "admin manages channels" on public.channels for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.movement_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (name in ('IN','OUT')),
  label text not null
);
grant select on public.movement_types to authenticated;
grant all on public.movement_types to service_role;
alter table public.movement_types enable row level security;
create policy "read movement_types" on public.movement_types for select to authenticated using (true);

create table public.movement_reasons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  direction text not null check (direction in ('in','out')),
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.movement_reasons to authenticated;
grant all on public.movement_reasons to service_role;
alter table public.movement_reasons enable row level security;
create policy "read reasons" on public.movement_reasons for select to authenticated using (true);
create policy "admin manages reasons" on public.movement_reasons for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sku text unique,
  category text,
  description text,
  low_stock_threshold integer not null default 100,
  critical_stock_threshold integer not null default 50,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.products to authenticated;
grant all on public.products to service_role;
alter table public.products enable row level security;
create policy "read products" on public.products for select to authenticated using (true);
create policy "admin manages products" on public.products for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.batches (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  batch_number text not null,
  production_date date not null,
  expiry_date date not null,
  initial_stock integer not null default 0 check (initial_stock >= 0),
  current_stock integer not null default 0 check (current_stock >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, batch_number)
);
create index on public.batches (product_id, expiry_date);
grant select on public.batches to authenticated;
grant all on public.batches to service_role;
alter table public.batches enable row level security;
create policy "read batches" on public.batches for select to authenticated using (true);
create policy "admin manages batches" on public.batches for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.bundles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  marketplace_listing text,
  channel_id uuid references public.channels(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.bundles to authenticated;
grant all on public.bundles to service_role;
alter table public.bundles enable row level security;
create policy "read bundles" on public.bundles for select to authenticated using (true);
create policy "admin manages bundles" on public.bundles for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.bundle_items (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references public.bundles(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity integer not null check (quantity > 0)
);
grant select on public.bundle_items to authenticated;
grant all on public.bundle_items to service_role;
alter table public.bundle_items enable row level security;
create policy "read bundle_items" on public.bundle_items for select to authenticated using (true);
create policy "admin manages bundle_items" on public.bundle_items for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- ---------- Orders & Returns ----------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  channel_id uuid not null references public.channels(id),
  status text not null check (status in ('RESERVED','SHIPPED','CANCELLED','RETURNED')) default 'RESERVED',
  created_at timestamptz not null default now(),
  shipped_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_by uuid references auth.users(id)
);
grant select, insert, update on public.orders to authenticated;
grant all on public.orders to service_role;
alter table public.orders enable row level security;
create policy "read orders" on public.orders for select to authenticated using (true);
create policy "auth insert orders" on public.orders for insert to authenticated with check (true);
create policy "auth update orders" on public.orders for update to authenticated using (true);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  batch_id uuid references public.batches(id),
  quantity integer not null check (quantity > 0),
  is_bundle boolean not null default false,
  bundle_id uuid references public.bundles(id)
);
grant select, insert, update on public.order_items to authenticated;
grant all on public.order_items to service_role;
alter table public.order_items enable row level security;
create policy "read order_items" on public.order_items for select to authenticated using (true);
create policy "auth manage order_items" on public.order_items for all to authenticated using (true) with check (true);

create table public.returns (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id),
  return_date date not null default current_date,
  condition text not null default 'PENDING_INSPECTION'
    check (condition in ('PENDING_INSPECTION','RESALABLE','DAMAGED','LOST')),
  inspected_at timestamptz,
  inspected_by uuid references auth.users(id),
  claim_deadline date,
  claim_status text not null default 'NONE'
    check (claim_status in ('NONE','PENDING','FILED','RESOLVED','EXPIRED')),
  notes text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.returns to authenticated;
grant all on public.returns to service_role;
alter table public.returns enable row level security;
create policy "read returns" on public.returns for select to authenticated using (true);
create policy "auth manage returns" on public.returns for all to authenticated using (true) with check (true);

-- ---------- Opname ----------
create table public.opname_sessions (
  id uuid primary key default gen_random_uuid(),
  session_name text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','COMPLETED','CANCELLED')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  notes text,
  created_by uuid not null references auth.users(id)
);
grant select, insert, update on public.opname_sessions to authenticated;
grant all on public.opname_sessions to service_role;
alter table public.opname_sessions enable row level security;
create policy "read opname_sessions" on public.opname_sessions for select to authenticated using (true);
create policy "auth manage opname_sessions" on public.opname_sessions for all to authenticated
  using (public.has_role(auth.uid(),'manager') or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'operator'))
  with check (public.has_role(auth.uid(),'manager') or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'operator'));

create table public.opname_entries (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.opname_sessions(id) on delete cascade,
  batch_id uuid not null references public.batches(id),
  system_stock integer not null,
  physical_count integer not null,
  discrepancy integer generated always as (physical_count - system_stock) stored,
  correction_applied boolean not null default false,
  counted_by uuid not null references auth.users(id),
  counted_at timestamptz not null default now(),
  unique (session_id, batch_id)
);
grant select, insert, update on public.opname_entries to authenticated;
grant all on public.opname_entries to service_role;
alter table public.opname_entries enable row level security;
create policy "read opname_entries" on public.opname_entries for select to authenticated using (true);
create policy "auth manage opname_entries" on public.opname_entries for all to authenticated using (true) with check (true);

-- ---------- STOCK LEDGER (append-only) ----------
create table public.stock_ledger (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches(id),
  movement_type_id uuid not null references public.movement_types(id),
  reason_id uuid not null references public.movement_reasons(id),
  channel_id uuid references public.channels(id),
  quantity integer not null check (quantity > 0),
  direction text not null check (direction in ('in','out')),
  stock_before integer not null,
  stock_after integer not null,
  order_id uuid references public.orders(id),
  return_id uuid references public.returns(id),
  opname_session_id uuid references public.opname_sessions(id),
  notes text,
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint stock_after_matches check (
    stock_after = stock_before + (case when direction = 'in' then quantity else -quantity end)
  )
);
create index on public.stock_ledger (batch_id, created_at);
create index on public.stock_ledger (created_at desc);
create index on public.stock_ledger (order_id);
create index on public.stock_ledger (return_id);
create index on public.stock_ledger (opname_session_id);

-- Immutability: only SELECT allowed to authenticated; no direct INSERT (must go via RPC)
grant select on public.stock_ledger to authenticated;
grant all on public.stock_ledger to service_role;
alter table public.stock_ledger enable row level security;
create policy "read ledger" on public.stock_ledger for select to authenticated using (true);

-- Hard trigger enforcement
create or replace function public.forbid_ledger_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'stock_ledger is append-only: % not allowed', TG_OP;
end;
$$;
create trigger trg_forbid_ledger_update before update on public.stock_ledger
  for each row execute function public.forbid_ledger_mutation();
create trigger trg_forbid_ledger_delete before delete on public.stock_ledger
  for each row execute function public.forbid_ledger_mutation();

-- ============================================================
-- CORE RPCs (SECURITY DEFINER, atomic)
-- ============================================================

-- allocate_batch_fefo: returns table of (batch_id, qty) split by FEFO
create or replace function public.allocate_batch_fefo(p_product_id uuid, p_quantity integer)
returns table(batch_id uuid, qty integer)
language plpgsql security definer set search_path = public as $$
declare
  r record;
  remaining integer := p_quantity;
  take integer;
begin
  if p_quantity <= 0 then raise exception 'Quantity must be > 0'; end if;
  for r in
    select id, current_stock from public.batches
    where product_id = p_product_id and is_active = true and current_stock > 0
    order by expiry_date asc, created_at asc
  loop
    if remaining <= 0 then exit; end if;
    take := least(r.current_stock, remaining);
    batch_id := r.id;
    qty := take;
    return next;
    remaining := remaining - take;
  end loop;
  if remaining > 0 then
    raise exception 'Insufficient stock for product %: short by %', p_product_id, remaining;
  end if;
end;
$$;

-- record_stock_movement: THE ONLY WAY to change batches.current_stock
create or replace function public.record_stock_movement(
  p_batch_id uuid,
  p_movement_type text,           -- 'IN' or 'OUT'
  p_reason_code text,
  p_channel_code text default null,
  p_quantity integer default 0,
  p_notes text default null,
  p_order_id uuid default null,
  p_return_id uuid default null,
  p_opname_session_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_type_id uuid;
  v_reason_id uuid;
  v_channel_id uuid;
  v_direction text;
  v_before integer;
  v_after integer;
  v_ledger_id uuid;
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if p_quantity <= 0 then raise exception 'Quantity must be > 0'; end if;

  select id into v_type_id from public.movement_types where name = p_movement_type;
  if v_type_id is null then raise exception 'Unknown movement type %', p_movement_type; end if;

  select id, direction into v_reason_id, v_direction from public.movement_reasons where code = p_reason_code;
  if v_reason_id is null then raise exception 'Unknown reason code %', p_reason_code; end if;
  if (p_movement_type = 'IN' and v_direction <> 'in') or (p_movement_type = 'OUT' and v_direction <> 'out') then
    raise exception 'Reason % does not match movement type %', p_reason_code, p_movement_type;
  end if;

  if p_channel_code is not null then
    select id into v_channel_id from public.channels where code = p_channel_code;
  end if;

  -- Lock the batch row
  select current_stock into v_before from public.batches where id = p_batch_id for update;
  if v_before is null then raise exception 'Batch % not found', p_batch_id; end if;

  if v_direction = 'out' and p_quantity > v_before then
    raise exception 'Insufficient stock in batch %: have %, need %', p_batch_id, v_before, p_quantity;
  end if;

  v_after := v_before + (case when v_direction = 'in' then p_quantity else -p_quantity end);

  insert into public.stock_ledger (
    batch_id, movement_type_id, reason_id, channel_id, quantity, direction,
    stock_before, stock_after, order_id, return_id, opname_session_id, notes, recorded_by
  ) values (
    p_batch_id, v_type_id, v_reason_id, v_channel_id, p_quantity, v_direction,
    v_before, v_after, p_order_id, p_return_id, p_opname_session_id, p_notes, v_user
  ) returning id into v_ledger_id;

  update public.batches set current_stock = v_after, updated_at = now() where id = p_batch_id;

  return v_ledger_id;
end;
$$;

-- process_shipment: expand bundles, FEFO-allocate, write ledger, mark SHIPPED
create or replace function public.process_shipment(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_channel_code text;
  v_status text;
  oi record;
  bi record;
  alloc record;
  need integer;
begin
  select o.status, c.code into v_status, v_channel_code
  from public.orders o join public.channels c on c.id = o.channel_id
  where o.id = p_order_id for update;
  if v_status is null then raise exception 'Order not found'; end if;
  if v_status <> 'RESERVED' then raise exception 'Order not in RESERVED state (currently %)', v_status; end if;

  for oi in select * from public.order_items where order_id = p_order_id loop
    if oi.is_bundle and oi.bundle_id is not null then
      for bi in select product_id, quantity from public.bundle_items where bundle_id = oi.bundle_id loop
        need := bi.quantity * oi.quantity;
        for alloc in select * from public.allocate_batch_fefo(bi.product_id, need) loop
          perform public.record_stock_movement(
            alloc.batch_id, 'OUT', 'sale_online', v_channel_code, alloc.qty,
            'Shipment for order '||p_order_id, p_order_id, null, null
          );
        end loop;
      end loop;
    else
      for alloc in select * from public.allocate_batch_fefo(oi.product_id, oi.quantity) loop
        perform public.record_stock_movement(
          alloc.batch_id, 'OUT', 'sale_online', v_channel_code, alloc.qty,
          'Shipment for order '||p_order_id, p_order_id, null, null
        );
        -- Record last-allocated batch on the order_item for traceability
        update public.order_items set batch_id = alloc.batch_id where id = oi.id;
      end loop;
    end if;
  end loop;

  update public.orders set status='SHIPPED', shipped_at = now() where id = p_order_id;
end;
$$;

-- process_cancellation: no ledger if RESERVED, restore if SHIPPED
create or replace function public.process_cancellation(p_order_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_channel_code text;
  led record;
begin
  select o.status, c.code into v_status, v_channel_code
  from public.orders o join public.channels c on c.id = o.channel_id
  where o.id = p_order_id for update;
  if v_status is null then raise exception 'Order not found'; end if;

  if v_status = 'RESERVED' then
    update public.orders set status='CANCELLED', cancelled_at=now(), cancellation_reason=p_reason
    where id = p_order_id;
    return;
  end if;

  if v_status <> 'SHIPPED' then
    raise exception 'Cannot cancel order in status %', v_status;
  end if;

  -- Reverse each OUT ledger entry attached to this order, back into the same batch
  for led in
    select batch_id, quantity from public.stock_ledger
    where order_id = p_order_id and direction = 'out'
  loop
    perform public.record_stock_movement(
      led.batch_id, 'IN', 'cancellation', v_channel_code, led.quantity,
      'Cancellation restore for order '||p_order_id, p_order_id, null, null
    );
  end loop;

  update public.orders set status='CANCELLED', cancelled_at=now(), cancellation_reason=p_reason
  where id = p_order_id;
end;
$$;

-- process_return: RESALABLE adds stock back to original batches; DAMAGED/LOST do not
create or replace function public.process_return(
  p_return_id uuid,
  p_condition text,
  p_notes text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_order_id uuid;
  v_channel_code text;
  v_return_date date;
  v_deadline date;
  led record;
begin
  if p_condition not in ('RESALABLE','DAMAGED','LOST') then
    raise exception 'Invalid condition %', p_condition;
  end if;

  select r.order_id, c.code, r.return_date into v_order_id, v_channel_code, v_return_date
  from public.returns r
  join public.orders o on o.id = r.order_id
  join public.channels c on c.id = o.channel_id
  where r.id = p_return_id for update;
  if v_order_id is null then raise exception 'Return not found'; end if;

  if p_condition = 'RESALABLE' then
    for led in
      select batch_id, quantity from public.stock_ledger
      where order_id = v_order_id and direction = 'out'
    loop
      perform public.record_stock_movement(
        led.batch_id, 'IN', 'return_resalable', v_channel_code, led.quantity,
        'Return resalable for order '||v_order_id, v_order_id, p_return_id, null
      );
    end loop;
  end if;

  -- Claim deadline only for TikTok LOST
  if p_condition = 'LOST' and v_channel_code = 'TIKTOK' then
    v_deadline := v_return_date + interval '40 days';
    update public.returns
      set condition=p_condition, inspected_at=now(), inspected_by=auth.uid(),
          claim_deadline=v_deadline, claim_status='PENDING', notes=coalesce(p_notes, notes)
      where id=p_return_id;
  else
    update public.returns
      set condition=p_condition, inspected_at=now(), inspected_by=auth.uid(), notes=coalesce(p_notes, notes)
      where id=p_return_id;
  end if;

  update public.orders set status='RETURNED' where id=v_order_id;
end;
$$;

-- daily_consistency_check: compare batches.current_stock vs recomputed from ledger
create or replace function public.daily_consistency_check()
returns table(
  batch_id uuid,
  product_name text,
  batch_number text,
  expected_stock integer,
  recorded_stock integer,
  diff integer
)
language sql stable security definer set search_path = public as $$
  with recomputed as (
    select
      b.id as batch_id,
      b.initial_stock + coalesce(sum(case when l.direction='in' then l.quantity when l.direction='out' then -l.quantity end),0) as expected
    from public.batches b
    left join public.stock_ledger l on l.batch_id = b.id
    group by b.id, b.initial_stock
  )
  select b.id, p.name, b.batch_number, r.expected::int, b.current_stock, (b.current_stock - r.expected)::int
  from public.batches b
  join public.products p on p.id = b.product_id
  join recomputed r on r.batch_id = b.id
  where b.current_stock <> r.expected;
$$;

-- apply_opname_correction
create or replace function public.apply_opname_correction(p_entry_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_batch uuid; v_disc integer; v_applied boolean; v_session uuid;
begin
  select batch_id, discrepancy, correction_applied, session_id
    into v_batch, v_disc, v_applied, v_session
    from public.opname_entries where id = p_entry_id for update;
  if v_batch is null then raise exception 'Opname entry not found'; end if;
  if v_applied then raise exception 'Correction already applied'; end if;

  if v_disc > 0 then
    perform public.record_stock_movement(v_batch, 'IN', 'opname_plus', null, v_disc, 'Opname correction (+)', null, null, v_session);
  elsif v_disc < 0 then
    perform public.record_stock_movement(v_batch, 'OUT', 'opname_minus', null, -v_disc, 'Opname correction (-)', null, null, v_session);
  end if;

  update public.opname_entries set correction_applied = true where id = p_entry_id;
end;
$$;

-- Grants for RPCs
grant execute on function public.allocate_batch_fefo(uuid, integer) to authenticated;
grant execute on function public.record_stock_movement(uuid, text, text, text, integer, text, uuid, uuid, uuid) to authenticated;
grant execute on function public.process_shipment(uuid) to authenticated;
grant execute on function public.process_cancellation(uuid, text) to authenticated;
grant execute on function public.process_return(uuid, text, text) to authenticated;
grant execute on function public.daily_consistency_check() to authenticated;
grant execute on function public.apply_opname_correction(uuid) to authenticated;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.current_user_role() to authenticated;
