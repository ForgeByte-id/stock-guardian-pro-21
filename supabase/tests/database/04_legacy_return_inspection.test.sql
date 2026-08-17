begin;

\ir 00_test_helpers.inc

select plan(12);

select ok(
  has_function_privilege('authenticated', 'public.inspect_legacy_return(uuid,text,text)', 'execute'),
  'Authenticated admins can execute the legacy inspection compatibility RPC'
);

select ok(
  not has_function_privilege('anon', 'public.inspect_legacy_return(uuid,text,text)', 'execute'),
  'Anonymous callers cannot execute the legacy inspection compatibility RPC'
);

reset role;

insert into public.returns (id, order_id, return_date, condition)
values
  (
    '72000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000001',
    '2026-08-01',
    'PENDING_INSPECTION'
  ),
  (
    '72000000-0000-4000-8000-000000000002',
    '60000000-0000-4000-8000-000000000002',
    '2026-08-02',
    'PENDING_INSPECTION'
  );

set local role authenticated;

select lives_ok(
  $sql$
    select public.inspect_legacy_return(
      '72000000-0000-4000-8000-000000000001',
      'RESALABLE',
      'Legacy sellable inspection fixture'
    )
  $sql$,
  'Legacy sellable return can be inspected'
);

select is(
  (select condition from public.returns where id = '72000000-0000-4000-8000-000000000001'),
  'RESALABLE',
  'Legacy sellable return leaves the pending state'
);

select is(
  (
    select count(*)::bigint
    from public.batches
    where origin = 'retur'
      and batch_number like 'RET-20260801-%'
  ),
  1::bigint,
  'Legacy sellable return creates a new return-origin batch'
);

select is(
  (
    select count(*)::bigint
    from public.stock_ledger
    where return_id = '72000000-0000-4000-8000-000000000001'
      and source_type = 'return_resellable'
      and direction = 'in'
      and quantity = 2
  ),
  1::bigint,
  'Legacy sellable return writes one inbound ledger entry'
);

select is(
  (
    select balance_qty
    from public.stock_balance_summary
    where batch_id = (
      select batch_id
      from public.stock_ledger
      where return_id = '72000000-0000-4000-8000-000000000001'
    )
  ),
  2,
  'Legacy sellable batch balance is derived from its ledger entry'
);

select lives_ok(
  $sql$
    select public.inspect_legacy_return(
      '72000000-0000-4000-8000-000000000002',
      'LOST',
      'Legacy lost inspection fixture'
    )
  $sql$,
  'Legacy lost return can be inspected'
);

select is(
  (
    select count(*)::bigint
    from public.claim_loss_record
    where return_case_id = '72000000-0000-4000-8000-000000000002'
      and type = 'lost_in_transit'
  ),
  1::bigint,
  'Legacy lost return creates one claim/loss record'
);

select is(
  (
    select count(*)::bigint
    from public.stock_ledger
    where return_id = '72000000-0000-4000-8000-000000000002'
  ),
  0::bigint,
  'Legacy lost return does not write a second stock movement'
);

select is(
  (
    public.inspect_legacy_return(
      '72000000-0000-4000-8000-000000000002',
      'LOST',
      'Duplicate retry'
    )->>'status'
  ),
  'duplicate',
  'Identical legacy inspection retry is idempotent'
);

select is(
  (
    select count(*)::bigint
    from public.claim_loss_record
    where return_case_id = '72000000-0000-4000-8000-000000000002'
  ),
  1::bigint,
  'Legacy inspection retry does not duplicate claim/loss records'
);

select * from finish();
rollback;
