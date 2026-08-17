-- Compatibility write path for returns created before return_lines existed.
-- Current event-backed returns continue to use process_stock_event exclusively.

create or replace function public.inspect_legacy_return(
  p_return_id uuid,
  p_condition text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_condition text := upper(nullif(btrim(p_condition), ''));
  v_order_id uuid;
  v_channel_id uuid;
  v_channel_code text;
  v_return_date date;
  v_current_condition text;
  v_movement_type_id uuid;
  v_reason_id uuid;
  v_order_item record;
  v_batch_id uuid;
  v_ledger_id uuid;
  v_ledger_ids jsonb := '[]'::jsonb;
  v_claim_ids jsonb := '[]'::jsonb;
  v_claim_id uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.user_roles
    where public.user_roles.user_id = v_actor
      and public.user_roles.role = 'admin'::public.app_role
      and public.user_roles.is_active
  ) then
    raise exception 'Admin access required';
  end if;

  if v_condition not in ('RESALABLE', 'DAMAGED', 'LOST') then
    raise exception 'Invalid legacy return condition %', p_condition;
  end if;

  select
    return_case.order_id,
    return_case.return_date,
    return_case.condition,
    order_channel.id,
    upper(order_channel.code)
  into
    v_order_id,
    v_return_date,
    v_current_condition,
    v_channel_id,
    v_channel_code
  from public.returns as return_case
  join public.orders as stock_order on stock_order.id = return_case.order_id
  join public.channels as order_channel on order_channel.id = stock_order.channel_id
  where return_case.id = p_return_id
  for update of return_case;

  if v_order_id is null then
    raise exception 'Return not found';
  end if;

  if exists (
    select 1
    from public.return_lines
    where public.return_lines.return_id = p_return_id
  ) then
    raise exception 'Event-backed return must use process_stock_event';
  end if;

  if v_current_condition <> 'PENDING_INSPECTION' then
    if v_current_condition = v_condition then
      return jsonb_build_object(
        'status', 'duplicate',
        'condition', v_current_condition,
        'ledgerEntryIds', v_ledger_ids,
        'claimRecordIds', v_claim_ids
      );
    end if;
    raise exception 'Legacy return is already inspected as %', v_current_condition;
  end if;

  if v_condition = 'RESALABLE' then
    select public.movement_types.id
    into v_movement_type_id
    from public.movement_types
    where public.movement_types.name = 'IN';

    select public.movement_reasons.id
    into v_reason_id
    from public.movement_reasons
    where public.movement_reasons.code = 'return_resalable'
      and public.movement_reasons.direction = 'in';

    if v_movement_type_id is null or v_reason_id is null then
      raise exception 'Sellable return movement configuration is missing';
    end if;

    for v_order_item in
      select public.order_items.id, public.order_items.product_id, public.order_items.quantity
      from public.order_items
      where public.order_items.order_id = v_order_id
        and public.order_items.quantity > 0
      order by public.order_items.id
    loop
      insert into public.batches (
        product_id,
        batch_number,
        production_date,
        expiry_date,
        initial_stock,
        current_stock,
        origin,
        is_active,
        created_at
      ) values (
        v_order_item.product_id,
        'RET-' || to_char(v_return_date, 'YYYYMMDD') || '-' || substr(v_order_item.id::text, 1, 8),
        v_return_date,
        (v_return_date + interval '1 year')::date,
        0,
        0,
        'retur',
        true,
        statement_timestamp()
      ) returning id into v_batch_id;

      insert into public.stock_ledger (
        batch_id,
        movement_type_id,
        reason_id,
        channel_id,
        quantity,
        direction,
        stock_before,
        stock_after,
        order_id,
        return_id,
        notes,
        recorded_by,
        created_by,
        source_type,
        idempotency_key,
        created_at
      ) values (
        v_batch_id,
        v_movement_type_id,
        v_reason_id,
        v_channel_id,
        v_order_item.quantity,
        'in',
        0,
        v_order_item.quantity,
        v_order_id,
        p_return_id,
        coalesce(nullif(btrim(p_notes), ''), 'Legacy sellable marketplace return'),
        v_actor,
        v_actor,
        'return_resellable',
        'legacy-return:' || p_return_id::text || ':' || v_order_item.id::text,
        statement_timestamp()
      ) returning id into v_ledger_id;

      v_ledger_ids := v_ledger_ids || jsonb_build_array(v_ledger_id);
    end loop;
  else
    insert into public.claim_loss_record (
      return_case_id,
      type,
      claim_status,
      notes,
      created_by
    ) values (
      p_return_id,
      case when v_condition = 'DAMAGED' then 'damaged' else 'lost_in_transit' end,
      'pending',
      nullif(btrim(p_notes), ''),
      v_actor
    )
    returning id into v_claim_id;

    v_claim_ids := v_claim_ids || jsonb_build_array(v_claim_id);
  end if;

  update public.returns
  set condition = v_condition,
      inspected_at = statement_timestamp(),
      inspected_by = v_actor,
      notes = coalesce(nullif(btrim(p_notes), ''), public.returns.notes),
      claim_deadline = case
        when v_condition = 'LOST' and v_channel_code = 'TIKTOK'
          then v_return_date + 40
        else public.returns.claim_deadline
      end,
      claim_status = case
        when v_condition = 'LOST' and v_channel_code = 'TIKTOK' then 'PENDING'
        else public.returns.claim_status
      end
  where public.returns.id = p_return_id;

  update public.orders
  set status = 'RETURNED'
  where public.orders.id = v_order_id;

  return jsonb_build_object(
    'status', 'inspected',
    'condition', v_condition,
    'ledgerEntryIds', v_ledger_ids,
    'claimRecordIds', v_claim_ids
  );
end;
$$;

revoke all on function public.inspect_legacy_return(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.inspect_legacy_return(uuid, text, text) to authenticated;
