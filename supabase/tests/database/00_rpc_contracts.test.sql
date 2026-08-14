begin;

-- Arrange: deterministic fixture data and authenticated admin request context.
\ir 00_test_helpers.inc

select plan(5);

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

select * from finish();
rollback;
