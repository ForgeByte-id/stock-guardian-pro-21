begin;

-- Arrange: deterministic fixture data and authenticated admin request context.
\ir 00_test_helpers.inc

select plan(30);

-- Act and Assert: direct authenticated writes cannot bypass the stock RPCs (FR-204/FR-704).
select throws_like(
  $$insert into public.stock_ledger default values$$,
  '%permission denied for table stock_ledger%',
  'authenticated cannot insert directly into stock_ledger'
);

select throws_like(
  $$update public.stock_ledger set notes = notes where false$$,
  '%permission denied for table stock_ledger%',
  'authenticated cannot update stock_ledger'
);

select throws_like(
  $$delete from public.stock_ledger where false$$,
  '%permission denied for table stock_ledger%',
  'authenticated cannot delete from stock_ledger'
);

select throws_like(
  $$truncate table public.stock_ledger$$,
  '%permission denied for table stock_ledger%',
  'authenticated cannot truncate stock_ledger'
);

-- Arrange: anonymous Data API role.
set local role anon;

-- Act and Assert: anonymous callers have no ledger write path.
select throws_like(
  $$insert into public.stock_ledger default values$$,
  '%permission denied for table stock_ledger%',
  'anon cannot insert directly into stock_ledger'
);

select throws_like(
  $$update public.stock_ledger set notes = notes where false$$,
  '%permission denied for table stock_ledger%',
  'anon cannot update stock_ledger'
);

select throws_like(
  $$delete from public.stock_ledger where false$$,
  '%permission denied for table stock_ledger%',
  'anon cannot delete from stock_ledger'
);

select throws_like(
  $$truncate table public.stock_ledger$$,
  '%permission denied for table stock_ledger%',
  'anon cannot truncate stock_ledger'
);

-- Arrange: restore the authenticated fixture actor.
set local role authenticated;

-- Act and Assert: every privileged public function has an empty, immutable search path.
select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and not coalesce(
        (
          select replace(setting, '"', '') = 'search_path='
          from unnest(p.proconfig) setting
          where setting like 'search_path=%'
        ),
        false
      )
  ),
  'SECURITY DEFINER functions use an empty search_path'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where n.nspname = 'public'
      and p.prosecdef
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot execute SECURITY DEFINER functions'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  'anon cannot execute SECURITY DEFINER functions'
);

select ok(
  (
    select count(*) = 4
      and bool_and(p.prosecdef)
      and bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(array[
        'record_goods_in',
        'record_manual_out',
        'correct_ledger_entry',
        'certify_stocktake'
      ])
      and oidvectortypes(p.proargtypes) = 'jsonb'
  ),
  'only authenticated can execute the four approved stock-write RPC contracts'
);

-- Act: receive stock through the approved RPC.
select lives_ok(
  $$
    select public.record_goods_in(
      '{
        "product_id":"30000000-0000-4000-8000-000000000001",
        "batch_number":"FIX-LEDGER-INTEGRITY",
        "production_date":"2026-07-01",
        "expiry_date":"2027-07-01",
        "quantity":20,
        "reference_note":"FIX-GOODS-IN"
      }'::jsonb
    )
  $$,
  'record_goods_in accepts a valid authenticated receipt'
);

-- Assert: the first write atomically produces the same summary and signed-ledger balance.
select results_eq(
  $$
    select
      s.balance_qty::bigint,
      coalesce(sum(case when l.direction = 'in' then l.quantity else -l.quantity end), 0)::bigint
    from public.batches b
    join public.stock_balance_summary s on s.batch_id = b.id and s.product_id = b.product_id
    left join public.stock_ledger l on l.batch_id = b.id
    where b.batch_number = 'FIX-LEDGER-INTEGRITY'
    group by s.balance_qty
  $$,
  $$values (20::bigint, 20::bigint)$$,
  'summary equals signed ledger SUM immediately after goods-in'
);

select ok(
  (
    select count(*) = 1
      and bool_and(
        to_jsonb(l)->>'created_by' = '10000000-0000-4000-8000-000000000001'
      )
    from public.stock_ledger l
    join public.batches b on b.id = l.batch_id
    where b.batch_number = 'FIX-LEDGER-INTEGRITY'
      and l.source_type::text = 'goods_in_maklon'
  ),
  'goods-in derives created_by from auth.uid()'
);

-- Act and Assert: each controlled-loss reason rejects an absent reference note (FR-302b/BR-15).
select throws_like(
  $$
    select public.record_manual_out(
      '{"product_id":"30000000-0000-4000-8000-000000000001","quantity":1,"reason":"bonus","channel":"internal"}'::jsonb
    )
  $$,
  '%reference_note%',
  'bonus requires reference_note'
);

select throws_like(
  $$
    select public.record_manual_out(
      '{"product_id":"30000000-0000-4000-8000-000000000001","quantity":1,"reason":"promo","channel":"internal"}'::jsonb
    )
  $$,
  '%reference_note%',
  'promo requires reference_note'
);

select throws_like(
  $$
    select public.record_manual_out(
      '{"product_id":"30000000-0000-4000-8000-000000000001","quantity":1,"reason":"sample","channel":"internal"}'::jsonb
    )
  $$,
  '%reference_note%',
  'sample requires reference_note'
);

select is(
  (
    select count(*)
    from public.stock_ledger l
    join public.batches b on b.id = l.batch_id
    where b.batch_number = 'FIX-LEDGER-INTEGRITY'
      and l.source_type::text = 'manual_out'
  ),
  0::bigint,
  'rejected manual-out payloads leave no ledger entry'
);

-- Act: record a valid bonus movement.
select lives_ok(
  $$
    select public.record_manual_out(
      '{"product_id":"30000000-0000-4000-8000-000000000001","quantity":1,"reason":"bonus","channel":"internal","reference_note":"FIX-BONUS"}'::jsonb
    )
  $$,
  'bonus with reference_note is accepted'
);

-- Assert: summary parity is preserved after the bonus write.
select results_eq(
  $$
    select
      s.balance_qty::bigint,
      coalesce(sum(case when l.direction = 'in' then l.quantity else -l.quantity end), 0)::bigint
    from public.batches b
    join public.stock_balance_summary s on s.batch_id = b.id and s.product_id = b.product_id
    left join public.stock_ledger l on l.batch_id = b.id
    where b.batch_number = 'FIX-LEDGER-INTEGRITY'
    group by s.balance_qty
  $$,
  $$values (19::bigint, 19::bigint)$$,
  'summary equals signed ledger SUM after bonus out'
);

-- Act: record a valid promo movement.
select lives_ok(
  $$
    select public.record_manual_out(
      '{"product_id":"30000000-0000-4000-8000-000000000001","quantity":1,"reason":"promo","channel":"internal","reference_note":"FIX-PROMO"}'::jsonb
    )
  $$,
  'promo with reference_note is accepted'
);

-- Assert: summary parity is preserved after the promo write.
select results_eq(
  $$
    select
      s.balance_qty::bigint,
      coalesce(sum(case when l.direction = 'in' then l.quantity else -l.quantity end), 0)::bigint
    from public.batches b
    join public.stock_balance_summary s on s.batch_id = b.id and s.product_id = b.product_id
    left join public.stock_ledger l on l.batch_id = b.id
    where b.batch_number = 'FIX-LEDGER-INTEGRITY'
    group by s.balance_qty
  $$,
  $$values (18::bigint, 18::bigint)$$,
  'summary equals signed ledger SUM after promo out'
);

-- Act: record a valid sample movement.
select lives_ok(
  $$
    select public.record_manual_out(
      '{"product_id":"30000000-0000-4000-8000-000000000001","quantity":1,"reason":"sample","channel":"internal","reference_note":"FIX-SAMPLE"}'::jsonb
    )
  $$,
  'sample with reference_note is accepted'
);

-- Assert: summary parity is preserved after the sample write.
select results_eq(
  $$
    select
      s.balance_qty::bigint,
      coalesce(sum(case when l.direction = 'in' then l.quantity else -l.quantity end), 0)::bigint
    from public.batches b
    join public.stock_balance_summary s on s.batch_id = b.id and s.product_id = b.product_id
    left join public.stock_ledger l on l.batch_id = b.id
    where b.batch_number = 'FIX-LEDGER-INTEGRITY'
    group by s.balance_qty
  $$,
  $$values (17::bigint, 17::bigint)$$,
  'summary equals signed ledger SUM after sample out'
);

select ok(
  (
    select count(*) = 4
      and bool_and(
        to_jsonb(l)->>'created_by' = '10000000-0000-4000-8000-000000000001'
      )
    from public.stock_ledger l
    join public.batches b on b.id = l.batch_id
    where b.batch_number = 'FIX-LEDGER-INTEGRITY'
  ),
  'every authenticated RPC write derives created_by from auth.uid()'
);

select results_eq(
  $$
    select lower(r.code), lower(c.code), l.reference_note
    from public.stock_ledger l
    join public.batches b on b.id = l.batch_id
    join public.movement_reasons r on r.id = l.reason_id
    join public.channels c on c.id = l.channel_id
    where b.batch_number = 'FIX-LEDGER-INTEGRITY'
      and l.reference_note in ('FIX-BONUS', 'FIX-PROMO', 'FIX-SAMPLE')
    order by l.reference_note
  $$,
  $$
    values
      ('bonus'::text, 'internal'::text, 'FIX-BONUS'::text),
      ('promo'::text, 'internal'::text, 'FIX-PROMO'::text),
      ('sample'::text, 'internal'::text, 'FIX-SAMPLE'::text)
  $$,
  'reason and channel remain distinct ledger attributes'
);

-- Act and Assert: an outflow larger than the available balance is rejected.
select throws_like(
  $$
    select public.record_manual_out(
      '{"product_id":"30000000-0000-4000-8000-000000000001","quantity":18,"reason":"offline","channel":"internal"}'::jsonb
    )
  $$,
  '%nsufficient%',
  'manual-out cannot produce a negative balance'
);

select results_eq(
  $$
    select
      s.balance_qty::bigint,
      coalesce(sum(case when l.direction = 'in' then l.quantity else -l.quantity end), 0)::bigint
    from public.batches b
    join public.stock_balance_summary s on s.batch_id = b.id and s.product_id = b.product_id
    left join public.stock_ledger l on l.batch_id = b.id
    where b.batch_number = 'FIX-LEDGER-INTEGRITY'
    group by s.balance_qty
  $$,
  $$values (17::bigint, 17::bigint)$$,
  'rejected negative balance leaves summary and ledger unchanged'
);

select ok(
  coalesce(
    (
      select min(s.balance_qty) >= 0
      from public.stock_balance_summary s
      join public.batches b on b.id = s.batch_id
      where b.batch_number = 'FIX-LEDGER-INTEGRITY'
    ),
    false
  ),
  'persisted stock balance is never negative'
);

select * from finish();
rollback;
