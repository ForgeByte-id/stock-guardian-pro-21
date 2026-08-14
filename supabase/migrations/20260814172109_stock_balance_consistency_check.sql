-- Read-only reconciliation against the append-only ledger and its O(1) summary.
create or replace function public.stock_balance_consistency_check()
returns table (
  batch_id uuid,
  product_name text,
  batch_number text,
  expected_stock integer,
  recorded_stock integer,
  diff integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with ledger_balances as (
    select
      l.batch_id,
      coalesce(sum(
        case when l.direction = 'in' then l.quantity else -l.quantity end
      ), 0)::integer as expected_stock
    from public.stock_ledger as l
    group by l.batch_id
  )
  select
    b.id,
    p.name,
    b.batch_number,
    coalesce(lb.expected_stock, 0),
    coalesce(s.balance_qty, 0),
    coalesce(s.balance_qty, 0) - coalesce(lb.expected_stock, 0)
  from public.batches as b
  join public.products as p on p.id = b.product_id
  left join ledger_balances as lb on lb.batch_id = b.id
  left join public.stock_balance_summary as s
    on s.batch_id = b.id
    and s.product_id = b.product_id
  where s.batch_id is null
    or coalesce(s.balance_qty, 0) <> coalesce(lb.expected_stock, 0)
  order by p.name, b.batch_number;
$$;

grant execute on function public.stock_balance_consistency_check() to authenticated;
