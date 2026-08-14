-- Forward-only Phase 2 stock schema and security foundation.
-- Historical tables and migrations remain intact; unsafe legacy paths are disabled.

-- Fixed Phase 2 reference values. Historical values remain readable but inactive.
insert into public.channels (name, code, is_active)
values
  ('Shopee', 'SHOPEE', true),
  ('TikTok Shop', 'TIKTOK', true),
  ('Offline', 'OFFLINE', true),
  ('Internal', 'INTERNAL', true)
on conflict (code) do update
set is_active = excluded.is_active;

update public.channels
set is_active = false
where upper(public.channels.code) not in ('SHOPEE', 'TIKTOK', 'OFFLINE', 'INTERNAL');

insert into public.movement_reasons (code, name, direction, is_system, is_active)
values
  ('offline', 'Penjualan Offline', 'out', false, true),
  ('damaged', 'Barang Rusak', 'out', false, true),
  ('expired', 'Barang Kedaluwarsa', 'out', false, true)
on conflict (code) do update
set is_active = excluded.is_active;

update public.user_roles
set role = 'admin'::public.app_role
where role <> 'admin'::public.app_role;

alter table public.user_roles
  add constraint user_roles_phase2_admin_only
  check (role = 'admin'::public.app_role) not valid;

alter table public.user_roles
  validate constraint user_roles_phase2_admin_only;

update public.promo_rules
set is_active = false
where is_active;

-- Ledger audit compatibility and explicit correction linkage.
alter table public.stock_ledger
  add column created_by uuid references auth.users(id),
  add column source_ref_id uuid references public.stock_ledger(id) on delete restrict;

alter table public.stock_ledger
  add constraint stock_ledger_correction_source_required
  check (
    source_type <> 'manual_correction'::public.source_type
    or source_ref_id is not null
  ) not valid;

create index stock_ledger_source_ref_idx
  on public.stock_ledger (source_ref_id)
  where source_ref_id is not null;

-- Idempotency claims retain enough metadata to compare retries and return prior results.
alter table public.event_log
  add column payload_fingerprint text,
  add column result jsonb,
  add column channel text,
  add column external_reference text,
  add column occurred_at timestamptz,
  add column processed_at timestamptz;

alter table public.event_log
  add constraint event_log_payload_fingerprint_format
  check (
    payload_fingerprint is null
    or payload_fingerprint ~ '^[0-9a-f]{64}$'
  ) not valid,
  add constraint event_log_channel_fixed
  check (
    channel is null
    or channel in ('shopee', 'tiktok')
  ) not valid;

create index event_log_external_reference_idx
  on public.event_log (external_reference, occurred_at, id)
  where external_reference is not null;

-- Workflow state required by the event engine without replacing deployed tables.
alter table public.orders
  drop constraint if exists orders_status_check;

alter table public.orders
  add column last_event_at timestamptz,
  add constraint orders_phase2_status_check
  check (
    status in (
      'UNPAID', 'PENDING', 'RESERVED', 'PROCESSING', 'SHIPPED',
      'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'RETURNED', 'MANUAL_REVIEW'
    )
  );

alter table public.order_items
  add column external_line_reference text,
  add column quantity_cancelled integer not null default 0,
  add column component_snapshot jsonb,
  add column requires_manual_review boolean not null default false,
  add column manual_review_reason text,
  add constraint order_items_quantity_cancelled_bounds
  check (quantity_cancelled >= 0 and quantity_cancelled <= quantity);

create unique index order_items_external_line_reference_key
  on public.order_items (order_id, external_line_reference)
  where external_line_reference is not null;

-- Every fulfillment split is immutable and identifies its exact component and batch.
create table public.fulfillment_allocations (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  component_product_id uuid not null references public.products(id) on delete restrict,
  batch_id uuid not null references public.batches(id) on delete restrict,
  ledger_id uuid not null references public.stock_ledger(id) on delete restrict,
  event_id uuid references public.event_log(id) on delete restrict,
  quantity integer not null,
  created_at timestamptz not null default now(),
  constraint fulfillment_allocations_quantity_positive check (quantity > 0),
  constraint fulfillment_allocations_ledger_key unique (ledger_id)
);

create index fulfillment_allocations_order_item_idx
  on public.fulfillment_allocations (order_item_id, component_product_id, created_at, id);
create index fulfillment_allocations_batch_idx
  on public.fulfillment_allocations (batch_id, created_at, id);
create index fulfillment_allocations_event_idx
  on public.fulfillment_allocations (event_id)
  where event_id is not null;

-- Partial returns are recorded per immutable fulfilled component quantity.
alter table public.returns
  drop constraint if exists returns_order_id_key;

alter table public.returns
  add column external_reference text,
  add column reported_at timestamptz,
  add column event_id uuid references public.event_log(id) on delete restrict;

update public.returns
set reported_at = return_date::timestamptz
where reported_at is null;

alter table public.returns
  alter column reported_at set default now(),
  alter column reported_at set not null,
  add constraint returns_external_reference_key unique (external_reference);

create index returns_order_reported_idx
  on public.returns (order_id, reported_at, id);

create table public.return_lines (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.returns(id) on delete restrict,
  fulfillment_allocation_id uuid not null references public.fulfillment_allocations(id) on delete restrict,
  quantity integer not null,
  condition text,
  inspected_at timestamptz,
  inspected_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint return_lines_quantity_positive check (quantity > 0),
  constraint return_lines_condition_check check (
    condition is null
    or condition in ('resellable', 'damaged', 'lost_in_transit')
  ),
  constraint return_lines_return_allocation_key unique (return_id, fulfillment_allocation_id)
);

create index return_lines_allocation_idx
  on public.return_lines (fulfillment_allocation_id, created_at, id);

alter table public.claim_loss_record
  add column return_line_id uuid references public.return_lines(id) on delete restrict,
  add column quantity integer;

alter table public.claim_loss_record
  add constraint claim_loss_record_quantity_positive
  check (quantity is null or quantity > 0) not valid;

create unique index claim_loss_record_return_line_key
  on public.claim_loss_record (return_line_id)
  where return_line_id is not null;

-- Stocktake snapshots and opening-balance verification remain separate from ledger history.
alter table public.opname_sessions
  add column completed_by uuid references auth.users(id);

create table public.opening_balance_verifications (
  id uuid primary key default gen_random_uuid(),
  initial_ledger_id uuid not null references public.stock_ledger(id) on delete restrict,
  opname_session_id uuid not null references public.opname_sessions(id) on delete restrict,
  verified_at timestamptz not null default now(),
  verified_by uuid not null references auth.users(id),
  constraint opening_balance_verifications_initial_ledger_key unique (initial_ledger_id),
  constraint opening_balance_verifications_session_ledger_key
    unique (opname_session_id, initial_ledger_id)
);

create index opening_balance_verifications_session_idx
  on public.opening_balance_verifications (opname_session_id, verified_at, id);

-- Replace full ledger rescans with an atomic signed delta in the ledger transaction.
drop trigger if exists trg_stock_balance_summary on public.stock_ledger;

create or replace function public.maintain_stock_balance_summary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product_id uuid;
  v_delta integer;
begin
  select public.batches.product_id
  into v_product_id
  from public.batches
  where public.batches.id = new.batch_id;

  if v_product_id is null then
    raise exception 'Batch % not found', new.batch_id;
  end if;

  v_delta := case when new.direction = 'in' then new.quantity else -new.quantity end;

  insert into public.stock_balance_summary (
    batch_id,
    product_id,
    balance_qty,
    updated_at
  )
  values (new.batch_id, v_product_id, 0, statement_timestamp())
  on conflict (batch_id, product_id) do nothing;

  update public.stock_balance_summary
  set balance_qty = public.stock_balance_summary.balance_qty + v_delta,
      updated_at = statement_timestamp()
  where public.stock_balance_summary.batch_id = new.batch_id
    and public.stock_balance_summary.product_id = v_product_id;

  return new;
end;
$$;

revoke all on function public.maintain_stock_balance_summary() from public, anon, authenticated, service_role;

truncate table public.stock_balance_summary;

insert into public.stock_balance_summary (batch_id, product_id, balance_qty, updated_at)
select
  public.batches.id,
  public.batches.product_id,
  coalesce(sum(
    case
      when public.stock_ledger.direction = 'in' then public.stock_ledger.quantity
      else -public.stock_ledger.quantity
    end
  ), 0)::integer,
  statement_timestamp()
from public.batches
left join public.stock_ledger on public.stock_ledger.batch_id = public.batches.id
group by public.batches.id, public.batches.product_id;

alter table public.stock_balance_summary
  add constraint stock_balance_summary_nonnegative check (balance_qty >= 0);

create trigger trg_stock_balance_summary
after insert on public.stock_ledger
for each row execute function public.maintain_stock_balance_summary();

-- batches.current_stock is retained only for forward compatibility and fixed at zero.
update public.batches
set current_stock = 0
where current_stock <> 0;

alter table public.batches
  alter column current_stock set default 0,
  add constraint batches_current_stock_deprecated check (current_stock = 0);

create or replace function public.forbid_batch_current_stock_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.current_stock is distinct from old.current_stock then
    raise exception 'batches.current_stock is deprecated; write stock_ledger instead';
  end if;
  return new;
end;
$$;

revoke all on function public.forbid_batch_current_stock_change() from public, anon, authenticated, service_role;

create trigger trg_forbid_batch_current_stock_change
before update of current_stock on public.batches
for each row execute function public.forbid_batch_current_stock_change();

-- Ledger insert is restricted to owner-executed migrations and hardened SECURITY DEFINER RPCs.
create or replace function public.guard_stock_ledger_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_owner name;
  v_reason_code text;
begin
  select pg_catalog.pg_get_userbyid(pg_catalog.pg_class.relowner)
  into v_owner
  from pg_catalog.pg_class
  join pg_catalog.pg_namespace
    on pg_catalog.pg_namespace.oid = pg_catalog.pg_class.relnamespace
  where pg_catalog.pg_namespace.nspname = 'public'
    and pg_catalog.pg_class.relname = 'stock_ledger';

  if current_user <> v_owner then
    raise exception 'stock_ledger INSERT is allowed only through approved stock RPCs';
  end if;

  if new.created_by is not null
     and new.recorded_by is not null
     and new.created_by <> new.recorded_by then
    raise exception 'stock_ledger actor columns must match';
  end if;

  new.created_by := coalesce(new.created_by, new.recorded_by);
  new.recorded_by := coalesce(new.recorded_by, new.created_by);

  if new.created_by is null then
    raise exception 'stock_ledger created_by is required';
  end if;

  if new.source_type is null then
    raise exception 'stock_ledger source_type is required';
  end if;

  if new.source_type = 'manual_correction'::public.source_type
     and new.source_ref_id is null then
    raise exception 'manual correction requires source_ref_id';
  end if;

  select lower(public.movement_reasons.code)
  into v_reason_code
  from public.movement_reasons
  where public.movement_reasons.id = new.reason_id;

  if v_reason_code in ('bonus', 'promo', 'sample')
     and nullif(btrim(new.reference_note), '') is null then
    raise exception 'reference_note is required for reason %', v_reason_code;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_stock_ledger_insert() from public, anon, authenticated, service_role;

create trigger trg_guard_stock_ledger_insert
before insert on public.stock_ledger
for each row execute function public.guard_stock_ledger_insert();

create or replace function public.forbid_ledger_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'stock_ledger is append-only: % not allowed', tg_op;
end;
$$;

revoke all on function public.forbid_ledger_mutation() from public, anon, authenticated, service_role;

drop trigger if exists trg_forbid_ledger_update on public.stock_ledger;
drop trigger if exists trg_forbid_ledger_delete on public.stock_ledger;

create trigger trg_forbid_ledger_update
before update on public.stock_ledger
for each row execute function public.forbid_ledger_mutation();

create trigger trg_forbid_ledger_delete
before delete on public.stock_ledger
for each row execute function public.forbid_ledger_mutation();

create trigger trg_forbid_ledger_truncate
before truncate on public.stock_ledger
for each statement execute function public.forbid_ledger_mutation();

create or replace function public.forbid_immutable_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is immutable: % not allowed', tg_table_name, tg_op;
end;
$$;

revoke all on function public.forbid_immutable_audit_mutation() from public, anon, authenticated, service_role;

create trigger trg_forbid_fulfillment_allocations_update
before update on public.fulfillment_allocations
for each row execute function public.forbid_immutable_audit_mutation();
create trigger trg_forbid_fulfillment_allocations_delete
before delete on public.fulfillment_allocations
for each row execute function public.forbid_immutable_audit_mutation();
create trigger trg_forbid_fulfillment_allocations_truncate
before truncate on public.fulfillment_allocations
for each statement execute function public.forbid_immutable_audit_mutation();

create trigger trg_forbid_opening_verifications_update
before update on public.opening_balance_verifications
for each row execute function public.forbid_immutable_audit_mutation();
create trigger trg_forbid_opening_verifications_delete
before delete on public.opening_balance_verifications
for each row execute function public.forbid_immutable_audit_mutation();
create trigger trg_forbid_opening_verifications_truncate
before truncate on public.opening_balance_verifications
for each statement execute function public.forbid_immutable_audit_mutation();

-- Disable direct workflow writes; authenticated callers receive read-only table access.
do $$
declare
  v_table text;
  v_policy record;
begin
  foreach v_table in array array[
    'user_roles',
    'channels',
    'movement_types',
    'movement_reasons',
    'batches',
    'orders',
    'order_items',
    'returns',
    'opname_sessions',
    'opname_entries',
    'stock_ledger',
    'stock_balance_summary',
    'claim_loss_record',
    'event_log',
    'fulfillment_allocations',
    'return_lines',
    'opening_balance_verifications',
    'promo_rules',
    'promo_rule_conditions',
    'promo_rule_freebies',
    'promo_rule_channels'
  ]
  loop
    execute format(
      'revoke all on table public.%I from public, anon, authenticated, service_role',
      v_table
    );
    execute format('grant select on table public.%I to authenticated', v_table);

    for v_policy in
      select pg_policies.policyname
      from pg_catalog.pg_policies
      where pg_policies.schemaname = 'public'
        and pg_policies.tablename = v_table
      order by pg_policies.policyname
    loop
      execute format('drop policy %I on public.%I', v_policy.policyname, v_table);
    end loop;

    execute format(
      'create policy authenticated_read on public.%I for select to authenticated using ((select auth.uid()) is not null)',
      v_table
    );
  end loop;
end;
$$;

-- Every current and future public table is RLS-protected by default.
do $$
declare
  v_table record;
begin
  for v_table in
    select pg_catalog.pg_class.relname
    from pg_catalog.pg_class
    join pg_catalog.pg_namespace
      on pg_catalog.pg_namespace.oid = pg_catalog.pg_class.relnamespace
    where pg_catalog.pg_namespace.nspname = 'public'
      and pg_catalog.pg_class.relkind in ('r', 'p')
    order by pg_catalog.pg_class.relname
  loop
    execute format('alter table public.%I enable row level security', v_table.relname);
  end loop;
end;
$$;

alter default privileges in schema public
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges in schema public
  revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

-- Revoke unsafe legacy RPCs while preserving their deployed definitions for history.
do $$
declare
  v_signature text;
  v_function regprocedure;
begin
  foreach v_signature in array array[
    'public.allocate_batch_fefo(uuid,integer)',
    'public.record_stock_movement(uuid,text,text,text,integer,text,uuid,uuid,uuid,public.source_type,text,text)',
    'public.process_shipment(uuid)',
    'public.process_cancellation(uuid,text)',
    'public.process_return(uuid,text,text)',
    'public.apply_opname_correction(uuid)',
    'public.koreksi_entri(uuid,text)',
    'public.daily_consistency_check()',
    'public.has_role(uuid,public.app_role)',
    'public.current_user_role()'
  ]
  loop
    v_function := to_regprocedure(v_signature);
    if v_function is not null then
      execute format(
        'revoke all on function %s from public, anon, authenticated, service_role',
        v_function
      );
    end if;
  end loop;
end;
$$;

-- Harden all retained SECURITY DEFINER functions. Trigger execution does not need EXECUTE grants.
do $$
declare
  v_function record;
begin
  for v_function in
    select pg_catalog.pg_proc.oid::regprocedure as signature
    from pg_catalog.pg_proc
    join pg_catalog.pg_namespace
      on pg_catalog.pg_namespace.oid = pg_catalog.pg_proc.pronamespace
    where pg_catalog.pg_namespace.nspname = 'public'
      and pg_catalog.pg_proc.prosecdef
    order by pg_catalog.pg_proc.oid
  loop
    execute format('alter function %s set search_path to %L', v_function.signature, '');
    execute format(
      'revoke all on function %s from public, anon, authenticated, service_role',
      v_function.signature
    );
  end loop;
end;
$$;

comment on table public.fulfillment_allocations is
  'Immutable per-component FEFO fulfillment allocations used for exact cancellation and return bounds.';
comment on table public.return_lines is
  'Partial return quantities linked to immutable fulfilled components.';
comment on table public.opening_balance_verifications is
  'Append-only evidence that an initial balance was verified by a certified stocktake.';
comment on column public.batches.current_stock is
  'Deprecated compatibility column fixed at zero; read public.stock_balance_summary instead.';
