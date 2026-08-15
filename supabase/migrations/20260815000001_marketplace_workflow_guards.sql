-- Enforce marketplace workflow rules at the database boundary.

create or replace function public.enforce_marketplace_order_cutoff_transition()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'RESERVED'
     and new.status in ('SHIPPED', 'IN_TRANSIT') then
    raise exception 'order must enter PROCESSING before %', new.status;
  end if;

  return new;
end;
$$;

drop trigger if exists orders_marketplace_cutoff_transition_guard on public.orders;
create trigger orders_marketplace_cutoff_transition_guard
before update of status on public.orders
for each row
execute function public.enforce_marketplace_order_cutoff_transition();

create or replace function public.enforce_return_order_status()
returns trigger
language plpgsql
as $$
declare
  v_order_status text;
begin
  select status
  into v_order_status
  from public.orders
  where id = new.order_id;

  if v_order_status is null then
    raise exception 'return order not found';
  end if;

  if v_order_status not in ('SHIPPED', 'IN_TRANSIT', 'DELIVERED', 'RETURNED') then
    raise exception 'order cannot accept a return from %', v_order_status;
  end if;

  return new;
end;
$$;

drop trigger if exists returns_order_status_guard on public.returns;
create trigger returns_order_status_guard
before insert on public.returns
for each row
execute function public.enforce_return_order_status();
