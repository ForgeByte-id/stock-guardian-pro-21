-- Transaction-safe marketplace stock event engine (BR-01, BR-03--BR-09,
-- BR-16, BR-18; FR-401--FR-410, FR-501--FR-506, FR-601).

-- A bundle order item represents a listing, not one component product. Its
-- immutable component_snapshot is the stock-bearing representation.
alter table public.order_items
  alter column product_id drop not null;

-- Claims are per returned component line. The legacy parent/type uniqueness
-- would incorrectly reject two damaged components in one return.
alter table public.claim_loss_record
  drop constraint if exists claim_loss_record_return_case_id_type_key;

create or replace function public.process_stock_event(p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_idempotency_key text;
  v_channel text;
  v_event_type text;
  v_external_reference text;
  v_occurred_at timestamptz;
  v_payload jsonb;
  v_fingerprint text;
  v_event_id uuid;
  v_existing_fingerprint text;
  v_existing_result jsonb;
  v_result jsonb;
  v_status text;
  v_requested_status text;
  v_channel_id uuid;
  v_movement_type_id uuid;
  v_reason_id uuid;
  v_order_id uuid;
  v_order_status text;
  v_order_channel text;
  v_order_last_event_at timestamptz;
  v_product_id uuid;
  v_bundle_id uuid;
  v_recipe_version_id uuid;
  v_component_snapshot jsonb;
  v_quantity integer;
  v_requested_quantity integer;
  v_remaining integer;
  v_take integer;
  v_before integer;
  v_ledger_id uuid;
  v_allocation_id uuid;
  v_return_id uuid;
  v_return_reference text;
  v_return_reported_at timestamptz;
  v_condition text;
  v_batch_id uuid;
  v_batch_number text;
  v_production_date date;
  v_expiry_date date;
  v_claim_id uuid;
  v_uninspected_count integer;
  v_condition_count integer;
  v_processed_count integer;
  v_total_count integer;
  v_ledger_sequence integer := 0;
  v_ledger_ids jsonb := '[]'::jsonb;
  v_allocation_ids jsonb := '[]'::jsonb;
  v_claim_ids jsonb := '[]'::jsonb;
  v_lines jsonb;
  v_item jsonb;
  v_line jsonb;
  v_order_item record;
  v_component record;
  v_batch record;
  v_allocation record;
  v_return_line record;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if p_event is null or jsonb_typeof(p_event) <> 'object' then
    raise exception 'event payload must be a JSON object';
  end if;

  v_idempotency_key := nullif(btrim(p_event->>'idempotencyKey'), '');
  v_channel := lower(nullif(btrim(p_event->>'channel'), ''));
  v_event_type := lower(nullif(btrim(p_event->>'type'), ''));
  v_external_reference := nullif(btrim(p_event->>'externalReference'), '');
  v_payload := p_event->'payload';

  if v_idempotency_key is null then
    raise exception 'idempotencyKey is required';
  end if;
  if v_channel is null or v_channel not in ('shopee', 'tiktok') then
    raise exception 'channel must be shopee or tiktok';
  end if;
  if v_event_type is null or v_event_type not in (
    'order.created',
    'order.status_changed',
    'order.cancelled',
    'return.submitted',
    'return.inspected'
  ) then
    raise exception 'unsupported stock event type';
  end if;
  if v_external_reference is null then
    raise exception 'externalReference is required';
  end if;
  if nullif(btrim(p_event->>'occurredAt'), '') is null then
    raise exception 'occurredAt is required';
  end if;

  v_occurred_at := (p_event->>'occurredAt')::timestamptz;
  if v_payload is null or jsonb_typeof(v_payload) <> 'object' then
    raise exception 'event payload.payload must be a JSON object';
  end if;

  v_fingerprint := encode(
    sha256(convert_to(p_event::text, 'UTF8')),
    'hex'
  );

  -- The unique insert is the concurrency arbiter. It precedes every workflow
  -- or ledger side effect and rolls back with any later exception.
  insert into public.event_log (
    event_type,
    idempotency_key,
    payload,
    status,
    payload_fingerprint,
    channel,
    external_reference,
    occurred_at,
    created_at
  ) values (
    v_event_type,
    v_idempotency_key,
    p_event,
    'processed',
    v_fingerprint,
    v_channel,
    v_external_reference,
    v_occurred_at,
    statement_timestamp()
  )
  on conflict (idempotency_key) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select
      public.event_log.payload_fingerprint,
      public.event_log.result
    into
      v_existing_fingerprint,
      v_existing_result
    from public.event_log
    where public.event_log.idempotency_key = v_idempotency_key
    for update;

    if v_existing_fingerprint is distinct from v_fingerprint then
      raise exception 'idempotency conflict: key reused with different content';
    end if;
    if v_existing_result is null then
      raise exception 'idempotency conflict: prior event has no stored result';
    end if;

    return v_existing_result || jsonb_build_object('duplicate', true);
  end if;

  select public.channels.id
  into v_channel_id
  from public.channels
  where upper(public.channels.code) = upper(v_channel)
    and public.channels.is_active
  order by public.channels.id
  limit 1;

  if v_channel_id is null then
    raise exception 'configured channel % not found', v_channel;
  end if;

  if v_event_type = 'order.created' then
    v_lines := v_payload->'items';
    if v_lines is null
       or jsonb_typeof(v_lines) <> 'array'
       or jsonb_array_length(v_lines) = 0 then
      raise exception 'order.created requires at least one item';
    end if;

    if exists (
      select 1
      from public.orders
      where public.orders.order_number = v_external_reference
    ) then
      raise exception 'order external reference already exists';
    end if;

    insert into public.orders (
      order_number,
      channel_id,
      status,
      created_at,
      created_by,
      last_event_at
    ) values (
      v_external_reference,
      v_channel_id,
      'RESERVED',
      v_occurred_at,
      v_actor,
      v_occurred_at
    ) returning id into v_order_id;

    for v_item in
      select item.value
      from jsonb_array_elements(v_lines) with ordinality as item(value, position)
      order by item.position
    loop
      if jsonb_typeof(v_item) <> 'object' then
        raise exception 'order item must be a JSON object';
      end if;
      if nullif(btrim(v_item->>'lineReference'), '') is null then
        raise exception 'order item lineReference is required';
      end if;

      v_quantity := (v_item->>'quantity')::integer;
      if v_quantity is null or v_quantity <= 0 then
        raise exception 'order item quantity must be positive';
      end if;

      v_product_id := null;
      v_bundle_id := null;
      v_recipe_version_id := null;
      v_component_snapshot := null;

      select public.products.id
      into v_product_id
      from public.products
      where public.products.sku = v_item->>'sku'
        and public.products.is_active
      order by public.products.id
      limit 1;

      if v_product_id is not null then
        v_component_snapshot := jsonb_build_array(
          jsonb_build_object(
            'productId', v_product_id,
            'quantity', 1
          )
        );
      else
        select public.bundles.id
        into v_bundle_id
        from public.bundles
        where public.bundles.marketplace_listing = v_item->>'sku'
          and public.bundles.is_active
        order by public.bundles.id
        limit 1;

        if v_bundle_id is null then
          raise exception 'unknown product or bundle SKU %', v_item->>'sku';
        end if;

        select public.bundle_recipe_version.id
        into v_recipe_version_id
        from public.bundles
        join public.bundle_recipe
          on public.bundle_recipe.name = public.bundles.name
         and public.bundle_recipe.is_active
        join public.bundle_recipe_version
          on public.bundle_recipe_version.recipe_id = public.bundle_recipe.id
         and public.bundle_recipe_version.is_active
        where public.bundles.id = v_bundle_id
        order by
          public.bundle_recipe_version.version_no desc,
          public.bundle_recipe_version.id
        limit 1;

        if v_recipe_version_id is not null then
          select jsonb_agg(
            jsonb_build_object(
              'productId', recipe_component.product_id,
              'quantity', recipe_component.quantity
            )
            order by recipe_component.product_id
          )
          into v_component_snapshot
          from (
            select
              public.bundle_recipe_line.product_id,
              sum(public.bundle_recipe_line.quantity)::integer as quantity
            from public.bundle_recipe_line
            where public.bundle_recipe_line.recipe_version_id = v_recipe_version_id
            group by public.bundle_recipe_line.product_id
          ) as recipe_component;
        end if;
      end if;

      insert into public.order_items (
        order_id,
        product_id,
        quantity,
        is_bundle,
        bundle_id,
        recipe_version_id,
        external_line_reference,
        component_snapshot,
        requires_manual_review,
        manual_review_reason
      ) values (
        v_order_id,
        v_product_id,
        v_quantity,
        v_bundle_id is not null,
        v_bundle_id,
        v_recipe_version_id,
        v_item->>'lineReference',
        v_component_snapshot,
        v_bundle_id is not null and v_component_snapshot is null,
        case
          when v_bundle_id is not null and v_component_snapshot is null
            then 'missing_bundle_recipe'
          else null
        end
      );
    end loop;

    v_status := 'reserved';

  elsif v_event_type = 'order.status_changed' then
    v_requested_status := upper(nullif(btrim(v_payload->>'status'), ''));
    if v_requested_status is null then
      raise exception 'order.status_changed requires status';
    end if;

    select
      stock_order.id,
      stock_order.status,
      lower(order_channel.code),
      stock_order.last_event_at
    into
      v_order_id,
      v_order_status,
      v_order_channel,
      v_order_last_event_at
    from public.orders as stock_order
    join public.channels as order_channel on order_channel.id = stock_order.channel_id
    where stock_order.order_number = v_external_reference
    for update of stock_order;

    if v_order_id is null then
      raise exception 'order not found';
    end if;
    if v_order_channel <> v_channel then
      raise exception 'event channel does not match order channel';
    end if;
    if v_order_last_event_at is not null and v_occurred_at <= v_order_last_event_at then
      raise exception 'out-of-order event timestamp';
    end if;

    if v_channel = 'shopee' then
      if not (
        (v_order_status = 'RESERVED' and v_requested_status in ('PROCESSING', 'SHIPPED'))
        or (v_order_status = 'PROCESSING' and v_requested_status = 'SHIPPED')
        or (v_order_status = 'SHIPPED' and v_requested_status = 'DELIVERED')
      ) then
        raise exception 'invalid Shopee transition from % to %', v_order_status, v_requested_status;
      end if;
    else
      if not (
        (v_order_status = 'RESERVED' and v_requested_status in ('PROCESSING', 'IN_TRANSIT'))
        or (v_order_status = 'PROCESSING' and v_requested_status = 'IN_TRANSIT')
        or (v_order_status = 'IN_TRANSIT' and v_requested_status = 'DELIVERED')
      ) then
        raise exception 'invalid TikTok transition from % to %', v_order_status, v_requested_status;
      end if;
    end if;

    if (v_channel = 'shopee' and v_requested_status = 'SHIPPED')
       or (v_channel = 'tiktok' and v_requested_status = 'IN_TRANSIT') then
      if exists (
        select 1
        from public.order_items
        where public.order_items.order_id = v_order_id
          and (
            public.order_items.requires_manual_review
            or public.order_items.component_snapshot is null
          )
      ) then
        update public.orders
        set status = 'MANUAL_REVIEW',
            last_event_at = v_occurred_at
        where public.orders.id = v_order_id;

        v_status := 'manual_review';
      else
        select public.movement_types.id
        into v_movement_type_id
        from public.movement_types
        where public.movement_types.name = 'OUT';

        select public.movement_reasons.id
        into v_reason_id
        from public.movement_reasons
        where public.movement_reasons.code = 'sale_online'
          and public.movement_reasons.direction = 'out';

        if v_movement_type_id is null or v_reason_id is null then
          raise exception 'order fulfillment movement configuration is missing';
        end if;

        -- Components are processed globally by product then item so concurrent
        -- bundle orders acquire FEFO locks in the same order.
        for v_component in
          select
            public.order_items.id as order_item_id,
            (component.value->>'productId')::uuid as product_id,
            (
              (component.value->>'quantity')::integer
              * (public.order_items.quantity - public.order_items.quantity_cancelled)
            )::integer as required_quantity
          from public.order_items
          cross join lateral jsonb_array_elements(
            public.order_items.component_snapshot
          ) as component(value)
          where public.order_items.order_id = v_order_id
            and public.order_items.quantity > public.order_items.quantity_cancelled
          order by 2, 1
        loop
          if v_component.required_quantity <= 0 then
            raise exception 'invalid component snapshot quantity';
          end if;

          v_remaining := v_component.required_quantity;

          -- Strict FEFO waits for locked earlier batches instead of bypassing them.
          for v_batch in
            select
              batch.id,
              summary.balance_qty
            from public.batches as batch
            join public.stock_balance_summary as summary
              on summary.batch_id = batch.id
             and summary.product_id = batch.product_id
            where batch.product_id = v_component.product_id
              and batch.is_active
              and batch.expiry_date >= current_date
              and summary.balance_qty > 0
            order by
              batch.expiry_date,
              batch.created_at,
              batch.id
            for update of summary
          loop
            exit when v_remaining = 0;
            v_take := least(v_batch.balance_qty, v_remaining);
            v_ledger_sequence := v_ledger_sequence + 1;

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
              notes,
              recorded_by,
              created_by,
              source_type,
              idempotency_key,
              created_at
            ) values (
              v_batch.id,
              v_movement_type_id,
              v_reason_id,
              v_channel_id,
              v_take,
              'out',
              v_batch.balance_qty,
              v_batch.balance_qty - v_take,
              v_order_id,
              'Marketplace fulfillment ' || v_external_reference,
              v_actor,
              v_actor,
              'order_fulfillment',
              v_idempotency_key || ':ledger:' || v_ledger_sequence::text,
              v_occurred_at
            ) returning id into v_ledger_id;

            insert into public.fulfillment_allocations (
              order_item_id,
              component_product_id,
              batch_id,
              ledger_id,
              event_id,
              quantity,
              created_at
            ) values (
              v_component.order_item_id,
              v_component.product_id,
              v_batch.id,
              v_ledger_id,
              v_event_id,
              v_take,
              v_occurred_at
            ) returning id into v_allocation_id;

            v_ledger_ids := v_ledger_ids || jsonb_build_array(v_ledger_id);
            v_allocation_ids := v_allocation_ids || jsonb_build_array(v_allocation_id);
            v_remaining := v_remaining - v_take;
          end loop;

          if v_remaining > 0 then
            raise exception 'insufficient stock for product %: short by %',
              v_component.product_id,
              v_remaining;
          end if;
        end loop;

        update public.orders
        set status = v_requested_status,
            shipped_at = coalesce(public.orders.shipped_at, v_occurred_at),
            last_event_at = v_occurred_at
        where public.orders.id = v_order_id;

        v_status := lower(v_requested_status);
      end if;
    else
      update public.orders
      set status = v_requested_status,
          last_event_at = v_occurred_at
      where public.orders.id = v_order_id;

      v_status := lower(v_requested_status);
    end if;

  elsif v_event_type = 'order.cancelled' then
    select
      stock_order.id,
      stock_order.status,
      lower(order_channel.code),
      stock_order.last_event_at
    into
      v_order_id,
      v_order_status,
      v_order_channel,
      v_order_last_event_at
    from public.orders as stock_order
    join public.channels as order_channel on order_channel.id = stock_order.channel_id
    where stock_order.order_number = v_external_reference
    for update of stock_order;

    if v_order_id is null then
      raise exception 'order not found';
    end if;
    if v_order_channel <> v_channel then
      raise exception 'event channel does not match order channel';
    end if;
    if v_order_last_event_at is not null and v_occurred_at <= v_order_last_event_at then
      raise exception 'out-of-order event timestamp';
    end if;
    if v_order_status not in ('RESERVED', 'PROCESSING', 'SHIPPED', 'IN_TRANSIT') then
      raise exception 'invalid cancellation transition from %', v_order_status;
    end if;
    if (v_channel = 'shopee' and v_order_status = 'IN_TRANSIT')
       or (v_channel = 'tiktok' and v_order_status = 'SHIPPED') then
      raise exception 'invalid channel cancellation state';
    end if;

    -- Lock all item counters in stable order before interpreting full/partial lines.
    perform public.order_items.id
    from public.order_items
    where public.order_items.order_id = v_order_id
    order by public.order_items.id
    for update;

    if v_payload ? 'lines' then
      v_lines := v_payload->'lines';
      if jsonb_typeof(v_lines) <> 'array' or jsonb_array_length(v_lines) = 0 then
        raise exception 'cancellation lines must be a non-empty array';
      end if;
    else
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'lineReference', public.order_items.external_line_reference,
            'quantity', public.order_items.quantity - public.order_items.quantity_cancelled
          )
          order by public.order_items.id
        ),
        '[]'::jsonb
      )
      into v_lines
      from public.order_items
      where public.order_items.order_id = v_order_id
        and public.order_items.quantity > public.order_items.quantity_cancelled;
    end if;

    v_processed_count := 0;
    v_total_count := jsonb_array_length(v_lines);

    for v_line in
      select line.value
      from jsonb_array_elements(v_lines) as line(value)
      order by line.value->>'lineReference'
    loop
      v_requested_quantity := (v_line->>'quantity')::integer;
      if nullif(btrim(v_line->>'lineReference'), '') is null
         or v_requested_quantity is null
         or v_requested_quantity <= 0 then
        raise exception 'cancellation line reference and positive quantity are required';
      end if;

      select public.order_items.*
      into v_order_item
      from public.order_items
      where public.order_items.order_id = v_order_id
        and public.order_items.external_line_reference = v_line->>'lineReference';

      if v_order_item.id is null then
        raise exception 'cancellation line not found';
      end if;
      if v_requested_quantity > v_order_item.quantity - v_order_item.quantity_cancelled then
        raise exception 'cancellation exceeds remaining item quantity';
      end if;

      if v_order_status in ('SHIPPED', 'IN_TRANSIT') then
        for v_component in
          select
            (component.value->>'productId')::uuid as product_id,
            (component.value->>'quantity')::integer * v_requested_quantity
              as required_quantity
          from jsonb_array_elements(v_order_item.component_snapshot) as component(value)
          order by 1
        loop
          v_remaining := v_component.required_quantity;

          for v_allocation in
            select
              allocation.id,
              allocation.batch_id,
              allocation.ledger_id,
              allocation.quantity
                - coalesce((
                    select sum(public.stock_ledger.quantity)
                    from public.stock_ledger
                    where public.stock_ledger.source_type = 'order_cancel_reversal'
                      and public.stock_ledger.source_ref_id = allocation.ledger_id
                  ), 0) as reversible_quantity
            from public.fulfillment_allocations as allocation
            where allocation.order_item_id = v_order_item.id
              and allocation.component_product_id = v_component.product_id
            order by
              allocation.created_at,
              allocation.id
            for update of allocation
          loop
            exit when v_remaining = 0;
            if v_allocation.reversible_quantity <= 0 then
              continue;
            end if;

            v_take := least(v_allocation.reversible_quantity, v_remaining);

            select public.stock_balance_summary.balance_qty
            into v_before
            from public.stock_balance_summary
            where public.stock_balance_summary.batch_id = v_allocation.batch_id
            for update;

            if v_before is null then
              raise exception 'allocation batch balance not found';
            end if;

            select public.movement_types.id
            into v_movement_type_id
            from public.movement_types
            where public.movement_types.name = 'IN';

            select public.movement_reasons.id
            into v_reason_id
            from public.movement_reasons
            where public.movement_reasons.code = 'cancellation'
              and public.movement_reasons.direction = 'in';

            if v_movement_type_id is null or v_reason_id is null then
              raise exception 'cancellation movement configuration is missing';
            end if;

            v_ledger_sequence := v_ledger_sequence + 1;
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
              notes,
              recorded_by,
              created_by,
              source_type,
              source_ref_id,
              idempotency_key,
              created_at
            ) values (
              v_allocation.batch_id,
              v_movement_type_id,
              v_reason_id,
              v_channel_id,
              v_take,
              'in',
              v_before,
              v_before + v_take,
              v_order_id,
              'Marketplace cancellation ' || v_external_reference,
              v_actor,
              v_actor,
              'order_cancel_reversal',
              v_allocation.ledger_id,
              v_idempotency_key || ':ledger:' || v_ledger_sequence::text,
              v_occurred_at
            ) returning id into v_ledger_id;

            v_ledger_ids := v_ledger_ids || jsonb_build_array(v_ledger_id);
            v_remaining := v_remaining - v_take;
          end loop;

          if v_remaining > 0 then
            raise exception 'cancellation exceeds remaining fulfilled allocation quantity';
          end if;
        end loop;
      end if;

      update public.order_items
      set quantity_cancelled = public.order_items.quantity_cancelled + v_requested_quantity
      where public.order_items.id = v_order_item.id;

      v_processed_count := v_processed_count + 1;
    end loop;

    if v_processed_count <> v_total_count then
      raise exception 'not all cancellation lines were processed';
    end if;

    if not exists (
      select 1
      from public.order_items
      where public.order_items.order_id = v_order_id
        and public.order_items.quantity_cancelled < public.order_items.quantity
    ) then
      update public.orders
      set status = 'CANCELLED',
          cancelled_at = v_occurred_at,
          cancellation_reason = nullif(v_payload->>'reason', ''),
          last_event_at = v_occurred_at
      where public.orders.id = v_order_id;
      v_status := 'cancelled';
    else
      update public.orders
      set last_event_at = v_occurred_at
      where public.orders.id = v_order_id;
      v_status := 'partially_cancelled';
    end if;

  elsif v_event_type = 'return.submitted' then
    v_lines := v_payload->'lines';
    if v_lines is null
       or jsonb_typeof(v_lines) <> 'array'
       or jsonb_array_length(v_lines) = 0 then
      raise exception 'return.submitted requires at least one line';
    end if;

    v_order_id := nullif(v_payload->>'orderId', '')::uuid;
    if v_order_id is null then
      raise exception 'return orderId is required';
    end if;

    select case
      when upper(order_channel.code) like 'SHOPEE%' then 'shopee'
      when upper(order_channel.code) like 'TIKTOK%' then 'tiktok'
      else null
    end
    into v_order_channel
    from public.orders as stock_order
    join public.channels as order_channel on order_channel.id = stock_order.channel_id
    where stock_order.id = v_order_id
    for update of stock_order;

    if v_order_channel is null then
      raise exception 'return order not found';
    end if;
    if v_order_channel <> v_channel then
      raise exception 'return channel does not match order channel';
    end if;

    insert into public.returns (
      order_id,
      return_date,
      condition,
      claim_deadline,
      claim_status,
      created_at,
      external_reference,
      reported_at,
      event_id
    ) values (
      v_order_id,
      v_occurred_at::date,
      'PENDING_INSPECTION',
      case when v_channel = 'tiktok' then (v_occurred_at + interval '40 days')::date else null end,
      case when v_channel = 'tiktok' then 'PENDING' else 'NONE' end,
      v_occurred_at,
      v_external_reference,
      v_occurred_at,
      v_event_id
    ) returning id into v_return_id;

    for v_line in
      select line.value
      from jsonb_array_elements(v_lines) with ordinality as line(value, position)
      order by line.position
    loop
      v_allocation_id := coalesce(
        nullif(v_line->>'fulfillmentAllocationId', '')::uuid,
        nullif(v_line->>'fulfilledComponentId', '')::uuid
      );
      v_quantity := (v_line->>'quantity')::integer;

      if v_allocation_id is null or v_quantity is null or v_quantity <= 0 then
        raise exception 'return line allocation and positive quantity are required';
      end if;

      select
        allocation.id,
        allocation.order_item_id,
        allocation.ledger_id,
        allocation.quantity
      into v_allocation
      from public.fulfillment_allocations as allocation
      join public.order_items as order_item
        on order_item.id = allocation.order_item_id
      where allocation.id = v_allocation_id
        and order_item.order_id = v_order_id
      for update of allocation;

      if v_allocation.id is null then
        raise exception 'return fulfillment allocation not found for order';
      end if;

      select
        v_allocation.quantity
        - coalesce((
            select sum(public.stock_ledger.quantity)
            from public.stock_ledger
            where public.stock_ledger.source_type = 'order_cancel_reversal'
              and public.stock_ledger.source_ref_id = v_allocation.ledger_id
          ), 0)
        - coalesce((
            select sum(public.return_lines.quantity)
            from public.return_lines
            where public.return_lines.fulfillment_allocation_id = v_allocation.id
          ), 0)
      into v_remaining;

      if v_quantity > v_remaining then
        raise exception 'return quantity exceeds remaining fulfilled quantity';
      end if;

      insert into public.return_lines (
        return_id,
        fulfillment_allocation_id,
        quantity,
        created_at
      ) values (
        v_return_id,
        v_allocation.id,
        v_quantity,
        v_occurred_at
      );
    end loop;

    v_status := 'pending_inspection';

  else
    v_return_reference := nullif(btrim(v_payload->>'returnReference'), '');
    v_lines := v_payload->'lines';
    if v_return_reference is null then
      raise exception 'return.inspected requires returnReference';
    end if;
    if v_lines is null
       or jsonb_typeof(v_lines) <> 'array'
       or jsonb_array_length(v_lines) = 0 then
      raise exception 'return.inspected requires at least one line';
    end if;

    select
      return_case.id,
      return_case.order_id,
      return_case.reported_at,
      case
        when upper(order_channel.code) like 'SHOPEE%' then 'shopee'
        when upper(order_channel.code) like 'TIKTOK%' then 'tiktok'
        else null
      end
    into
      v_return_id,
      v_order_id,
      v_return_reported_at,
      v_order_channel
    from public.returns as return_case
    join public.orders as stock_order on stock_order.id = return_case.order_id
    join public.channels as order_channel on order_channel.id = stock_order.channel_id
    where return_case.external_reference = v_return_reference
    for update of return_case;

    if v_return_id is null then
      raise exception 'return case not found';
    end if;
    if v_order_channel is null or v_order_channel <> v_channel then
      raise exception 'inspection channel does not match return order channel';
    end if;
    if v_occurred_at < v_return_reported_at then
      raise exception 'return inspection cannot predate submission';
    end if;

    for v_line in
      select line.value
      from jsonb_array_elements(v_lines) with ordinality as line(value, position)
      order by line.position
    loop
      v_allocation_id := coalesce(
        nullif(v_line->>'fulfillmentAllocationId', '')::uuid,
        nullif(v_line->>'fulfilledComponentId', '')::uuid
      );
      v_condition := lower(nullif(btrim(v_line->>'condition'), ''));

      if v_allocation_id is null
         or v_condition is null
         or v_condition not in ('resellable', 'damaged', 'lost_in_transit') then
        raise exception 'inspection line requires allocation and explicit valid condition';
      end if;

      select
        return_line.id,
        return_line.quantity,
        return_line.condition,
        allocation.component_product_id
      into v_return_line
      from public.return_lines as return_line
      join public.fulfillment_allocations as allocation
        on allocation.id = return_line.fulfillment_allocation_id
      where return_line.return_id = v_return_id
        and return_line.fulfillment_allocation_id = v_allocation_id
      for update of return_line;

      if v_return_line.id is null then
        raise exception 'submitted return line not found';
      end if;
      if v_return_line.condition is not null then
        raise exception 'return line is already inspected';
      end if;
      if v_line ? 'quantity'
         and (v_line->>'quantity')::integer <> v_return_line.quantity then
        raise exception 'inspection quantity must equal submitted return quantity';
      end if;

      if v_condition = 'resellable' then
        v_batch_number := coalesce(
          nullif(btrim(v_line->>'batchCode'), ''),
          'RET-' || replace(v_return_reference, ' ', '-') || '-' || substr(v_return_line.id::text, 1, 8)
        );
        v_production_date := coalesce(
          nullif(v_line->>'receivedAt', '')::date,
          v_occurred_at::date
        );
        v_expiry_date := coalesce(
          nullif(v_line->>'expiryDate', '')::date,
          (v_occurred_at + interval '1 year')::date
        );

        if v_expiry_date < v_production_date then
          raise exception 'return batch expiryDate must not precede receivedAt';
        end if;

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
          v_return_line.component_product_id,
          v_batch_number,
          v_production_date,
          v_expiry_date,
          0,
          0,
          'retur',
          true,
          v_occurred_at
        ) returning id into v_batch_id;

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
          raise exception 'sellable return movement configuration is missing';
        end if;

        v_ledger_sequence := v_ledger_sequence + 1;
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
          v_return_line.quantity,
          'in',
          0,
          v_return_line.quantity,
          v_order_id,
          v_return_id,
          coalesce(nullif(v_line->>'notes', ''), 'Sellable marketplace return'),
          v_actor,
          v_actor,
          'return_resellable',
          v_idempotency_key || ':ledger:' || v_ledger_sequence::text,
          v_occurred_at
        ) returning id into v_ledger_id;

        v_ledger_ids := v_ledger_ids || jsonb_build_array(v_ledger_id);
      else
        insert into public.claim_loss_record (
          return_case_id,
          type,
          claim_status,
          notes,
          created_at,
          created_by,
          return_line_id,
          quantity
        ) values (
          v_return_id,
          v_condition,
          'pending',
          nullif(v_line->>'notes', ''),
          v_occurred_at,
          v_actor,
          v_return_line.id,
          v_return_line.quantity
        ) returning id into v_claim_id;

        v_claim_ids := v_claim_ids || jsonb_build_array(v_claim_id);
      end if;

      update public.return_lines
      set condition = v_condition,
          inspected_at = v_occurred_at,
          inspected_by = v_actor
      where public.return_lines.id = v_return_line.id;
    end loop;

    select
      count(*) filter (where public.return_lines.condition is null),
      count(distinct public.return_lines.condition)
        filter (where public.return_lines.condition is not null)
    into v_uninspected_count, v_condition_count
    from public.return_lines
    where public.return_lines.return_id = v_return_id;

    if v_uninspected_count = 0 then
      update public.returns
      set condition = case
            when v_condition_count = 1 then (
              select case min(public.return_lines.condition)
                when 'resellable' then 'RESALABLE'
                when 'damaged' then 'DAMAGED'
                when 'lost_in_transit' then 'LOST'
              end
              from public.return_lines
              where public.return_lines.return_id = v_return_id
            )
            else public.returns.condition
          end,
          inspected_at = v_occurred_at,
          inspected_by = v_actor
      where public.returns.id = v_return_id;

      update public.orders
      set status = 'RETURNED'
      where public.orders.id = v_order_id;
      v_status := 'inspected';
    else
      v_status := 'pending_inspection';
    end if;
  end if;

  v_result := jsonb_build_object(
    'eventId', v_event_id,
    'duplicate', false,
    'status', v_status,
    'ledgerEntryIds', v_ledger_ids,
    'allocationIds', v_allocation_ids,
    'claimRecordIds', v_claim_ids
  );

  update public.event_log
  set result = v_result,
      processed_at = statement_timestamp(),
      status = 'processed',
      error_message = null
  where public.event_log.id = v_event_id;

  return v_result;
end;
$$;

revoke all on function public.process_stock_event(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.process_stock_event(jsonb) to authenticated;

comment on function public.process_stock_event(jsonb) is
  'Authenticated atomic event seam for marketplace orders, exact cancellation, and bounded return handling.';
