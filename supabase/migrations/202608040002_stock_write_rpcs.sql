-- Authenticated, transactional stock-write contracts for manual warehouse work.
-- Ledger rows remain append-only; the summary trigger applies every signed delta.

begin;

create function public.record_goods_in(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_request_id text;
  v_product_id uuid;
  v_batch_number text;
  v_production_date date;
  v_expiry_date date;
  v_quantity integer;
  v_reference_note text;
  v_batch_id uuid;
  v_movement_type_id uuid;
  v_reason_id uuid;
  v_ledger_id uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception 'payload must be a JSON object';
  end if;

  v_request_id := coalesce(
    nullif(pg_catalog.btrim(p_payload ->> 'requestId'), ''),
    nullif(pg_catalog.btrim(p_payload ->> 'request_id'), '')
  );
  v_product_id := coalesce(
    nullif(p_payload ->> 'productId', ''),
    nullif(p_payload ->> 'product_id', '')
  )::uuid;
  v_batch_number := coalesce(
    nullif(pg_catalog.btrim(p_payload ->> 'batchCode'), ''),
    nullif(pg_catalog.btrim(p_payload ->> 'batchNumber'), ''),
    nullif(pg_catalog.btrim(p_payload ->> 'batch_number'), '')
  );
  v_production_date := coalesce(
    nullif(p_payload ->> 'productionDate', ''),
    nullif(p_payload ->> 'production_date', ''),
    nullif(p_payload ->> 'receivedAt', ''),
    nullif(p_payload ->> 'received_at', '')
  )::date;
  v_expiry_date := coalesce(
    nullif(p_payload ->> 'expiryDate', ''),
    nullif(p_payload ->> 'expiry_date', '')
  )::date;
  v_quantity := (p_payload ->> 'quantity')::integer;
  v_reference_note := coalesce(
    nullif(pg_catalog.btrim(p_payload ->> 'reference'), ''),
    nullif(pg_catalog.btrim(p_payload ->> 'referenceNote'), ''),
    nullif(pg_catalog.btrim(p_payload ->> 'reference_note'), '')
  );

  if v_product_id is null then
    raise exception 'product_id is required';
  end if;
  if v_batch_number is null then
    raise exception 'batch_number is required';
  end if;
  if v_production_date is null then
    raise exception 'production_date or received_at is required';
  end if;
  if v_expiry_date is null then
    raise exception 'expiry_date is required';
  end if;
  if v_expiry_date <= v_production_date then
    raise exception 'expiry_date must be after production_date';
  end if;
  if v_quantity is null or v_quantity <= 0 then
    raise exception 'quantity must be positive';
  end if;
  if v_reference_note is null then
    raise exception 'reference_note is required';
  end if;

  perform 1
  from public.products
  where public.products.id = v_product_id
    and public.products.is_active;

  if not found then
    raise exception 'Active product % not found', v_product_id;
  end if;

  select public.movement_types.id
  into v_movement_type_id
  from public.movement_types
  where public.movement_types.name = 'IN';

  select public.movement_reasons.id
  into v_reason_id
  from public.movement_reasons
  where public.movement_reasons.code = 'maklon_in'
    and public.movement_reasons.direction = 'in'
    and public.movement_reasons.is_active;

  if v_movement_type_id is null or v_reason_id is null then
    raise exception 'Goods-in reference data is not configured';
  end if;

  insert into public.batches (
    product_id,
    batch_number,
    production_date,
    expiry_date,
    initial_stock,
    current_stock,
    origin,
    is_active
  ) values (
    v_product_id,
    v_batch_number,
    v_production_date,
    v_expiry_date,
    0,
    0,
    'maklon',
    true
  )
  returning public.batches.id into v_batch_id;

  insert into public.stock_ledger (
    batch_id,
    movement_type_id,
    reason_id,
    quantity,
    direction,
    stock_before,
    stock_after,
    notes,
    recorded_by,
    created_by,
    source_type,
    reference_note,
    is_unverified
  ) values (
    v_batch_id,
    v_movement_type_id,
    v_reason_id,
    v_quantity,
    'in',
    0,
    v_quantity,
    v_reference_note,
    v_actor,
    v_actor,
    'goods_in_maklon'::public.source_type,
    v_reference_note,
    false
  )
  returning public.stock_ledger.id into v_ledger_id;

  return pg_catalog.jsonb_build_object(
    'requestId', v_request_id,
    'batchId', v_batch_id,
    'ledgerEntryIds', pg_catalog.jsonb_build_array(v_ledger_id),
    'allocationIds', '[]'::jsonb,
    'balanceBefore', 0,
    'balanceAfter', v_quantity
  );
end;
$function$;

create function public.record_manual_out(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_request_id text;
  v_product_id uuid;
  v_quantity integer;
  v_reason text;
  v_channel text;
  v_reference_note text;
  v_movement_type_id uuid;
  v_reason_id uuid;
  v_channel_id uuid;
  v_remaining integer;
  v_take integer;
  v_balance_before integer := 0;
  v_ledger_id uuid;
  v_ledger_ids uuid[] := array[]::uuid[];
  v_batch record;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception 'payload must be a JSON object';
  end if;

  v_request_id := coalesce(
    nullif(pg_catalog.btrim(p_payload ->> 'requestId'), ''),
    nullif(pg_catalog.btrim(p_payload ->> 'request_id'), '')
  );
  v_product_id := coalesce(
    nullif(p_payload ->> 'productId', ''),
    nullif(p_payload ->> 'product_id', '')
  )::uuid;
  v_quantity := (p_payload ->> 'quantity')::integer;
  v_reason := pg_catalog.lower(pg_catalog.btrim(p_payload ->> 'reason'));
  v_channel := pg_catalog.lower(pg_catalog.btrim(p_payload ->> 'channel'));
  v_reference_note := coalesce(
    nullif(pg_catalog.btrim(p_payload ->> 'referenceNote'), ''),
    nullif(pg_catalog.btrim(p_payload ->> 'reference_note'), '')
  );

  if v_product_id is null then
    raise exception 'product_id is required';
  end if;
  if v_quantity is null or v_quantity <= 0 then
    raise exception 'quantity must be positive';
  end if;
  if v_reason is null or v_reason not in (
    'offline', 'bonus', 'promo', 'sample', 'damaged', 'expired'
  ) then
    raise exception 'Invalid manual-out reason';
  end if;
  if v_channel is null or v_channel not in ('offline', 'internal') then
    raise exception 'Invalid manual-out channel';
  end if;
  if v_reason in ('bonus', 'promo', 'sample') and v_reference_note is null then
    raise exception 'reference_note is required for reason %', v_reason;
  end if;

  perform 1
  from public.products
  where public.products.id = v_product_id
    and public.products.is_active;

  if not found then
    raise exception 'Active product % not found', v_product_id;
  end if;

  select public.movement_types.id
  into v_movement_type_id
  from public.movement_types
  where public.movement_types.name = 'OUT';

  select public.movement_reasons.id
  into v_reason_id
  from public.movement_reasons
  where public.movement_reasons.code = v_reason
    and public.movement_reasons.direction = 'out'
    and public.movement_reasons.is_active;

  select public.channels.id
  into v_channel_id
  from public.channels
  where public.channels.code = pg_catalog.upper(v_channel)
    and public.channels.is_active;

  if v_movement_type_id is null or v_reason_id is null or v_channel_id is null then
    raise exception 'Manual-out reference data is not configured';
  end if;

  v_remaining := v_quantity;

  -- Lock every eligible positive summary row in strict FEFO order. Waiting is
  -- intentional: SKIP LOCKED could allocate a later-expiring batch first.
  for v_batch in
    select
      batch.id,
      summary.balance_qty
    from public.batches as batch
    join public.stock_balance_summary as summary
      on summary.batch_id = batch.id
     and summary.product_id = batch.product_id
    where batch.product_id = v_product_id
      and batch.is_active
      and summary.balance_qty > 0
      and (
        (v_reason = 'expired' and batch.expiry_date < current_date)
        or (v_reason <> 'expired' and batch.expiry_date >= current_date)
      )
    order by batch.expiry_date, batch.created_at, batch.id
    for update of summary
  loop
    v_balance_before := v_balance_before + v_batch.balance_qty;

    if v_remaining > 0 then
      v_take := least(v_batch.balance_qty, v_remaining);

      insert into public.stock_ledger (
        batch_id,
        movement_type_id,
        reason_id,
        channel_id,
        quantity,
        direction,
        stock_before,
        stock_after,
        notes,
        recorded_by,
        created_by,
        source_type,
        reference_note,
        is_unverified
      ) values (
        v_batch.id,
        v_movement_type_id,
        v_reason_id,
        v_channel_id,
        v_take,
        'out',
        v_batch.balance_qty,
        v_batch.balance_qty - v_take,
        v_reference_note,
        v_actor,
        v_actor,
        'manual_out'::public.source_type,
        v_reference_note,
        false
      )
      returning public.stock_ledger.id into v_ledger_id;

      v_ledger_ids := pg_catalog.array_append(v_ledger_ids, v_ledger_id);
      v_remaining := v_remaining - v_take;
    end if;
  end loop;

  if v_remaining > 0 then
    raise exception 'Insufficient stock for product %: short by %', v_product_id, v_remaining;
  end if;

  return pg_catalog.jsonb_build_object(
    'requestId', v_request_id,
    'ledgerEntryIds', pg_catalog.to_jsonb(v_ledger_ids),
    'allocationIds', '[]'::jsonb,
    'balanceBefore', v_balance_before,
    'balanceAfter', v_balance_before - v_quantity
  );
end;
$function$;

create function public.correct_ledger_entry(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_request_id text;
  v_source_ledger_id uuid;
  v_quantity integer;
  v_reference_note text;
  v_source record;
  v_already_corrected integer;
  v_remaining_correctable integer;
  v_movement_type_id uuid;
  v_direction text;
  v_balance_before integer;
  v_balance_after integer;
  v_ledger_id uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception 'payload must be a JSON object';
  end if;

  v_request_id := coalesce(
    nullif(pg_catalog.btrim(p_payload ->> 'requestId'), ''),
    nullif(pg_catalog.btrim(p_payload ->> 'request_id'), '')
  );
  v_source_ledger_id := coalesce(
    nullif(p_payload ->> 'sourceLedgerId', ''),
    nullif(p_payload ->> 'ledgerEntryId', ''),
    nullif(p_payload ->> 'source_ledger_id', '')
  )::uuid;
  v_quantity := (p_payload ->> 'quantity')::integer;
  v_reference_note := coalesce(
    nullif(pg_catalog.btrim(p_payload ->> 'referenceNote'), ''),
    nullif(pg_catalog.btrim(p_payload ->> 'reference_note'), '')
  );

  if v_source_ledger_id is null then
    raise exception 'sourceLedgerId is required';
  end if;
  if v_quantity is null or v_quantity <= 0 then
    raise exception 'quantity must be positive';
  end if;
  if v_reference_note is null then
    raise exception 'referenceNote is required';
  end if;

  select
    ledger.batch_id,
    ledger.movement_type_id,
    ledger.reason_id,
    ledger.channel_id,
    ledger.quantity,
    ledger.direction
  into v_source
  from public.stock_ledger as ledger
  where ledger.id = v_source_ledger_id
  for update;

  if not found then
    raise exception 'Source ledger entry % not found', v_source_ledger_id;
  end if;

  select coalesce(pg_catalog.sum(correction.quantity), 0)::integer
  into v_already_corrected
  from public.stock_ledger as correction
  where correction.source_ref_id = v_source_ledger_id
    and correction.source_type = 'manual_correction'::public.source_type;

  v_remaining_correctable := v_source.quantity - v_already_corrected;

  if v_quantity > v_remaining_correctable then
    raise exception 'quantity exceeds remaining correctable quantity (%)', v_remaining_correctable;
  end if;

  select summary.balance_qty
  into v_balance_before
  from public.stock_balance_summary as summary
  where summary.batch_id = v_source.batch_id
  for update;

  if not found then
    raise exception 'Balance summary for batch % not found', v_source.batch_id;
  end if;

  v_direction := case when v_source.direction = 'in' then 'out' else 'in' end;
  v_balance_after := v_balance_before
    + case when v_direction = 'in' then v_quantity else -v_quantity end;

  if v_balance_after < 0 then
    raise exception 'Insufficient stock to correct source ledger entry %', v_source_ledger_id;
  end if;

  select public.movement_types.id
  into v_movement_type_id
  from public.movement_types
  where public.movement_types.name = pg_catalog.upper(v_direction);

  if v_movement_type_id is null then
    raise exception 'Correction movement type is not configured';
  end if;

  insert into public.stock_ledger (
    batch_id,
    movement_type_id,
    reason_id,
    channel_id,
    quantity,
    direction,
    stock_before,
    stock_after,
    notes,
    recorded_by,
    created_by,
    source_type,
    source_ref_id,
    reference_note,
    is_unverified
  ) values (
    v_source.batch_id,
    v_movement_type_id,
    v_source.reason_id,
    v_source.channel_id,
    v_quantity,
    v_direction,
    v_balance_before,
    v_balance_after,
    v_reference_note,
    v_actor,
    v_actor,
    'manual_correction'::public.source_type,
    v_source_ledger_id,
    v_reference_note,
    false
  )
  returning public.stock_ledger.id into v_ledger_id;

  return pg_catalog.jsonb_build_object(
    'requestId', v_request_id,
    'ledgerEntryIds', pg_catalog.jsonb_build_array(v_ledger_id),
    'allocationIds', '[]'::jsonb,
    'balanceBefore', v_balance_before,
    'balanceAfter', v_balance_after
  );
end;
$function$;

create function public.certify_stocktake(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_session_id uuid;
  v_session_name text;
  v_opened_at timestamptz;
  v_counts jsonb;
  v_count jsonb;
  v_batch_id uuid;
  v_payload_product_id uuid;
  v_product_id uuid;
  v_recorded_quantity integer;
  v_counted_quantity integer;
  v_difference integer;
  v_current_balance integer;
  v_seen_batch_ids uuid[] := array[]::uuid[];
  v_movement_type_id uuid;
  v_reason_id uuid;
  v_ledger_id uuid;
  v_ledger_ids uuid[] := array[]::uuid[];
  v_verification_id uuid;
  v_verification_ids uuid[] := array[]::uuid[];
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception 'payload must be a JSON object';
  end if;

  v_session_id := coalesce(
    nullif(p_payload ->> 'sessionId', ''),
    nullif(p_payload ->> 'session_id', '')
  )::uuid;
  v_session_name := coalesce(
    nullif(pg_catalog.btrim(p_payload ->> 'sessionName'), ''),
    nullif(pg_catalog.btrim(p_payload ->> 'session_name'), ''),
    case
      when v_session_id is not null then 'Stocktake ' || v_session_id::text
      else null
    end
  );
  v_opened_at := coalesce(
    nullif(p_payload ->> 'openedAt', ''),
    nullif(p_payload ->> 'opened_at', '')
  )::timestamptz;
  v_counts := coalesce(p_payload -> 'counts', p_payload -> 'lines');

  if v_session_id is null then
    raise exception 'sessionId is required';
  end if;
  if v_opened_at is null then
    raise exception 'openedAt is required';
  end if;
  if v_counts is null
     or pg_catalog.jsonb_typeof(v_counts) <> 'array'
     or pg_catalog.jsonb_array_length(v_counts) = 0 then
    raise exception 'counts must be a non-empty array';
  end if;

  -- Validate the whole command before writing anything so error messages are
  -- deterministic and malformed lines cannot leave partial certification state.
  for v_count in
    select count_value.value
    from pg_catalog.jsonb_array_elements(v_counts) as count_value(value)
  loop
    if pg_catalog.jsonb_typeof(v_count) <> 'object' then
      raise exception 'each stocktake count must be a JSON object';
    end if;

    v_batch_id := coalesce(
      nullif(v_count ->> 'batchId', ''),
      nullif(v_count ->> 'batch_id', '')
    )::uuid;
    v_recorded_quantity := coalesce(
      nullif(v_count ->> 'recordedQtySnapshot', ''),
      nullif(v_count ->> 'recordedQuantitySnapshot', ''),
      nullif(v_count ->> 'recorded_qty_snapshot', '')
    )::integer;
    v_counted_quantity := coalesce(
      nullif(v_count ->> 'countedQty', ''),
      nullif(v_count ->> 'countedQuantity', ''),
      nullif(v_count ->> 'counted_qty', '')
    )::integer;

    if v_batch_id is null then
      raise exception 'batchId is required for every stocktake count';
    end if;
    if v_recorded_quantity is null or v_recorded_quantity < 0 then
      raise exception 'recorded quantity snapshot must be non-negative';
    end if;
    if v_counted_quantity is null or v_counted_quantity < 0 then
      raise exception 'counted quantity must be non-negative';
    end if;
    if v_batch_id = any(v_seen_batch_ids) then
      raise exception 'duplicate stocktake batch %', v_batch_id;
    end if;

    v_seen_batch_ids := pg_catalog.array_append(v_seen_batch_ids, v_batch_id);
  end loop;

  insert into public.opname_sessions (
    id,
    session_name,
    status,
    started_at,
    created_by
  ) values (
    v_session_id,
    v_session_name,
    'ACTIVE',
    v_opened_at,
    v_actor
  );

  -- UUID ordering gives every certification the same lock order and avoids
  -- deadlocks when sessions overlap batches.
  for v_count in
    select count_value.value
    from pg_catalog.jsonb_array_elements(v_counts) as count_value(value)
    order by coalesce(
      nullif(count_value.value ->> 'batchId', ''),
      nullif(count_value.value ->> 'batch_id', '')
    )::uuid
  loop
    v_batch_id := coalesce(
      nullif(v_count ->> 'batchId', ''),
      nullif(v_count ->> 'batch_id', '')
    )::uuid;
    v_payload_product_id := coalesce(
      nullif(v_count ->> 'productId', ''),
      nullif(v_count ->> 'product_id', '')
    )::uuid;
    v_recorded_quantity := coalesce(
      nullif(v_count ->> 'recordedQtySnapshot', ''),
      nullif(v_count ->> 'recordedQuantitySnapshot', ''),
      nullif(v_count ->> 'recorded_qty_snapshot', '')
    )::integer;
    v_counted_quantity := coalesce(
      nullif(v_count ->> 'countedQty', ''),
      nullif(v_count ->> 'countedQuantity', ''),
      nullif(v_count ->> 'counted_qty', '')
    )::integer;

    select batch.product_id, summary.balance_qty
    into v_product_id, v_current_balance
    from public.batches as batch
    join public.stock_balance_summary as summary
      on summary.batch_id = batch.id
     and summary.product_id = batch.product_id
    where batch.id = v_batch_id
    for update of summary;

    if not found then
      raise exception 'Batch or balance summary % not found', v_batch_id;
    end if;
    if v_payload_product_id is not null and v_payload_product_id <> v_product_id then
      raise exception 'productId does not match batch %', v_batch_id;
    end if;
    if v_recorded_quantity <> v_current_balance then
      raise exception 'recorded quantity snapshot is stale for batch %', v_batch_id;
    end if;

    v_difference := v_counted_quantity - v_recorded_quantity;

    insert into public.opname_entries (
      session_id,
      batch_id,
      system_stock,
      physical_count,
      correction_applied,
      counted_by,
      counted_at
    ) values (
      v_session_id,
      v_batch_id,
      v_recorded_quantity,
      v_counted_quantity,
      true,
      v_actor,
      pg_catalog.statement_timestamp()
    );

    if v_difference <> 0 then
      select public.movement_types.id
      into v_movement_type_id
      from public.movement_types
      where public.movement_types.name = case when v_difference > 0 then 'IN' else 'OUT' end;

      select public.movement_reasons.id
      into v_reason_id
      from public.movement_reasons
      where public.movement_reasons.code = case
        when v_difference > 0 then 'opname_plus'
        else 'opname_minus'
      end
        and public.movement_reasons.is_active;

      if v_movement_type_id is null or v_reason_id is null then
        raise exception 'Stocktake correction reference data is not configured';
      end if;

      insert into public.stock_ledger (
        batch_id,
        movement_type_id,
        reason_id,
        quantity,
        direction,
        stock_before,
        stock_after,
        opname_session_id,
        notes,
        recorded_by,
        created_by,
        source_type,
        is_unverified
      ) values (
        v_batch_id,
        v_movement_type_id,
        v_reason_id,
        pg_catalog.abs(v_difference),
        case when v_difference > 0 then 'in' else 'out' end,
        v_current_balance,
        v_counted_quantity,
        v_session_id,
        'Stocktake correction: ' || v_session_name,
        v_actor,
        v_actor,
        'opname_correction'::public.source_type,
        false
      )
      returning public.stock_ledger.id into v_ledger_id;

      v_ledger_ids := pg_catalog.array_append(v_ledger_ids, v_ledger_id);
    end if;

    for v_verification_id in
      insert into public.opening_balance_verifications (
        initial_ledger_id,
        opname_session_id,
        verified_at,
        verified_by
      )
      select
        opening.id,
        v_session_id,
        pg_catalog.statement_timestamp(),
        v_actor
      from public.stock_ledger as opening
      join public.batches as opening_batch on opening_batch.id = opening.batch_id
      where opening_batch.product_id = v_product_id
        and opening.source_type = 'initial_balance'::public.source_type
        and opening.is_unverified is true
      order by opening.created_at, opening.id
      on conflict (initial_ledger_id) do nothing
      returning public.opening_balance_verifications.id
    loop
      v_verification_ids := pg_catalog.array_append(v_verification_ids, v_verification_id);
    end loop;
  end loop;

  update public.opname_sessions
  set status = 'COMPLETED',
      completed_at = pg_catalog.statement_timestamp(),
      completed_by = v_actor
  where public.opname_sessions.id = v_session_id;

  return pg_catalog.jsonb_build_object(
    'sessionId', v_session_id,
    'ledgerEntryIds', pg_catalog.to_jsonb(v_ledger_ids),
    'verifiedOpeningBalanceIds', pg_catalog.to_jsonb(v_verification_ids),
    'status', 'certified'
  );
end;
$function$;

revoke all on function public.record_goods_in(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.record_manual_out(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.correct_ledger_entry(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.certify_stocktake(jsonb)
  from public, anon, authenticated, service_role;

grant execute on function public.record_goods_in(jsonb) to authenticated;
grant execute on function public.record_manual_out(jsonb) to authenticated;
grant execute on function public.correct_ledger_entry(jsonb) to authenticated;
grant execute on function public.certify_stocktake(jsonb) to authenticated;

comment on function public.record_goods_in(jsonb) is
  'Creates one zero-start maklon batch and its first immutable ledger entry.';
comment on function public.record_manual_out(jsonb) is
  'Allocates manual stock-out using locked deterministic FEFO and immutable ledger rows.';
comment on function public.correct_ledger_entry(jsonb) is
  'Creates a bounded linked reversal without mutating its source ledger row.';
comment on function public.certify_stocktake(jsonb) is
  'Atomically snapshots counts, inserts adjustments, closes the session, and verifies openings.';

commit;
