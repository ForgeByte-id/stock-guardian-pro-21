begin;

reset role;
create extension if not exists dblink with schema extensions;

-- Arrange: deterministic fixture data and authenticated admin request context.
\ir 00_test_helpers.inc

reset role;

-- Arrange: fixed FEFO candidates. Valid stock totals 16 units; expired and
-- inactive stock must never be considered.
update public.batches
set expiry_date = '2099-01-01', created_at = '2026-01-01 00:00:00+00'
where id = '40000000-0000-4000-8000-000000000001';

update public.batches
set expiry_date = '2099-04-01', created_at = '2026-01-01 00:00:00+00'
where id = '40000000-0000-4000-8000-000000000002';

insert into public.batches (
  id, product_id, batch_number, production_date, expiry_date,
  initial_stock, current_stock, origin, is_active, created_at
) values
  (
    '40000000-0000-4000-8000-000000000003',
    '30000000-0000-4000-8000-000000000001',
    'FIX-SERUM-TIE-A', '2026-01-01', '2099-02-01', 0, 0, 'maklon', true,
    '2026-01-02 00:00:00+00'
  ),
  (
    '40000000-0000-4000-8000-000000000004',
    '30000000-0000-4000-8000-000000000001',
    'FIX-SERUM-TIE-B', '2026-01-01', '2099-02-01', 0, 0, 'maklon', true,
    '2026-01-02 00:00:00+00'
  ),
  (
    '40000000-0000-4000-8000-000000000005',
    '30000000-0000-4000-8000-000000000001',
    'FIX-SERUM-LATE', '2026-01-01', '2099-03-01', 0, 0, 'maklon', true,
    '2026-01-03 00:00:00+00'
  ),
  (
    '40000000-0000-4000-8000-000000000006',
    '30000000-0000-4000-8000-000000000001',
    'FIX-SERUM-EXPIRED', '1999-01-01', '2000-01-01', 0, 0, 'maklon', true,
    '1999-01-01 00:00:00+00'
  ),
  (
    '40000000-0000-4000-8000-000000000007',
    '30000000-0000-4000-8000-000000000001',
    'FIX-SERUM-INACTIVE', '2026-01-01', '2098-01-01', 0, 0, 'maklon', false,
    '2026-01-01 00:00:00+00'
  );

insert into public.stock_ledger (
  id, batch_id, movement_type_id, reason_id, quantity, direction,
  stock_before, stock_after, source_type, recorded_by, created_at
)
select
  fixture.ledger_id,
  fixture.batch_id,
  movement_type.id,
  reason.id,
  fixture.quantity,
  'in',
  0,
  fixture.quantity,
  'initial_balance',
  '10000000-0000-4000-8000-000000000001',
  '2026-08-04 00:00:00+00'
from (
  values
    ('70000000-0000-4000-8000-000000000001'::uuid, '40000000-0000-4000-8000-000000000001'::uuid, 2),
    ('70000000-0000-4000-8000-000000000002'::uuid, '40000000-0000-4000-8000-000000000003'::uuid, 2),
    ('70000000-0000-4000-8000-000000000003'::uuid, '40000000-0000-4000-8000-000000000004'::uuid, 2),
    ('70000000-0000-4000-8000-000000000004'::uuid, '40000000-0000-4000-8000-000000000005'::uuid, 10),
    ('70000000-0000-4000-8000-000000000005'::uuid, '40000000-0000-4000-8000-000000000006'::uuid, 100),
    ('70000000-0000-4000-8000-000000000006'::uuid, '40000000-0000-4000-8000-000000000007'::uuid, 100),
    ('70000000-0000-4000-8000-000000000007'::uuid, '40000000-0000-4000-8000-000000000002'::uuid, 20)
) as fixture(ledger_id, batch_id, quantity)
cross join lateral (
  select id from public.movement_types where name = 'IN'
) as movement_type
cross join lateral (
  select id from public.movement_reasons where code = 'initial_stock'
) as reason;

update public.bundles
set marketplace_listing = 'FIX-BUNDLE'
where id = '50000000-0000-4000-8000-000000000004';

create temporary table stock_event_test_results (
  name text primary key,
  result jsonb not null
) on commit drop;

grant all on table stock_event_test_results to authenticated;

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local role authenticated;

select plan(79);

-- Act and Assert: the frozen public event-engine contract must exist.
select has_function(
  'public',
  'process_stock_event',
  array['jsonb'],
  'process_stock_event(jsonb) exists'
);

select (to_regprocedure('public.process_stock_event(jsonb)') is not null)::text
  as stock_event_engine_exists \gset

\if :stock_event_engine_exists

-- Shopee cutoff (BR-01, FR-402–FR-404).
savepoint shopee_cutoff;

-- Arrange: a two-unit Shopee reservation.
-- Act: create it and move it to the last pre-cutoff status.
select lives_ok(
  $test$
    insert into stock_event_test_results values (
      'shopee.created',
      public.process_stock_event('{
        "idempotencyKey":"evt-shopee-create",
        "channel":"shopee",
        "type":"order.created",
        "occurredAt":"2026-08-04T01:00:00Z",
        "externalReference":"EXT-SHOPEE-CUTOFF",
        "payload":{"items":[{"lineReference":"line-1","sku":"FIX-SERUM","quantity":2}]}
      }'::jsonb)
    )
  $test$,
  'Shopee order creation is accepted as a reservation'
);

select lives_ok(
  $test$
    insert into stock_event_test_results values (
      'shopee.processing',
      public.process_stock_event('{
        "idempotencyKey":"evt-shopee-processing",
        "channel":"shopee",
        "type":"order.status_changed",
        "occurredAt":"2026-08-04T01:01:00Z",
        "externalReference":"EXT-SHOPEE-CUTOFF",
        "payload":{"status":"PROCESSING"}
      }'::jsonb)
    )
  $test$,
  'Shopee PROCESSING is accepted before cutoff'
);

-- Assert: no stock movement occurs before SHIPPED.
select is(
  (
    select count(*)::bigint
    from public.stock_ledger ledger
    join public.orders orders on orders.id = ledger.order_id
    where orders.order_number = 'EXT-SHOPEE-CUTOFF'
  ),
  0::bigint,
  'Shopee PROCESSING creates no ledger movement'
);

-- Act: cross the Shopee cutoff.
select lives_ok(
  $test$
    insert into stock_event_test_results values (
      'shopee.shipped',
      public.process_stock_event('{
        "idempotencyKey":"evt-shopee-shipped",
        "channel":"shopee",
        "type":"order.status_changed",
        "occurredAt":"2026-08-04T01:02:00Z",
        "externalReference":"EXT-SHOPEE-CUTOFF",
        "payload":{"status":"SHIPPED"}
      }'::jsonb)
    )
  $test$,
  'Shopee SHIPPED is accepted at cutoff'
);

-- Assert: SHIPPED deducts exactly once.
select is(
  (
    select coalesce(sum(ledger.quantity), 0)::bigint
    from public.stock_ledger ledger
    join public.orders orders on orders.id = ledger.order_id
    where orders.order_number = 'EXT-SHOPEE-CUTOFF'
      and ledger.source_type = 'order_fulfillment'
      and ledger.direction = 'out'
  ),
  2::bigint,
  'Shopee SHIPPED deducts the reserved quantity'
);

rollback to savepoint shopee_cutoff;

-- TikTok cutoff (BR-01, FR-402–FR-404).
savepoint tiktok_cutoff;

-- Arrange and Act: create a TikTok order and stop at PROCESSING.
select lives_ok(
  $test$
    insert into stock_event_test_results values (
      'tiktok.created',
      public.process_stock_event('{
        "idempotencyKey":"evt-tiktok-create",
        "channel":"tiktok",
        "type":"order.created",
        "occurredAt":"2026-08-04T02:00:00Z",
        "externalReference":"EXT-TIKTOK-CUTOFF",
        "payload":{"items":[{"lineReference":"line-1","sku":"FIX-SERUM","quantity":2}]}
      }'::jsonb)
    )
  $test$,
  'TikTok order creation is accepted as a reservation'
);

select lives_ok(
  $test$
    insert into stock_event_test_results values (
      'tiktok.processing',
      public.process_stock_event('{
        "idempotencyKey":"evt-tiktok-processing",
        "channel":"tiktok",
        "type":"order.status_changed",
        "occurredAt":"2026-08-04T02:01:00Z",
        "externalReference":"EXT-TIKTOK-CUTOFF",
        "payload":{"status":"PROCESSING"}
      }'::jsonb)
    )
  $test$,
  'TikTok PROCESSING is accepted before cutoff'
);

-- Assert: no stock movement occurs before IN_TRANSIT.
select is(
  (
    select count(*)::bigint
    from public.stock_ledger ledger
    join public.orders orders on orders.id = ledger.order_id
    where orders.order_number = 'EXT-TIKTOK-CUTOFF'
  ),
  0::bigint,
  'TikTok PROCESSING creates no ledger movement'
);

-- Act: cross the TikTok cutoff.
select lives_ok(
  $test$
    insert into stock_event_test_results values (
      'tiktok.in-transit',
      public.process_stock_event('{
        "idempotencyKey":"evt-tiktok-in-transit",
        "channel":"tiktok",
        "type":"order.status_changed",
        "occurredAt":"2026-08-04T02:02:00Z",
        "externalReference":"EXT-TIKTOK-CUTOFF",
        "payload":{"status":"IN_TRANSIT"}
      }'::jsonb)
    )
  $test$,
  'TikTok IN_TRANSIT is accepted at cutoff'
);

-- Assert: IN_TRANSIT deducts exactly once.
select is(
  (
    select coalesce(sum(ledger.quantity), 0)::bigint
    from public.stock_ledger ledger
    join public.orders orders on orders.id = ledger.order_id
    where orders.order_number = 'EXT-TIKTOK-CUTOFF'
      and ledger.source_type = 'order_fulfillment'
      and ledger.direction = 'out'
  ),
  2::bigint,
  'TikTok IN_TRANSIT deducts the reserved quantity'
);

rollback to savepoint tiktok_cutoff;

-- Full cancellation before cutoff (BR-01, FR-405).
savepoint full_cancel_before_cutoff;

-- Arrange and Act: reserve, then fully cancel without crossing cutoff.
select lives_ok(
  $test$
    insert into stock_event_test_results values (
      'full-pre.created',
      public.process_stock_event('{
        "idempotencyKey":"evt-full-pre-create",
        "channel":"shopee",
        "type":"order.created",
        "occurredAt":"2026-08-04T03:00:00Z",
        "externalReference":"EXT-FULL-PRE",
        "payload":{"items":[{"lineReference":"line-1","sku":"FIX-SERUM","quantity":3}]}
      }'::jsonb)
    )
  $test$,
  'Full pre-cutoff cancellation fixture is reserved'
);

select lives_ok(
  $test$
    insert into stock_event_test_results values (
      'full-pre.cancelled',
      public.process_stock_event('{
        "idempotencyKey":"evt-full-pre-cancel",
        "channel":"shopee",
        "type":"order.cancelled",
        "occurredAt":"2026-08-04T03:01:00Z",
        "externalReference":"EXT-FULL-PRE",
        "payload":{}
      }'::jsonb)
    )
  $test$,
  'Full cancellation is accepted before cutoff'
);

-- Assert: cancellation only releases the reservation.
select is(
  (
    select count(*)::bigint
    from public.stock_ledger ledger
    join public.orders orders on orders.id = ledger.order_id
    where orders.order_number = 'EXT-FULL-PRE'
  ),
  0::bigint,
  'Full cancellation before cutoff writes no ledger rows'
);

select is(
  (select status from public.orders where order_number = 'EXT-FULL-PRE'),
  'CANCELLED',
  'Full cancellation before cutoff closes the order'
);

rollback to savepoint full_cancel_before_cutoff;

-- Partial cancellation before cutoff (BR-01, FR-405).
savepoint partial_cancel_before_cutoff;

-- Arrange: reserve two units on one external line.
select lives_ok(
  $test$
    insert into stock_event_test_results values (
      'partial-pre.created',
      public.process_stock_event('{
        "idempotencyKey":"evt-partial-pre-create",
        "channel":"shopee",
        "type":"order.created",
        "occurredAt":"2026-08-04T04:00:00Z",
        "externalReference":"EXT-PARTIAL-PRE",
        "payload":{"items":[{"lineReference":"line-1","sku":"FIX-SERUM","quantity":2}]}
      }'::jsonb)
    )
  $test$,
  'Partial pre-cutoff cancellation fixture is reserved'
);

-- Act: cancel one unit, then ship the remainder.
select lives_ok(
  $test$
    insert into stock_event_test_results values (
      'partial-pre.cancelled',
      public.process_stock_event('{
        "idempotencyKey":"evt-partial-pre-cancel",
        "channel":"shopee",
        "type":"order.cancelled",
        "occurredAt":"2026-08-04T04:01:00Z",
        "externalReference":"EXT-PARTIAL-PRE",
        "payload":{"lines":[{"lineReference":"line-1","quantity":1}]}
      }'::jsonb)
    )
  $test$,
  'Partial cancellation is accepted before cutoff'
);

select lives_ok(
  $test$
    insert into stock_event_test_results values (
      'partial-pre.shipped',
      public.process_stock_event('{
        "idempotencyKey":"evt-partial-pre-ship",
        "channel":"shopee",
        "type":"order.status_changed",
        "occurredAt":"2026-08-04T04:02:00Z",
        "externalReference":"EXT-PARTIAL-PRE",
        "payload":{"status":"SHIPPED"}
      }'::jsonb)
    )
  $test$,
  'The uncancelled remainder can cross cutoff'
);

-- Assert: only the uncancelled unit is fulfilled and no reversal is needed.
select is(
  (
    select coalesce(sum(ledger.quantity), 0)::bigint
    from public.stock_ledger ledger
    join public.orders orders on orders.id = ledger.order_id
    where orders.order_number = 'EXT-PARTIAL-PRE'
      and ledger.source_type = 'order_fulfillment'
  ),
  1::bigint,
  'Partial cancellation before cutoff deducts only the remaining quantity'
);

select is(
  (
    select count(*)::bigint
    from public.stock_ledger ledger
    join public.orders orders on orders.id = ledger.order_id
    where orders.order_number = 'EXT-PARTIAL-PRE'
      and ledger.source_type = 'order_cancel_reversal'
  ),
  0::bigint,
  'Partial cancellation before cutoff needs no reversal'
);

rollback to savepoint partial_cancel_before_cutoff;

-- Full cancellation after cutoff uses every exact fulfillment allocation.
savepoint full_cancel_after_cutoff;

-- Arrange and Act: fulfill across multiple FEFO batches, then cancel all.
select lives_ok(
  $test$
    insert into stock_event_test_results values (
      'full-post.created',
      public.process_stock_event('{
        "idempotencyKey":"evt-full-post-create",
        "channel":"shopee",
        "type":"order.created",
        "occurredAt":"2026-08-04T05:00:00Z",
        "externalReference":"EXT-FULL-POST",
        "payload":{"items":[{"lineReference":"line-1","sku":"FIX-SERUM","quantity":5}]}
      }'::jsonb)
    )
  $test$,
  'Full post-cutoff cancellation fixture is reserved'
);

select lives_ok(
  $test$
    insert into stock_event_test_results values (
      'full-post.shipped',
      public.process_stock_event('{
        "idempotencyKey":"evt-full-post-ship",
        "channel":"shopee",
        "type":"order.status_changed",
        "occurredAt":"2026-08-04T05:01:00Z",
        "externalReference":"EXT-FULL-POST",
        "payload":{"status":"SHIPPED"}
      }'::jsonb)
    )
  $test$,
  'Full post-cutoff fixture crosses cutoff'
);

select lives_ok(
  $test$
    insert into stock_event_test_results values (
      'full-post.cancelled',
      public.process_stock_event('{
        "idempotencyKey":"evt-full-post-cancel",
        "channel":"shopee",
        "type":"order.cancelled",
        "occurredAt":"2026-08-04T05:02:00Z",
        "externalReference":"EXT-FULL-POST",
        "payload":{}
      }'::jsonb)
    )
  $test$,
  'Full cancellation is accepted after cutoff'
);

-- Assert: exact fulfilled quantity is reversed into the same batches.
select results_eq(
  $test$
    select
      ledger.batch_id::text,
      sum(case when ledger.source_type = 'order_fulfillment' then ledger.quantity else 0 end)::bigint as fulfilled,
      sum(case when ledger.source_type = 'order_cancel_reversal' then ledger.quantity else 0 end)::bigint as reversed
    from public.stock_ledger ledger
    join public.orders orders on orders.id = ledger.order_id
    where orders.order_number = 'EXT-FULL-POST'
    group by ledger.batch_id
    order by ledger.batch_id
  $test$,
  $test$
    values
      ('40000000-0000-4000-8000-000000000001'::text, 2::bigint, 2::bigint),
      ('40000000-0000-4000-8000-000000000003'::text, 2::bigint, 2::bigint),
      ('40000000-0000-4000-8000-000000000004'::text, 1::bigint, 1::bigint)
  $test$,
  'Full post-cutoff cancellation reverses each original allocation batch'
);

select is(
  (
    select coalesce(sum(case when ledger.direction = 'in' then ledger.quantity else -ledger.quantity end), 0)::bigint
    from public.stock_ledger ledger
    join public.orders orders on orders.id = ledger.order_id
    where orders.order_number = 'EXT-FULL-POST'
  ),
  0::bigint,
  'Full post-cutoff cancellation has zero net stock effect'
);

rollback to savepoint full_cancel_after_cutoff;

-- Partial cancellation after cutoff reverses only the requested fulfilled quantity.
savepoint partial_cancel_after_cutoff;

-- Arrange and Act: fulfill two units from one batch, then cancel one.
select lives_ok(
  $test$
    insert into stock_event_test_results values (
      'partial-post.created',
      public.process_stock_event('{
        "idempotencyKey":"evt-partial-post-create",
        "channel":"shopee",
        "type":"order.created",
        "occurredAt":"2026-08-04T06:00:00Z",
        "externalReference":"EXT-PARTIAL-POST",
        "payload":{"items":[{"lineReference":"line-1","sku":"FIX-SERUM","quantity":2}]}
      }'::jsonb)
    )
  $test$,
  'Partial post-cutoff cancellation fixture is reserved'
);

select lives_ok(
  $test$
    insert into stock_event_test_results values (
      'partial-post.shipped',
      public.process_stock_event('{
        "idempotencyKey":"evt-partial-post-ship",
        "channel":"shopee",
        "type":"order.status_changed",
        "occurredAt":"2026-08-04T06:01:00Z",
        "externalReference":"EXT-PARTIAL-POST",
        "payload":{"status":"SHIPPED"}
      }'::jsonb)
    )
  $test$,
  'Partial post-cutoff fixture crosses cutoff'
);

select lives_ok(
  $test$
    insert into stock_event_test_results values (
      'partial-post.cancelled',
      public.process_stock_event('{
        "idempotencyKey":"evt-partial-post-cancel",
        "channel":"shopee",
        "type":"order.cancelled",
        "occurredAt":"2026-08-04T06:02:00Z",
        "externalReference":"EXT-PARTIAL-POST",
        "payload":{"lines":[{"lineReference":"line-1","quantity":1}]}
      }'::jsonb)
    )
  $test$,
  'Partial cancellation is accepted after cutoff'
);

-- Assert: the original allocation remains traceable and only one unit returns.
select results_eq(
  $test$
    select ledger.source_type::text, ledger.direction, sum(ledger.quantity)::bigint
    from public.stock_ledger ledger
    join public.orders orders on orders.id = ledger.order_id
    where orders.order_number = 'EXT-PARTIAL-POST'
    group by ledger.source_type, ledger.direction
    order by ledger.source_type::text
  $test$,
  $test$
    values
      ('order_cancel_reversal'::text, 'in'::text, 1::bigint),
      ('order_fulfillment'::text, 'out'::text, 2::bigint)
  $test$,
  'Partial post-cutoff cancellation writes one bounded reversal'
);

select results_eq(
  $test$
    select ledger.batch_id::text, ledger.quantity::bigint
    from public.stock_ledger ledger
    join public.orders orders on orders.id = ledger.order_id
    where orders.order_number = 'EXT-PARTIAL-POST'
      and ledger.source_type = 'order_cancel_reversal'
  $test$,
  $test$
    values ('40000000-0000-4000-8000-000000000001'::text, 1::bigint)
  $test$,
  'Partial reversal returns to its exact fulfillment batch'
);

select is(
  (
    select coalesce(sum(case when ledger.direction = 'in' then ledger.quantity else -ledger.quantity end), 0)::bigint
    from public.stock_ledger ledger
    join public.orders orders on orders.id = ledger.order_id
    where orders.order_number = 'EXT-PARTIAL-POST'
  ),
  (-1)::bigint,
  'Partial post-cutoff cancellation leaves one unit fulfilled'
);

rollback to savepoint partial_cancel_after_cutoff;

-- Deterministic sequential FEFO (BR-03, FR-601).
savepoint deterministic_fefo;

-- Arrange and Act: request enough stock to split over expiry and tie breakers.
select lives_ok(
  $test$
    insert into stock_event_test_results values (
      'fefo.created',
      public.process_stock_event('{
        "idempotencyKey":"evt-fefo-create",
        "channel":"shopee",
        "type":"order.created",
        "occurredAt":"2026-08-04T07:00:00Z",
        "externalReference":"EXT-FEFO",
        "payload":{"items":[{"lineReference":"line-1","sku":"FIX-SERUM","quantity":5}]}
      }'::jsonb)
    )
  $test$,
  'FEFO fixture order is reserved'
);

select lives_ok(
  $test$
    insert into stock_event_test_results values (
      'fefo.shipped',
      public.process_stock_event('{
        "idempotencyKey":"evt-fefo-ship",
        "channel":"shopee",
        "type":"order.status_changed",
        "occurredAt":"2026-08-04T07:01:00Z",
        "externalReference":"EXT-FEFO",
        "payload":{"status":"SHIPPED"}
      }'::jsonb)
    )
  $test$,
  'FEFO fixture crosses cutoff'
);

-- Assert: expiry, created_at, and batch_id determine allocation order.
select results_eq(
  $test$
    with result_ids as (
      select ledger_id::uuid, ordinality
      from stock_event_test_results result_row,
      lateral jsonb_array_elements_text(result_row.result->'ledgerEntryIds')
        with ordinality as ids(ledger_id, ordinality)
      where result_row.name = 'fefo.shipped'
    )
    select ledger.batch_id::text, ledger.quantity::bigint
    from result_ids
    join public.stock_ledger ledger on ledger.id = result_ids.ledger_id
    where ledger.source_type = 'order_fulfillment'
    order by result_ids.ordinality
  $test$,
  $test$
    values
      ('40000000-0000-4000-8000-000000000001'::text, 2::bigint),
      ('40000000-0000-4000-8000-000000000003'::text, 2::bigint),
      ('40000000-0000-4000-8000-000000000004'::text, 1::bigint)
  $test$,
  'FEFO uses expiry_date, created_at, then batch_id and splits quantities'
);

select is(
  (select jsonb_array_length(result->'allocationIds') from stock_event_test_results where name = 'fefo.shipped'),
  3,
  'Each FEFO split persists an immutable allocation identifier'
);

select is(
  (
    select count(*)::bigint
    from public.stock_ledger ledger
    where ledger.id in (
      select ledger_id::uuid
      from stock_event_test_results result_row,
      lateral jsonb_array_elements_text(result_row.result->'ledgerEntryIds') as ids(ledger_id)
      where result_row.name = 'fefo.shipped'
    )
      and ledger.batch_id in (
        '40000000-0000-4000-8000-000000000006',
        '40000000-0000-4000-8000-000000000007'
      )
  ),
  0::bigint,
  'FEFO excludes expired and inactive batches'
);

rollback to savepoint deterministic_fefo;

-- Insufficient stock is all-or-nothing.
savepoint insufficient_stock;

-- Arrange: reserve more than all valid FEFO stock and enter PROCESSING.
select lives_ok(
  $test$
    insert into stock_event_test_results values (
      'insufficient.created',
      public.process_stock_event('{
        "idempotencyKey":"evt-insufficient-create",
        "channel":"shopee",
        "type":"order.created",
        "occurredAt":"2026-08-04T08:00:00Z",
        "externalReference":"EXT-INSUFFICIENT",
        "payload":{"items":[{"lineReference":"line-1","sku":"FIX-SERUM","quantity":17}]}
      }'::jsonb)
    )
  $test$,
  'Insufficient-stock fixture can be reserved'
);

select lives_ok(
  $test$
    insert into stock_event_test_results values (
      'insufficient.processing',
      public.process_stock_event('{
        "idempotencyKey":"evt-insufficient-processing",
        "channel":"shopee",
        "type":"order.status_changed",
        "occurredAt":"2026-08-04T08:01:00Z",
        "externalReference":"EXT-INSUFFICIENT",
        "payload":{"status":"PROCESSING"}
      }'::jsonb)
    )
  $test$,
  'Insufficient-stock fixture reaches PROCESSING'
);

-- Act and Assert: cutoff fails and rolls back every side effect.
select throws_matching(
  $test$
    select public.process_stock_event('{
      "idempotencyKey":"evt-insufficient-ship",
      "channel":"shopee",
      "type":"order.status_changed",
      "occurredAt":"2026-08-04T08:02:00Z",
      "externalReference":"EXT-INSUFFICIENT",
      "payload":{"status":"SHIPPED"}
    }'::jsonb)
  $test$,
  '(?i)insufficient stock',
  'Insufficient valid FEFO stock rejects cutoff'
);

select is(
  (
    select count(*)::bigint
    from public.stock_ledger ledger
    join public.orders orders on orders.id = ledger.order_id
    where orders.order_number = 'EXT-INSUFFICIENT'
  ),
  0::bigint,
  'Insufficient stock leaves no partial ledger rows'
);

select is(
  (select count(*)::bigint from public.event_log where idempotency_key = 'evt-insufficient-ship'),
  0::bigint,
  'Failed cutoff does not retain an idempotency claim'
);

select is(
  (select status from public.orders where order_number = 'EXT-INSUFFICIENT'),
  'PROCESSING',
  'Failed cutoff preserves the prior order state'
);

rollback to savepoint insufficient_stock;

-- Idempotency: identical duplicate, conflicting duplicate, one stock effect.
savepoint duplicate_events;

-- Arrange: reserve an order.
select lives_ok(
  $test$
    insert into stock_event_test_results values (
      'duplicate.created',
      public.process_stock_event('{
        "idempotencyKey":"evt-duplicate-create",
        "channel":"shopee",
        "type":"order.created",
        "occurredAt":"2026-08-04T09:00:00Z",
        "externalReference":"EXT-DUPLICATE",
        "payload":{"items":[{"lineReference":"line-1","sku":"FIX-SERUM","quantity":2}]}
      }'::jsonb)
    )
  $test$,
  'Duplicate-event fixture is reserved'
);

-- Act: submit an identical cutoff event twice.
select lives_ok(
  $test$
    insert into stock_event_test_results values (
      'duplicate.first',
      public.process_stock_event('{
        "idempotencyKey":"evt-duplicate-ship",
        "channel":"shopee",
        "type":"order.status_changed",
        "occurredAt":"2026-08-04T09:01:00Z",
        "externalReference":"EXT-DUPLICATE",
        "payload":{"status":"SHIPPED"}
      }'::jsonb)
    )
  $test$,
  'First idempotent cutoff event is processed'
);

select lives_ok(
  $test$
    insert into stock_event_test_results values (
      'duplicate.second',
      public.process_stock_event('{
        "idempotencyKey":"evt-duplicate-ship",
        "channel":"shopee",
        "type":"order.status_changed",
        "occurredAt":"2026-08-04T09:01:00Z",
        "externalReference":"EXT-DUPLICATE",
        "payload":{"status":"SHIPPED"}
      }'::jsonb)
    )
  $test$,
  'Identical duplicate returns the stored result'
);

-- Assert: prior identifiers are returned and stock is deducted once.
select is(
  (select (result->>'duplicate')::boolean from stock_event_test_results where name = 'duplicate.first'),
  false,
  'First event result is not marked duplicate'
);

select is(
  (select (result->>'duplicate')::boolean from stock_event_test_results where name = 'duplicate.second'),
  true,
  'Repeated identical event is marked duplicate'
);

select is(
  (select result->>'eventId' from stock_event_test_results where name = 'duplicate.second'),
  (select result->>'eventId' from stock_event_test_results where name = 'duplicate.first'),
  'Identical duplicate returns the prior event identifier'
);

select is(
  (select result->'ledgerEntryIds' from stock_event_test_results where name = 'duplicate.second'),
  (select result->'ledgerEntryIds' from stock_event_test_results where name = 'duplicate.first'),
  'Identical duplicate returns the prior ledger result'
);

select is(
  (select result->'allocationIds' from stock_event_test_results where name = 'duplicate.second'),
  (select result->'allocationIds' from stock_event_test_results where name = 'duplicate.first'),
  'Identical duplicate returns the prior allocation result'
);

select is(
  (
    select coalesce(sum(ledger.quantity), 0)::bigint
    from public.stock_ledger ledger
    join public.orders orders on orders.id = ledger.order_id
    where orders.order_number = 'EXT-DUPLICATE'
      and ledger.source_type = 'order_fulfillment'
  ),
  2::bigint,
  'Identical duplicate does not double-apply stock'
);

select throws_matching(
  $test$
    select public.process_stock_event('{
      "idempotencyKey":"evt-duplicate-ship",
      "channel":"shopee",
      "type":"order.status_changed",
      "occurredAt":"2026-08-04T09:01:00Z",
      "externalReference":"EXT-DUPLICATE",
      "payload":{"status":"DELIVERED"}
    }'::jsonb)
  $test$,
  '(?i)(idempotency|duplicate|conflict)',
  'Same idempotency key with different content is rejected'
);

select is(
  (select count(*)::bigint from public.event_log where idempotency_key = 'evt-duplicate-ship'),
  1::bigint,
  'Conflicting duplicate cannot replace the original event claim'
);

rollback to savepoint duplicate_events;

-- Marketplace ordering: reject invalid transitions without state corruption.
savepoint event_ordering;

-- Arrange: a reserved Shopee order.
select lives_ok(
  $test$
    insert into stock_event_test_results values (
      'ordering.created',
      public.process_stock_event('{
        "idempotencyKey":"evt-ordering-create",
        "channel":"shopee",
        "type":"order.created",
        "occurredAt":"2026-08-04T10:00:00Z",
        "externalReference":"EXT-ORDERING",
        "payload":{"items":[{"lineReference":"line-1","sku":"FIX-SERUM","quantity":1}]}
      }'::jsonb)
    )
  $test$,
  'Ordering fixture is reserved'
);

-- Act and Assert: DELIVERED cannot jump over PROCESSING and SHIPPED.
select throws_matching(
  $test$
    select public.process_stock_event('{
      "idempotencyKey":"evt-ordering-too-early",
      "channel":"shopee",
      "type":"order.status_changed",
      "occurredAt":"2026-08-04T10:01:00Z",
      "externalReference":"EXT-ORDERING",
      "payload":{"status":"DELIVERED"}
    }'::jsonb)
  $test$,
  '(?i)(out.of.order|invalid.*transition|cannot.*delivered)',
  'Out-of-order Shopee transition is rejected'
);

select is(
  (select status from public.orders where order_number = 'EXT-ORDERING'),
  'RESERVED',
  'Rejected out-of-order event preserves order state'
);

select is(
  (
    select count(*)::bigint
    from public.stock_ledger ledger
    join public.orders orders on orders.id = ledger.order_id
    where orders.order_number = 'EXT-ORDERING'
  ),
  0::bigint,
  'Rejected out-of-order event creates no ledger movement'
);

-- Act: submit the valid sequence.
select lives_ok(
  $test$
    select public.process_stock_event('{
      "idempotencyKey":"evt-ordering-processing",
      "channel":"shopee",
      "type":"order.status_changed",
      "occurredAt":"2026-08-04T10:02:00Z",
      "externalReference":"EXT-ORDERING",
      "payload":{"status":"PROCESSING"}
    }'::jsonb)
  $test$,
  'Valid PROCESSING transition succeeds after rejected event'
);

select lives_ok(
  $test$
    select public.process_stock_event('{
      "idempotencyKey":"evt-ordering-shipped",
      "channel":"shopee",
      "type":"order.status_changed",
      "occurredAt":"2026-08-04T10:03:00Z",
      "externalReference":"EXT-ORDERING",
      "payload":{"status":"SHIPPED"}
    }'::jsonb)
  $test$,
  'Valid SHIPPED transition succeeds after PROCESSING'
);

select lives_ok(
  $test$
    select public.process_stock_event('{
      "idempotencyKey":"evt-ordering-delivered",
      "channel":"shopee",
      "type":"order.status_changed",
      "occurredAt":"2026-08-04T10:04:00Z",
      "externalReference":"EXT-ORDERING",
      "payload":{"status":"DELIVERED"}
    }'::jsonb)
  $test$,
  'Valid DELIVERED transition succeeds after SHIPPED'
);

-- Assert: the valid terminal state is retained.
select is(
  (select status from public.orders where order_number = 'EXT-ORDERING'),
  'DELIVERED',
  'Valid ordered events reach DELIVERED'
);

rollback to savepoint event_ordering;

-- Bundle recipe snapshots (BR-04, FR-105, FR-407).
savepoint recipe_versions;

-- Arrange and Act: create an order while recipe version 1 is active.
select lives_ok(
  $test$
    insert into stock_event_test_results values (
      'recipe.old-created',
      public.process_stock_event('{
        "idempotencyKey":"evt-recipe-old-create",
        "channel":"shopee",
        "type":"order.created",
        "occurredAt":"2026-08-04T11:00:00Z",
        "externalReference":"EXT-RECIPE-OLD",
        "payload":{"items":[{"lineReference":"line-1","sku":"FIX-BUNDLE","quantity":1}]}
      }'::jsonb)
    )
  $test$,
  'Bundle order is accepted with active recipe version 1'
);

-- Assert: the order snapshots version 1 before later edits.
select is(
  (
    select item.recipe_version_id
    from public.order_items item
    join public.orders orders on orders.id = item.order_id
    where orders.order_number = 'EXT-RECIPE-OLD'
  ),
  '50000000-0000-4000-8000-000000000002'::uuid,
  'Old bundle order retains recipe version 1'
);

-- Arrange: activate version 2 with a different component and mutate the legacy
-- unversioned recipe to prove shipment cannot consult it.
reset role;
update public.bundle_recipe_version
set is_active = false
where id = '50000000-0000-4000-8000-000000000002';

insert into public.bundle_recipe_version (id, recipe_id, version_no, is_active, created_at)
values (
  '50000000-0000-4000-8000-000000000006',
  '50000000-0000-4000-8000-000000000001',
  2,
  true,
  '2026-08-04 11:01:00+00'
);

insert into public.bundle_recipe_line (
  id, recipe_version_id, product_id, quantity
) values (
  '50000000-0000-4000-8000-000000000007',
  '50000000-0000-4000-8000-000000000006',
  '30000000-0000-4000-8000-000000000002',
  3
);

update public.bundle_items
set product_id = '30000000-0000-4000-8000-000000000002', quantity = 99
where id = '50000000-0000-4000-8000-000000000005';

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local role authenticated;

-- Act: ship the old order, then create and ship a new order.
select lives_ok(
  $test$
    insert into stock_event_test_results values (
      'recipe.old-shipped',
      public.process_stock_event('{
        "idempotencyKey":"evt-recipe-old-ship",
        "channel":"shopee",
        "type":"order.status_changed",
        "occurredAt":"2026-08-04T11:02:00Z",
        "externalReference":"EXT-RECIPE-OLD",
        "payload":{"status":"SHIPPED"}
      }'::jsonb)
    )
  $test$,
  'Old bundle order ships after recipe version 2 is activated'
);

select results_eq(
  $test$
    select product.sku, sum(ledger.quantity)::bigint
    from public.stock_ledger ledger
    join public.orders orders on orders.id = ledger.order_id
    join public.batches batch on batch.id = ledger.batch_id
    join public.products product on product.id = batch.product_id
    where orders.order_number = 'EXT-RECIPE-OLD'
      and ledger.source_type = 'order_fulfillment'
    group by product.sku
  $test$,
  $test$
    values ('FIX-SERUM'::text, 2::bigint)
  $test$,
  'Old order still expands recipe version 1, not current or legacy mutable lines'
);

select lives_ok(
  $test$
    insert into stock_event_test_results values (
      'recipe.new-created',
      public.process_stock_event('{
        "idempotencyKey":"evt-recipe-new-create",
        "channel":"shopee",
        "type":"order.created",
        "occurredAt":"2026-08-04T11:03:00Z",
        "externalReference":"EXT-RECIPE-NEW",
        "payload":{"items":[{"lineReference":"line-1","sku":"FIX-BUNDLE","quantity":1}]}
      }'::jsonb)
    )
  $test$,
  'New bundle order is accepted with recipe version 2'
);

select is(
  (
    select item.recipe_version_id
    from public.order_items item
    join public.orders orders on orders.id = item.order_id
    where orders.order_number = 'EXT-RECIPE-NEW'
  ),
  '50000000-0000-4000-8000-000000000006'::uuid,
  'New bundle order snapshots recipe version 2'
);

select lives_ok(
  $test$
    insert into stock_event_test_results values (
      'recipe.new-shipped',
      public.process_stock_event('{
        "idempotencyKey":"evt-recipe-new-ship",
        "channel":"shopee",
        "type":"order.status_changed",
        "occurredAt":"2026-08-04T11:04:00Z",
        "externalReference":"EXT-RECIPE-NEW",
        "payload":{"status":"SHIPPED"}
      }'::jsonb)
    )
  $test$,
  'New bundle order ships with recipe version 2'
);

select results_eq(
  $test$
    select product.sku, sum(ledger.quantity)::bigint
    from public.stock_ledger ledger
    join public.orders orders on orders.id = ledger.order_id
    join public.batches batch on batch.id = ledger.batch_id
    join public.products product on product.id = batch.product_id
    where orders.order_number = 'EXT-RECIPE-NEW'
      and ledger.source_type = 'order_fulfillment'
    group by product.sku
  $test$,
  $test$
    values ('FIX-CLEANSER'::text, 3::bigint)
  $test$,
  'New order expands recipe version 2'
);

rollback to savepoint recipe_versions;

-- Missing recipe enters manual review without deduction.
savepoint missing_recipe;

-- Arrange: a known marketplace bundle listing with no recipe.
reset role;
insert into public.bundles (
  id, name, marketplace_listing, channel_id, is_active, created_at
) values (
  '50000000-0000-4000-8000-000000000008',
  'Paket Tanpa Resep Fixture',
  'FIX-BUNDLE-NO-RECIPE',
  '20000000-0000-4000-8000-000000000001',
  true,
  '2026-08-04 12:00:00+00'
);
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';
reset role;

-- Act: create and attempt to ship the order.
select lives_ok(
  $test$
    insert into stock_event_test_results values (
      'missing-recipe.created',
      public.process_stock_event('{
        "idempotencyKey":"evt-missing-recipe-create",
        "channel":"shopee",
        "type":"order.created",
        "occurredAt":"2026-08-04T12:01:00Z",
        "externalReference":"EXT-MISSING-RECIPE",
        "payload":{"items":[{"lineReference":"line-1","sku":"FIX-BUNDLE-NO-RECIPE","quantity":1}]}
      }'::jsonb)
    )
  $test$,
  'Bundle without a recipe is retained for manual review'
);

select lives_ok(
  $test$
    insert into stock_event_test_results values (
      'missing-recipe.shipped',
      public.process_stock_event('{
        "idempotencyKey":"evt-missing-recipe-ship",
        "channel":"shopee",
        "type":"order.status_changed",
        "occurredAt":"2026-08-04T12:02:00Z",
        "externalReference":"EXT-MISSING-RECIPE",
        "payload":{"status":"SHIPPED"}
      }'::jsonb)
    )
  $test$,
  'Missing recipe does not abort the worklist event'
);

-- Assert: explicit manual-review result and no silent deduction.
select is(
  (select lower(result->>'status') from stock_event_test_results where name = 'missing-recipe.shipped'),
  'manual_review',
  'Missing recipe returns manual_review status'
);

select is(
  (
    select count(*)::bigint
    from public.stock_ledger ledger
    join public.orders orders on orders.id = ledger.order_id
    where orders.order_number = 'EXT-MISSING-RECIPE'
  ),
  0::bigint,
  'Missing recipe creates no stock deduction'
);

rollback to savepoint missing_recipe;

-- Actual two-session FEFO contention. Both remote transactions are rolled back;
-- the test therefore leaves no committed event, order, allocation, or ledger row.
reset role;

create or replace function pg_temp.run_concurrent_stock_event_test()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  first_result jsonb;
  second_result jsonb;
  ignored_result jsonb;
  second_pid integer;
  second_blocked boolean := false;
  attempt integer;
begin
  perform extensions.dblink_connect(
    'stock_event_session_a',
    'host=127.0.0.1 dbname=' || current_database() || ' user=postgres password=postgres'
  );
  perform extensions.dblink_connect(
    'stock_event_session_b',
    'host=127.0.0.1 dbname=' || current_database() || ' user=postgres password=postgres'
  );

  perform dblink_exec(
    'stock_event_session_a',
    'begin; set local request.jwt.claim.sub = ''00000000-0000-4000-8000-000000000001''; set local request.jwt.claim.role = ''authenticated''; set local role authenticated'
  );
  perform dblink_exec(
    'stock_event_session_b',
    'begin; set local request.jwt.claim.sub = ''00000000-0000-4000-8000-000000000001''; set local request.jwt.claim.role = ''authenticated''; set local role authenticated'
  );

  select pid into second_pid
  from dblink('stock_event_session_b', 'select pg_backend_pid()') as remote(pid integer);

  select result into ignored_result
  from dblink(
    'stock_event_session_a',
    format(
      'select public.process_stock_event(%L::jsonb)',
      '{"idempotencyKey":"evt-concurrent-a-create","channel":"shopee","type":"order.created","occurredAt":"2026-08-04T13:00:00Z","externalReference":"EXT-CONCURRENT-A","payload":{"items":[{"lineReference":"line-1","sku":"BR-SER-30","quantity":400}]}}'
    )
  ) as remote(result jsonb);

  select result into ignored_result
  from dblink(
    'stock_event_session_b',
    format(
      'select public.process_stock_event(%L::jsonb)',
      '{"idempotencyKey":"evt-concurrent-b-create","channel":"shopee","type":"order.created","occurredAt":"2026-08-04T13:00:00Z","externalReference":"EXT-CONCURRENT-B","payload":{"items":[{"lineReference":"line-1","sku":"BR-SER-30","quantity":400}]}}'
    )
  ) as remote(result jsonb);

  perform dblink_send_query(
    'stock_event_session_a',
    format(
      'select public.process_stock_event(%L::jsonb)',
      '{"idempotencyKey":"evt-concurrent-a-ship","channel":"shopee","type":"order.status_changed","occurredAt":"2026-08-04T13:01:00Z","externalReference":"EXT-CONCURRENT-A","payload":{"status":"SHIPPED"}}'
    )
  );

  -- Wait for session A's statement while retaining its transaction-level locks.
  select result into first_result
  from dblink_get_result('stock_event_session_a') as remote(result jsonb);
  select result into ignored_result
  from dblink_get_result('stock_event_session_a') as remote(result jsonb);

  perform dblink_send_query(
    'stock_event_session_b',
    format(
      'select public.process_stock_event(%L::jsonb)',
      '{"idempotencyKey":"evt-concurrent-b-ship","channel":"shopee","type":"order.status_changed","occurredAt":"2026-08-04T13:01:00Z","externalReference":"EXT-CONCURRENT-B","payload":{"status":"SHIPPED"}}'
    )
  );

  -- Assertable synchronization: session B must wait on A's FEFO row lock.
  for attempt in 1..200 loop
    select coalesce(activity.wait_event_type = 'Lock', false)
      into second_blocked
    from pg_stat_activity activity
    where activity.pid = second_pid;
    exit when second_blocked;
    perform pg_sleep(0.01);
  end loop;

  -- Release A without committing; B can then allocate from the unchanged stock.
  perform dblink_exec('stock_event_session_a', 'rollback');
  select result into second_result
  from dblink_get_result('stock_event_session_b') as remote(result jsonb);
  select result into ignored_result
  from dblink_get_result('stock_event_session_b') as remote(result jsonb);
  perform dblink_exec('stock_event_session_b', 'rollback');

  perform dblink_disconnect('stock_event_session_a');
  perform dblink_disconnect('stock_event_session_b');

  return jsonb_build_object(
    'secondBlocked', second_blocked,
    'first', first_result,
    'second', second_result
  );
exception when others then
  begin perform dblink_exec('stock_event_session_a', 'rollback'); exception when others then null; end;
  begin perform dblink_exec('stock_event_session_b', 'rollback'); exception when others then null; end;
  begin perform dblink_disconnect('stock_event_session_a'); exception when others then null; end;
  begin perform dblink_disconnect('stock_event_session_b'); exception when others then null; end;
  raise;
end;
$function$;

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local role authenticated;

-- Arrange and Act: run two independent database transactions against one batch.
select lives_ok(
  $test$
    insert into stock_event_test_results
    values ('concurrency', pg_temp.run_concurrent_stock_event_test())
  $test$,
  'Two independent sessions complete without double allocation'
);

-- Assert: real lock contention serialized the FEFO allocator.
select is(
  (select (result->>'secondBlocked')::boolean from stock_event_test_results where name = 'concurrency'),
  true,
  'Concurrent session waits on the first FEFO allocation lock'
);

select ok(
  (
    select jsonb_array_length(result->'first'->'allocationIds') > 0
    from stock_event_test_results
    where name = 'concurrency'
  ),
  'First concurrent session receives persisted allocation identifiers'
);

select ok(
  (
    select jsonb_array_length(result->'second'->'allocationIds') > 0
    from stock_event_test_results
    where name = 'concurrency'
  ),
  'Second session allocates only after the first transaction releases its lock'
);

select is(
  (
    select count(*)::bigint
    from public.event_log
    where idempotency_key like 'evt-concurrent-%'
  ),
  0::bigint,
  'Concurrent session events are rollback-isolated'
);

select is(
  (
    select count(*)::bigint
    from public.orders
    where order_number in ('EXT-CONCURRENT-A', 'EXT-CONCURRENT-B')
  ),
  0::bigint,
  'Concurrent session orders are rollback-isolated'
);

\else

-- The current migration chain is intentionally red until Task 07 provides the
-- frozen event engine. Keep the remaining behavior plan visible but skipped so
-- the failure identifies the missing contract instead of aborting on SQL parse.
select * from skip(78, 'process_stock_event(jsonb) is not implemented yet');

\endif

select * from finish();
rollback;
