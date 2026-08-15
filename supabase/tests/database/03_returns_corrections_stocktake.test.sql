begin;

-- Missing remediation objects should fail assertions without aborting the suite.
create function pg_temp.query_true(p_sql text)
returns boolean
language plpgsql
as $$
declare
  v_result boolean;
begin
  execute p_sql into v_result;
  return coalesce(v_result, false);
exception when others then
  return false;
end;
$$;

-- Arrange: deterministic fixture data and authenticated admin request context.
\ir 00_test_helpers.inc

select plan(53);

-- Arrange: immutable opening and fulfillment ledger history.
reset role;

insert into public.stock_ledger (
  id, batch_id, movement_type_id, reason_id, quantity, direction,
  stock_before, stock_after, order_id, recorded_by, source_type, is_unverified,
  created_at
)
select
  '70000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  mt.id,
  mr.id,
  10,
  'in',
  0,
  10,
  null,
  '10000000-0000-4000-8000-000000000001',
  'initial_balance',
  true,
  '2026-07-01 00:00:00+00'
from public.movement_types mt
join public.movement_reasons mr on mr.code = 'initial_stock'
where mt.name = 'IN';

insert into public.stock_ledger (
  id, batch_id, movement_type_id, reason_id, channel_id, quantity, direction,
  stock_before, stock_after, order_id, recorded_by, source_type, created_at
)
select
  v.id,
  '40000000-0000-4000-8000-000000000001',
  mt.id,
  mr.id,
  v.channel_id,
  2,
  'out',
  v.stock_before,
  v.stock_after,
  v.order_id,
  '10000000-0000-4000-8000-000000000001',
  'order_fulfillment',
  v.created_at
from (
  values
    (
      '70000000-0000-4000-8000-000000000002'::uuid,
      '20000000-0000-4000-8000-000000000001'::uuid,
      '60000000-0000-4000-8000-000000000001'::uuid,
      10,
      8,
      '2026-07-02 00:00:00+00'::timestamptz
    ),
    (
      '70000000-0000-4000-8000-000000000003'::uuid,
      '20000000-0000-4000-8000-000000000002'::uuid,
      '60000000-0000-4000-8000-000000000002'::uuid,
      8,
      6,
      '2026-07-03 00:00:00+00'::timestamptz
    )
) as v(id, channel_id, order_id, stock_before, stock_after, created_at)
cross join public.movement_types mt
cross join public.movement_reasons mr
where mt.name = 'OUT'
  and mr.code = 'sale_online';

insert into public.stock_ledger (
  id, batch_id, movement_type_id, reason_id, quantity, direction,
  stock_before, stock_after, recorded_by, source_type, is_unverified, created_at
)
select
  '70000000-0000-4000-8000-000000000004',
  '40000000-0000-4000-8000-000000000002',
  mt.id,
  mr.id,
  5,
  'in',
  0,
  5,
  '10000000-0000-4000-8000-000000000001',
  'initial_balance',
  true,
  '2026-07-01 00:00:00+00'
from public.movement_types mt
join public.movement_reasons mr on mr.code = 'initial_stock'
where mt.name = 'IN';

select lives_ok(
  $sql$
    insert into public.fulfillment_allocations (
      id, order_item_id, component_product_id, batch_id, ledger_id, quantity,
      created_at
    ) values
      (
        '71000000-0000-4000-8000-000000000001',
        '60000000-0000-4000-8000-000000000003',
        '30000000-0000-4000-8000-000000000001',
        '40000000-0000-4000-8000-000000000001',
        '70000000-0000-4000-8000-000000000002',
        2,
        '2026-07-02 00:00:00+00'
      ),
      (
        '71000000-0000-4000-8000-000000000002',
        '60000000-0000-4000-8000-000000000004',
        '30000000-0000-4000-8000-000000000001',
        '40000000-0000-4000-8000-000000000001',
        '70000000-0000-4000-8000-000000000003',
        2,
        '2026-07-03 00:00:00+00'
      )
  $sql$,
  'Arrange: fulfilled component quantities are persisted immutably'
);

-- Arrange: a second fulfilled component on the TikTok fixture order enables a
-- mixed inspection case without introducing a new production fixture.
reset role;

insert into public.order_items (
  id, order_id, product_id, quantity, is_bundle, external_line_reference
) values (
  '60000000-0000-4000-8000-000000000005',
  '60000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000002',
  1,
  false,
  'line-2'
);

insert into public.fulfillment_allocations (
  id, order_item_id, component_product_id, batch_id, ledger_id, quantity,
  created_at
) values (
  '71000000-0000-4000-8000-000000000003',
  '60000000-0000-4000-8000-000000000005',
  '30000000-0000-4000-8000-000000000002',
  '40000000-0000-4000-8000-000000000002',
  '70000000-0000-4000-8000-000000000004',
  1,
  '2026-07-03 00:00:00+00'
);

set local role authenticated;

-- Returns — Arrange/Act: submit and inspect one sellable component.
select lives_ok(
  $sql$
    select public.process_stock_event($event$
      {
        "idempotencyKey": "return-shopee-sellable-submit",
        "channel": "shopee",
        "type": "return.submitted",
        "occurredAt": "2026-06-01T10:00:00Z",
        "externalReference": "FIX-RETURN-SHOPEE-SELLABLE",
        "payload": {
          "orderId": "60000000-0000-4000-8000-000000000001",
          "lines": [{
            "fulfillmentAllocationId": "71000000-0000-4000-8000-000000000001",
            "quantity": 1
          }]
        }
      }
    $event$::jsonb)
  $sql$,
  'Act: a partial fulfilled component can be submitted for return'
);

select is(
  (
    public.process_stock_event($event$
      {
        "idempotencyKey": "return-shopee-sellable-submit",
        "channel": "shopee",
        "type": "return.submitted",
        "occurredAt": "2026-06-01T10:00:00Z",
        "externalReference": "FIX-RETURN-SHOPEE-SELLABLE",
        "payload": {
          "orderId": "60000000-0000-4000-8000-000000000001",
          "lines": [{
            "fulfillmentAllocationId": "71000000-0000-4000-8000-000000000001",
            "quantity": 1
          }]
        }
      }
    $event$::jsonb)->>'duplicate'
  )::boolean,
  true,
  'Assert: an identical return submission is idempotent'
);

select is(
  (
    select count(*)::bigint
    from public.returns
    where external_reference = 'FIX-RETURN-SHOPEE-SELLABLE'
  ),
  1::bigint,
  'Assert: duplicate return submission does not create another return case'
);

select lives_ok(
  $sql$
    select public.process_stock_event($event$
      {
        "idempotencyKey": "return-shopee-sellable-inspect",
        "channel": "shopee",
        "type": "return.inspected",
        "occurredAt": "2026-06-02T10:00:00Z",
        "externalReference": "FIX-RETURN-SHOPEE-SELLABLE-INSPECTION",
        "payload": {
          "returnReference": "FIX-RETURN-SHOPEE-SELLABLE",
          "lines": [{
            "fulfillmentAllocationId": "71000000-0000-4000-8000-000000000001",
            "condition": "resellable"
          }]
        }
      }
    $event$::jsonb)
  $sql$,
  'Act: a submitted component can be inspected as sellable'
);

-- Returns — Assert: partial quantity, zero-start return batch, one stock entry.
select ok(
  pg_temp.query_true($query$
    select count(*) = 1 and min(rl.quantity) = 1
    from public.return_lines rl
    join public.returns r on r.id = rl.return_id
    where r.external_reference = 'FIX-RETURN-SHOPEE-SELLABLE'
      and rl.fulfillment_allocation_id = '71000000-0000-4000-8000-000000000001'
  $query$),
  'Assert: the return records exactly the submitted partial component quantity'
);

select ok(
  pg_temp.query_true($query$
    select count(*) = 1
    from public.batches b
    join public.stock_ledger l on l.batch_id = b.id
    join public.returns r on r.id = l.return_id
    where r.external_reference = 'FIX-RETURN-SHOPEE-SELLABLE'
      and b.origin = 'retur'
      and b.initial_stock = 0
      and b.current_stock = 0
  $query$),
  'Assert: a sellable return creates one new zero-start batch with origin retur'
);

select ok(
  pg_temp.query_true($query$
    select count(*) = 1
    from public.stock_ledger l
    join public.returns r on r.id = l.return_id
    where r.external_reference = 'FIX-RETURN-SHOPEE-SELLABLE'
      and l.source_type = 'return_resellable'
  $query$),
  'Assert: a sellable return creates exactly one return_resellable ledger row'
);

select ok(
  pg_temp.query_true($query$
    select bool_and(l.quantity = 1 and l.direction = 'in')
    from public.stock_ledger l
    join public.returns r on r.id = l.return_id
    where r.external_reference = 'FIX-RETURN-SHOPEE-SELLABLE'
      and l.source_type = 'return_resellable'
  $query$),
  'Assert: the sellable ledger row adds only the returned component quantity'
);

-- Returns — Arrange/Act: consume the remaining component as damaged.
select lives_ok(
  $sql$
    select public.process_stock_event($event$
      {
        "idempotencyKey": "return-shopee-damaged-submit",
        "channel": "shopee",
        "type": "return.submitted",
        "occurredAt": "2026-06-03T10:00:00Z",
        "externalReference": "FIX-RETURN-SHOPEE-DAMAGED",
        "payload": {
          "orderId": "60000000-0000-4000-8000-000000000001",
          "lines": [{
            "fulfillmentAllocationId": "71000000-0000-4000-8000-000000000001",
            "quantity": 1
          }]
        }
      }
    $event$::jsonb)
  $sql$,
  'Act: the remaining fulfilled component quantity can be returned'
);

select lives_ok(
  $sql$
    select public.process_stock_event($event$
      {
        "idempotencyKey": "return-shopee-damaged-inspect",
        "channel": "shopee",
        "type": "return.inspected",
        "occurredAt": "2026-06-04T10:00:00Z",
        "externalReference": "FIX-RETURN-SHOPEE-DAMAGED-INSPECTION",
        "payload": {
          "returnReference": "FIX-RETURN-SHOPEE-DAMAGED",
          "lines": [{
            "fulfillmentAllocationId": "71000000-0000-4000-8000-000000000001",
            "condition": "damaged"
          }]
        }
      }
    $event$::jsonb)
  $sql$,
  'Act: a submitted component can be inspected as damaged'
);

select ok(
  pg_temp.query_true($query$
    select count(*) = 1
    from public.claim_loss_record c
    join public.returns r on r.id = c.return_case_id
    where r.external_reference = 'FIX-RETURN-SHOPEE-DAMAGED'
      and c.type = 'damaged'
  $query$),
  'Assert: damaged stock creates a damaged claim record'
);

select ok(
  pg_temp.query_true($query$
    select count(*) = 0
    from public.stock_ledger l
    join public.returns r on r.id = l.return_id
    where r.external_reference = 'FIX-RETURN-SHOPEE-DAMAGED'
  $query$),
  'Assert: damaged stock creates no second ledger movement'
);

-- Returns — Negative: cumulative returned quantity cannot exceed fulfillment.
select throws_like(
  $sql$
    select public.process_stock_event($event$
      {
        "idempotencyKey": "return-shopee-over-submit",
        "channel": "shopee",
        "type": "return.submitted",
        "occurredAt": "2026-06-05T10:00:00Z",
        "externalReference": "FIX-RETURN-SHOPEE-OVER",
        "payload": {
          "orderId": "60000000-0000-4000-8000-000000000001",
          "lines": [{
            "fulfillmentAllocationId": "71000000-0000-4000-8000-000000000001",
            "quantity": 1
          }]
        }
      }
    $event$::jsonb)
  $sql$,
  '%remaining fulfilled quantity%',
  'Reject: cumulative returns cannot exceed the fulfilled component quantity'
);

select ok(
  pg_temp.query_true($query$
    select coalesce(sum(rl.quantity), 0) = 2
    from public.return_lines rl
    join public.returns r on r.id = rl.return_id
    where r.order_id = '60000000-0000-4000-8000-000000000001'
      and rl.fulfillment_allocation_id = '71000000-0000-4000-8000-000000000001'
  $query$),
  'Assert: a rejected over-return leaves the cumulative quantity unchanged'
);

-- Returns — Arrange/Act/Assert: mixed inspection creates one inbound row for
-- the resellable line and one claim for the damaged line, with no second
-- movement for the damaged line.
select lives_ok(
  $sql$
    select public.process_stock_event($event$
      {
        "idempotencyKey": "return-mixed-submit",
        "channel": "tiktok",
        "type": "return.submitted",
        "occurredAt": "2026-06-06T10:00:00Z",
        "externalReference": "FIX-RETURN-MIXED",
        "payload": {
          "orderId": "60000000-0000-4000-8000-000000000002",
          "lines": [
            {
              "fulfillmentAllocationId": "71000000-0000-4000-8000-000000000002",
              "quantity": 1
            },
            {
              "fulfillmentAllocationId": "71000000-0000-4000-8000-000000000003",
              "quantity": 1
            }
          ]
        }
      }
    $event$::jsonb)
  $sql$,
  'Act: a return can submit multiple fulfilled component lines'
);

select lives_ok(
  $sql$
    select public.process_stock_event($event$
      {
        "idempotencyKey": "return-mixed-inspect",
        "channel": "tiktok",
        "type": "return.inspected",
        "occurredAt": "2026-06-07T10:00:00Z",
        "externalReference": "FIX-RETURN-MIXED-INSPECTION",
        "payload": {
          "returnReference": "FIX-RETURN-MIXED",
          "lines": [
            {
              "fulfillmentAllocationId": "71000000-0000-4000-8000-000000000002",
              "condition": "resellable"
            },
            {
              "fulfillmentAllocationId": "71000000-0000-4000-8000-000000000003",
              "condition": "damaged"
            }
          ]
        }
      }
    $event$::jsonb)
  $sql$,
  'Act: mixed return lines can be inspected independently'
);

select results_eq(
  $query$
    select
      rl.fulfillment_allocation_id::text,
      rl.quantity,
      rl.condition
    from public.return_lines rl
    join public.returns r on r.id = rl.return_id
    where r.external_reference = 'FIX-RETURN-MIXED'
    order by rl.fulfillment_allocation_id
  $query$,
  $query$
    values
      ('71000000-0000-4000-8000-000000000002'::text, 1, 'resellable'::text),
      ('71000000-0000-4000-8000-000000000003'::text, 1, 'damaged'::text)
  $query$,
  'Assert: mixed inspection persists each line condition and quantity'
);

select ok(
  pg_temp.query_true($query$
    select count(*) = 1
      and bool_and(b.origin = 'retur' and b.initial_stock = 0 and b.current_stock = 0)
    from public.batches b
    join public.stock_ledger l on l.batch_id = b.id
    join public.returns r on r.id = l.return_id
    where r.external_reference = 'FIX-RETURN-MIXED'
      and l.source_type = 'return_resellable'
  $query$),
  'Assert: only the resellable mixed line creates a return-origin batch'
);

select ok(
  pg_temp.query_true($query$
    select count(*) = 1
      and bool_and(l.quantity = 1 and l.direction = 'in')
    from public.stock_ledger l
    join public.returns r on r.id = l.return_id
    where r.external_reference = 'FIX-RETURN-MIXED'
      and l.source_type = 'return_resellable'
  $query$),
  'Assert: the resellable mixed line creates exactly one inbound ledger row'
);

select ok(
  pg_temp.query_true($query$
    select count(*) = 1
      and bool_and(c.type = 'damaged' and c.quantity = 1)
    from public.claim_loss_record c
    join public.returns r on r.id = c.return_case_id
    where r.external_reference = 'FIX-RETURN-MIXED'
  $query$),
  'Assert: the damaged mixed line creates one claim/loss row'
);

select is(
  (
    select count(*)::bigint
    from public.stock_ledger l
    join public.returns r on r.id = l.return_id
    where r.external_reference = 'FIX-RETURN-MIXED'
  ),
  1::bigint,
  'Assert: damaged mixed inspection creates no second ledger movement'
);

-- Returns — Arrange/Act: TikTok lost return and submission-based deadline.
select lives_ok(
  $sql$
    select public.process_stock_event($event$
      {
        "idempotencyKey": "return-tiktok-lost-submit",
        "channel": "tiktok",
        "type": "return.submitted",
        "occurredAt": "2026-06-01T12:00:00Z",
        "externalReference": "FIX-RETURN-TIKTOK-LOST",
        "payload": {
          "orderId": "60000000-0000-4000-8000-000000000002",
          "lines": [{
            "fulfillmentAllocationId": "71000000-0000-4000-8000-000000000002",
            "quantity": 1
          }]
        }
      }
    $event$::jsonb)
  $sql$,
  'Act: a TikTok component return can be submitted'
);

select ok(
  pg_temp.query_true($query$
    select claim_deadline::date = date '2026-07-11'
    from public.returns
    where external_reference = 'FIX-RETURN-TIKTOK-LOST'
  $query$),
  'Assert: the TikTok 40-day deadline starts when the return is submitted'
);

select lives_ok(
  $sql$
    select public.process_stock_event($event$
      {
        "idempotencyKey": "return-tiktok-lost-inspect",
        "channel": "tiktok",
        "type": "return.inspected",
        "occurredAt": "2026-06-10T12:00:00Z",
        "externalReference": "FIX-RETURN-TIKTOK-LOST-INSPECTION",
        "payload": {
          "returnReference": "FIX-RETURN-TIKTOK-LOST",
          "lines": [{
            "fulfillmentAllocationId": "71000000-0000-4000-8000-000000000002",
            "condition": "lost_in_transit"
          }]
        }
      }
    $event$::jsonb)
  $sql$,
  'Act: a submitted TikTok component can be inspected as lost in transit'
);

select ok(
  pg_temp.query_true($query$
    select count(*) = 1
    from public.claim_loss_record c
    join public.returns r on r.id = c.return_case_id
    where r.external_reference = 'FIX-RETURN-TIKTOK-LOST'
      and c.type = 'lost_in_transit'
  $query$),
  'Assert: lost stock creates a distinct lost-in-transit claim record'
);

select ok(
  pg_temp.query_true($query$
    select count(*) = 0
    from public.stock_ledger l
    join public.returns r on r.id = l.return_id
    where r.external_reference = 'FIX-RETURN-TIKTOK-LOST'
  $query$),
  'Assert: lost stock creates no second ledger movement'
);

select ok(
  pg_temp.query_true($query$
    select count(distinct type) = 2
    from public.claim_loss_record
    where type in ('damaged', 'lost_in_transit')
  $query$),
  'Assert: damaged and lost conditions remain distinct claim types'
);

select ok(
  pg_temp.query_true($query$
    select claim_deadline::date = date '2026-07-11'
    from public.returns
    where external_reference = 'FIX-RETURN-TIKTOK-LOST'
  $query$),
  'Assert: later inspection does not move the TikTok submission deadline'
);

-- Corrections — Act: partially reverse a fulfillment ledger entry.
select lives_ok(
  $sql$
    select public.correct_ledger_entry(
      '{
        "sourceLedgerId": "70000000-0000-4000-8000-000000000002",
        "quantity": 1,
        "referenceNote": "Perbaiki satu unit fulfillment Shopee"
      }'::jsonb
    )
  $sql$,
  'Act: a source ledger entry can be partially corrected'
);

select ok(
  pg_temp.query_true($query$
    select count(*) = 1
    from public.stock_ledger
    where source_ref_id = '70000000-0000-4000-8000-000000000002'
      and source_type = 'manual_correction'
  $query$),
  'Assert: a correction links to its source ledger row'
);

select ok(
  pg_temp.query_true($query$
    select bool_and(quantity = 1 and direction = 'in')
    from public.stock_ledger
    where source_ref_id = '70000000-0000-4000-8000-000000000002'
      and source_type = 'manual_correction'
  $query$),
  'Assert: a correction reverses only the requested quantity and direction'
);

select ok(
  pg_temp.query_true($query$
    select count(*) = 1
      and min(quantity) = 2
      and min(direction) = 'out'
      and min(source_type::text) = 'order_fulfillment'
    from public.stock_ledger
    where id = '70000000-0000-4000-8000-000000000002'
  $query$),
  'Assert: correction leaves the original ledger row unchanged'
);

select lives_ok(
  $sql$
    select public.correct_ledger_entry(
      '{
        "sourceLedgerId": "70000000-0000-4000-8000-000000000002",
        "quantity": 1,
        "referenceNote": "Habiskan sisa koreksi fulfillment Shopee"
      }'::jsonb
    )
  $sql$,
  'Act: the remaining correctable quantity can be reversed'
);

select ok(
  pg_temp.query_true($query$
    select count(*) = 2 and sum(quantity) = 2
    from public.stock_ledger
    where source_ref_id = '70000000-0000-4000-8000-000000000002'
      and source_type = 'manual_correction'
  $query$),
  'Assert: partial corrections cannot exceed the source quantity in aggregate'
);

select throws_like(
  $sql$
    select public.correct_ledger_entry(
      '{
        "sourceLedgerId": "70000000-0000-4000-8000-000000000002",
        "quantity": 1,
        "referenceNote": "Melebihi kuantitas sumber"
      }'::jsonb
    )
  $sql$,
  '%remaining correctable quantity%',
  'Reject: correction above the remaining source quantity fails'
);

select lives_ok(
  $sql$
    select public.correct_ledger_entry(
      '{
        "sourceLedgerId": "70000000-0000-4000-8000-000000000003",
        "quantity": 2,
        "referenceNote": "Pembalikan penuh fulfillment TikTok"
      }'::jsonb
    )
  $sql$,
  'Act: a source ledger entry can be fully reversed once'
);

select ok(
  pg_temp.query_true($query$
    select count(*) = 1 and sum(quantity) = 2
    from public.stock_ledger
    where source_ref_id = '70000000-0000-4000-8000-000000000003'
      and source_type = 'manual_correction'
  $query$),
  'Assert: one full reversal is linked to its source row'
);

select throws_like(
  $sql$
    select public.correct_ledger_entry(
      '{
        "sourceLedgerId": "70000000-0000-4000-8000-000000000003",
        "quantity": 2,
        "referenceNote": "Duplikat pembalikan penuh"
      }'::jsonb
    )
  $sql$,
  '%remaining correctable quantity%',
  'Reject: a duplicate full reversal cannot be created'
);

-- Stocktake — Negative: any invalid count rolls back every certification side effect.
select throws_like(
  $sql$
    select public.certify_stocktake(
      '{
        "sessionId": "80000000-0000-4000-8000-000000000001",
        "sessionName": "Opname atomik gagal",
        "openedAt": "2026-08-04T08:00:00Z",
        "counts": [
          {
            "batchId": "40000000-0000-4000-8000-000000000002",
            "recordedQtySnapshot": 5,
            "countedQty": 4
          },
          {
            "batchId": "40000000-0000-4000-8000-000000000001",
            "recordedQtySnapshot": 10,
            "countedQty": -1
          }
        ]
      }'::jsonb
    )
  $sql$,
  '%counted quantity must be non-negative%',
  'Reject: a stocktake containing an invalid count fails atomically'
);

select ok(
  pg_temp.query_true($query$
    select count(*) = 0
    from public.opname_sessions
    where id = '80000000-0000-4000-8000-000000000001'
  $query$),
  'Assert: failed certification leaves no stocktake session'
);

select ok(
  pg_temp.query_true($query$
    select count(*) = 0
    from public.opname_entries
    where session_id = '80000000-0000-4000-8000-000000000001'
  $query$),
  'Assert: failed certification leaves no count snapshots'
);

select ok(
  pg_temp.query_true($query$
    select count(*) = 0
    from public.stock_ledger
    where opname_session_id = '80000000-0000-4000-8000-000000000001'
  $query$),
  'Assert: failed certification leaves no stocktake adjustment ledger rows'
);

select ok(
  pg_temp.query_true($query$
    select count(*) = 0
    from public.opening_balance_verifications
    where opname_session_id = '80000000-0000-4000-8000-000000000001'
  $query$),
  'Assert: failed certification leaves no opening verification records'
);

-- Stocktake — Act: snapshot, count, adjust, close, and verify in one RPC.
select lives_ok(
  $sql$
    select public.certify_stocktake(
      '{
        "sessionId": "80000000-0000-4000-8000-000000000002",
        "sessionName": "Opname atomik berhasil",
        "openedAt": "2026-08-04T09:00:00Z",
        "counts": [{
          "batchId": "40000000-0000-4000-8000-000000000002",
          "recordedQtySnapshot": 5,
          "countedQty": 3
        }]
      }'::jsonb
    )
  $sql$,
  'Act: a valid stocktake is certified atomically'
);

select ok(
  pg_temp.query_true($query$
    select count(*) = 1
      and min(system_stock) = 5
      and min(physical_count) = 3
      and min(discrepancy) = -2
      and bool_and(correction_applied)
    from public.opname_entries
    where session_id = '80000000-0000-4000-8000-000000000002'
      and batch_id = '40000000-0000-4000-8000-000000000002'
  $query$),
  'Assert: certification persists the opening snapshot and physical count'
);

select ok(
  pg_temp.query_true($query$
    select count(*) = 1
      and min(quantity) = 2
      and min(direction) = 'out'
      and min(source_type::text) = 'opname_correction'
    from public.stock_ledger
    where opname_session_id = '80000000-0000-4000-8000-000000000002'
  $query$),
  'Assert: certification creates the exact opname correction ledger row'
);

select ok(
  pg_temp.query_true($query$
    select count(*) = 1
      and min(status) = 'COMPLETED'
      and bool_and(completed_at is not null)
    from public.opname_sessions
    where id = '80000000-0000-4000-8000-000000000002'
  $query$),
  'Assert: certification closes the stocktake session'
);

select ok(
  pg_temp.query_true($query$
    select count(*) = 1
      and bool_and(created_by = '10000000-0000-4000-8000-000000000001'::uuid)
      and bool_and(completed_by = '10000000-0000-4000-8000-000000000001'::uuid)
    from public.opname_sessions
    where id = '80000000-0000-4000-8000-000000000002'
  $query$),
  'Assert: stocktake opening and closure derive the authenticated actor'
);

select ok(
  pg_temp.query_true($query$
    select count(*) = 1
      and bool_and(initial_ledger_id = '70000000-0000-4000-8000-000000000004'::uuid)
      and bool_and(verified_by = '10000000-0000-4000-8000-000000000001'::uuid)
      and bool_and(verified_at is not null)
    from public.opening_balance_verifications
    where opname_session_id = '80000000-0000-4000-8000-000000000002'
  $query$),
  'Assert: first certification creates a linked opening-balance verification'
);

select ok(
  pg_temp.query_true($query$
    select count(*) = 1
      and min(quantity) = 5
      and bool_and(is_unverified)
    from public.stock_ledger
    where id = '70000000-0000-4000-8000-000000000004'
  $query$),
  'Assert: opening verification does not mutate the original opening ledger row'
);

select throws_like(
  $sql$
    update public.stock_ledger
    set quantity = 3
    where opname_session_id = '80000000-0000-4000-8000-000000000002'
  $sql$,
  '%stock_ledger%',
  'Reject: a stocktake adjustment ledger row cannot be updated'
);

select throws_like(
  $sql$
    delete from public.stock_ledger
    where opname_session_id = '80000000-0000-4000-8000-000000000002'
  $sql$,
  '%stock_ledger%',
  'Reject: a stocktake adjustment ledger row cannot be deleted'
);

select * from finish();
rollback;
