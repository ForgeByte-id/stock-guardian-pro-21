
-- ============================================================
-- STOK AKURAT — Update existing RPCs to use source_type
-- ============================================================

-- ---------- 1. process_shipment v2 — with source_type ----------
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
            p_batch_id => alloc.batch_id,
            p_movement_type => 'OUT',
            p_reason_code => 'sale_online',
            p_channel_code => v_channel_code,
            p_quantity => alloc.qty,
            p_notes => 'Shipment for order '||p_order_id,
            p_order_id => p_order_id,
            p_source_type => 'order_fulfillment'
          );
        end loop;
      end loop;
    else
      for alloc in select * from public.allocate_batch_fefo(oi.product_id, oi.quantity) loop
        perform public.record_stock_movement(
          p_batch_id => alloc.batch_id,
          p_movement_type => 'OUT',
          p_reason_code => 'sale_online',
          p_channel_code => v_channel_code,
          p_quantity => alloc.qty,
          p_notes => 'Shipment for order '||p_order_id,
          p_order_id => p_order_id,
          p_source_type => 'order_fulfillment'
        );
        update public.order_items set batch_id = alloc.batch_id where id = oi.id;
      end loop;
    end if;
  end loop;

  update public.orders set status='SHIPPED', shipped_at = now() where id = p_order_id;
end;
$$;

-- ---------- 2. process_cancellation v2 — with source_type ----------
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

  for led in
    select batch_id, quantity from public.stock_ledger
    where order_id = p_order_id and direction = 'out'
  loop
    perform public.record_stock_movement(
      p_batch_id => led.batch_id,
      p_movement_type => 'IN',
      p_reason_code => 'cancellation',
      p_channel_code => v_channel_code,
      p_quantity => led.quantity,
      p_notes => 'Cancellation restore for order '||p_order_id,
      p_order_id => p_order_id,
      p_source_type => 'order_cancel_reversal'
    );
  end loop;

  update public.orders set status='CANCELLED', cancelled_at=now(), cancellation_reason=p_reason
  where id = p_order_id;
end;
$$;

-- ---------- 3. apply_opname_correction v2 — with source_type ----------
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
    perform public.record_stock_movement(
      p_batch_id => v_batch,
      p_movement_type => 'IN',
      p_reason_code => 'opname_plus',
      p_quantity => v_disc,
      p_notes => 'Opname correction (+)',
      p_opname_session_id => v_session,
      p_source_type => 'opname_correction'
    );
  elsif v_disc < 0 then
    perform public.record_stock_movement(
      p_batch_id => v_batch,
      p_movement_type => 'OUT',
      p_reason_code => 'opname_minus',
      p_quantity => -v_disc,
      p_notes => 'Opname correction (-)',
      p_opname_session_id => v_session,
      p_source_type => 'opname_correction'
    );
  end if;

  update public.opname_entries set correction_applied = true where id = p_entry_id;
end;
$$;

-- ---------- 4. GRANTs ----------
grant execute on function public.process_shipment(uuid) to authenticated;
grant execute on function public.process_cancellation(uuid, text) to authenticated;
grant execute on function public.apply_opname_correction(uuid) to authenticated;
