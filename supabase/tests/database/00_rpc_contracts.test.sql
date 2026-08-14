begin;

-- Arrange: deterministic fixture data and authenticated admin request context.
\ir 00_test_helpers.inc

select plan(8);

-- Act and Assert: resolve each approved public RPC by its exact argument types.
select has_function(
  'public',
  'record_goods_in',
  array['jsonb'],
  'record_goods_in(jsonb)'
);

select has_function(
  'public',
  'record_manual_out',
  array['jsonb'],
  'record_manual_out(jsonb)'
);

select has_function(
  'public',
  'process_stock_event',
  array['jsonb'],
  'process_stock_event(jsonb)'
);

select has_function(
  'public',
  'correct_ledger_entry',
  array['jsonb'],
  'correct_ledger_entry(jsonb)'
);

select has_function(
  'public',
  'certify_stocktake',
  array['jsonb'],
  'certify_stocktake(jsonb)'
);

select has_function(
  'public',
  'stock_balance_consistency_check',
  array[]::text[],
  'stock_balance_consistency_check()'
);

select lives_ok(
  $$select * from public.stock_balance_consistency_check()$$,
  'authenticated can run the stock balance consistency check'
);

set local role anon;

select throws_like(
  $$select * from public.stock_balance_consistency_check()$$,
  '%permission denied%',
  'anonymous cannot run the stock balance consistency check'
);

select * from finish();
rollback;
