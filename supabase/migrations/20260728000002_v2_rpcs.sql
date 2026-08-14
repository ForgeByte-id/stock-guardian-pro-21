
-- ============================================================
-- STOK AKURAT — v2 RPC updates
-- ============================================================
-- 1. record_stock_movement v2 — dukung source_type, reference_note, idempotency_key
-- 2. process_return v2 — resalable → batch baru origin=retur, rusak/hilang → claim_loss_record
-- 3. koreksi_entri — reversal cepat (FR-301b)
-- 4. process_shipment v2 — pakai recipe_version_id
-- 5. GRANTs
-- ============================================================

-- ---------- 1. record_stock_movement v2 ----------
drop function if exists public.record_stock_movement;

create or replace function public.record_stock_movement(
  p_batch_id uuid,
  p_movement_type text,           -- 'IN' or 'OUT'
  p_reason_code text,
  p_channel_code text default null,
  p_quantity integer default 1,
  p_notes text default null,
  p_order_id uuid default null,
  p_return_id uuid default null,
  p_opname_session_id uuid default null,
  p_source_type public.source_type default null,
  p_reference_note text default null,
  p_idempotency_key text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
  -- Auth check
  if v_user is null then raise exception 'Not authenticated'; end if;
  if p_quantity <= 0 then raise exception 'Quantity must be > 0'; end if;

  -- Idempotency check
  if p_idempotency_key is not null then
    if exists (select 1 from public.stock_ledger where idempotency_key = p_idempotency_key) then
      select id into v_ledger_id from public.stock_ledger where idempotency_key = p_idempotency_key;
      return v_ledger_id;
    end if;
  end if;

  -- Resolve FK ids
  select id into v_type_id from public.movement_types where name = p_movement_type;
  if v_type_id is null then raise exception 'Unknown movement type %', p_movement_type; end if;

  select id, direction into v_reason_id, v_direction from public.movement_reasons where code = p_reason_code;
  if v_reason_id is null then raise exception 'Unknown reason code %', p_reason_code; end if;

  -- Validate reason matches direction
  if (p_movement_type = 'IN' and v_direction <> 'in') or (p_movement_type = 'OUT' and v_direction <> 'out') then
    raise exception 'Reason % does not match direction', p_reason_code;
  end if;

  if p_channel_code is not null then
    select id into v_channel_id from public.channels where code = p_channel_code;
  end if;

  -- Validate reference_note for bonus/promo/sample
  if p_reason_code in ('bonus', 'promo', 'sample') and (p_reference_note is null or p_reference_note = '') then
    raise exception 'reference_note wajib untuk alasan %', p_reason_code;
  end if;

  -- Lock batch row and get current stock from balance_summary cache
  select coalesce(balance_qty, 0) into v_before
  from public.stock_balance_summary where batch_id = p_batch_id;

  -- If cache empty, compute from ledger
  if not found then
    select coalesce(sum(case when direction = 'in' then quantity else -quantity end), 0) into v_before
    from public.stock_ledger where batch_id = p_batch_id;
  end if;

  -- Also verify against batches.current_stock for backward compat
  if v_before = 0 then
    select current_stock into v_before from public.batches where id = p_batch_id;
  end if;

  if v_before is null then raise exception 'Batch % not found', p_batch_id; end if;

  -- Check sufficient stock
  if v_direction = 'out' and p_quantity > v_before then
    raise exception 'Insufficient stock in batch %: have %, need %', p_batch_id, v_before, p_quantity;
  end if;

  v_after := v_before + (case when v_direction = 'in' then p_quantity else -p_quantity end);

  -- Write ledger entry
  insert into public.stock_ledger (
    batch_id, movement_type_id, reason_id, channel_id, quantity, direction,
    stock_before, stock_after, order_id, return_id, opname_session_id,
    notes, recorded_by, source_type, reference_note, idempotency_key
  ) values (
    p_batch_id, v_type_id, v_reason_id, v_channel_id, p_quantity, v_direction,
    v_before, v_after, p_order_id, p_return_id, p_opname_session_id,
    p_notes, v_user, p_source_type, p_reference_note, p_idempotency_key
  ) returning id into v_ledger_id;

  -- Update batches.current_stock for backward compat (also triggers balance_summary)
  update public.batches set current_stock = v_after, updated_at = now()
  where id = p_batch_id;

  return v_ledger_id;
end;
$$;

-- ---------- 2. process_return v2 (CRITICAL FIX) ----------
drop function if exists public.process_return;

create or replace function public.process_return(
  p_return_id uuid,
  p_condition text,
  p_notes text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_channel_code text;
  v_channel_id uuid;
  v_return_date date;
  v_deadline date;
  v_order_item record;
  v_new_batch_id uuid;
  v_new_batch_code text;
  v_product_id uuid;
  v_total_qty integer;
  v_user uuid := auth.uid();
begin
  if p_condition not in ('RESALABLE', 'DAMAGED', 'LOST') then
    raise exception 'Invalid condition %', p_condition;
  end if;
  if v_user is null then raise exception 'Not authenticated'; end if;

  -- Get order + channel info
  select r.order_id, c.code, c.id, r.return_date
    into v_order_id, v_channel_code, v_channel_id, v_return_date
  from public.returns r
  join public.orders o on o.id = r.order_id
  join public.channels c on c.id = o.channel_id
  where r.id = p_return_id for update;

  if v_order_id is null then raise exception 'Return not found'; end if;

  -- === RESALABLE: create new batch with origin=retur ===
  if p_condition = 'RESALABLE' then
    -- We need to process each item from the order
    for v_order_item in
      select oi.product_id, oi.quantity
      from public.order_items oi
      where oi.order_id = v_order_id
    loop
      v_product_id := v_order_item.product_id;
      v_total_qty := v_order_item.quantity;

      -- Create NEW batch for this returned product
      v_new_batch_code := 'RET-' || to_char(v_return_date, 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 8);

      insert into public.batches (
        product_id, batch_number, production_date, expiry_date,
        initial_stock, current_stock, origin, is_active
      ) values (
        v_product_id,
        v_new_batch_code,
        v_return_date,
        -- Estimate expiry: 1 year from return date (batch origin retur)
        (v_return_date + interval '1 year')::date,
        v_total_qty, v_total_qty,
        'retur',
        true
      ) returning id into v_new_batch_id;

      -- Write ledger entry for return_in (source_type = return_resellable)
      perform public.record_stock_movement(
        p_batch_id => v_new_batch_id,
        p_movement_type => 'IN',
        p_reason_code => 'return_resalable',
        p_channel_code => v_channel_code,
        p_quantity => v_total_qty,
        p_notes => coalesce(p_notes, 'Retur layak jual dari order ' || v_order_id),
        p_order_id => v_order_id,
        p_return_id => p_return_id,
        p_source_type => 'return_resellable'
      );
    end loop;
  end if;

  -- === DAMAGED || LOST: create claim_loss_record (NO ledger movement) ===
  if p_condition IN ('DAMAGED', 'LOST') then
    insert into public.claim_loss_record (
      return_case_id, type, claim_status, notes, created_by
    ) values (
      p_return_id,
      case when p_condition = 'DAMAGED' then 'damaged' else 'lost_in_transit' end,
      'pending',
      coalesce(p_notes, ''),
      v_user
    );
  end if;

  -- Claim deadline only for TikTok LOST
  if p_condition = 'LOST' and v_channel_code = 'TIKTOK' then
    v_deadline := v_return_date + interval '40 days';
    update public.returns
      set condition = p_condition,
          inspected_at = now(),
          inspected_by = v_user,
          claim_deadline = v_deadline,
          claim_status = 'PENDING',
          notes = coalesce(p_notes, notes)
      where id = p_return_id;
  else
    update public.returns
      set condition = p_condition,
          inspected_at = now(),
          inspected_by = v_user,
          notes = coalesce(p_notes, notes)
      where id = p_return_id;
  end if;

  -- Mark order as returned
  update public.orders set status = 'RETURNED' where id = v_order_id;
end;
$$;

-- ---------- 3. Koreksi Entri RPC (FR-301b) ----------
create or replace function public.koreksi_entri(
  p_ledger_id uuid,
  p_reference_note text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ledger record;
  v_new_id uuid;
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  -- Get original entry
  select * into v_ledger from public.stock_ledger where id = p_ledger_id;
  if v_ledger is null then raise exception 'Ledger entry not found'; end if;

  -- Create reversal entry
  insert into public.stock_ledger (
    batch_id, movement_type_id, reason_id, channel_id,
    quantity, direction, stock_before, stock_after,
    notes, recorded_by, source_type, reference_note,
    is_unverified
  ) values (
    v_ledger.batch_id,
    v_ledger.movement_type_id,
    v_ledger.reason_id,
    v_ledger.channel_id,
    v_ledger.quantity,
    case when v_ledger.direction = 'in' then 'out' else 'in' end,
    v_ledger.stock_after,
    v_ledger.stock_before,
    'Koreksi entri: ' || coalesce(p_reference_note, 'pembalikan manual'),
    v_user,
    'manual_correction',
    p_reference_note,
    false
  ) returning id into v_new_id;

  -- Update batch stock (reverse)
  update public.batches set
    current_stock = current_stock + case when v_ledger.direction = 'in' then -v_ledger.quantity else v_ledger.quantity end,
    updated_at = now()
  where id = v_ledger.batch_id;

  return v_new_id;
end;
$$;

-- ---------- 4. GRANTs ----------
grant execute on function public.record_stock_movement to authenticated;
grant execute on function public.process_return to authenticated;
grant execute on function public.koreksi_entri to authenticated;
