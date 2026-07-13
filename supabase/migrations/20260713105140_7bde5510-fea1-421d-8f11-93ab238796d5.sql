
-- 1) Fix mutable search_path on trigger function
CREATE OR REPLACE FUNCTION public.forbid_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
begin
  raise exception 'stock_ledger is append-only: % not allowed', TG_OP;
end;
$function$;

-- 2) Revoke EXECUTE on internal-only SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.allocate_batch_fefo(uuid, integer) FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, authenticated, anon;

-- 3) profiles: restrict SELECT to owner or admin/manager
DROP POLICY IF EXISTS "read profiles" ON public.profiles;
CREATE POLICY "read own or elevated profile" ON public.profiles
FOR SELECT TO authenticated
USING (id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

-- 4) orders: replace permissive policies with staff role checks
DROP POLICY IF EXISTS "read orders" ON public.orders;
DROP POLICY IF EXISTS "auth insert orders" ON public.orders;
DROP POLICY IF EXISTS "auth update orders" ON public.orders;

CREATE POLICY "staff read orders" ON public.orders
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'operator'));

CREATE POLICY "staff insert orders" ON public.orders
FOR INSERT TO authenticated
WITH CHECK (
  (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'operator'))
  AND (created_by IS NULL OR created_by = auth.uid())
);

CREATE POLICY "staff update orders" ON public.orders
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'operator'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'operator'));

CREATE POLICY "admin delete orders" ON public.orders
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin'));

-- 5) order_items: staff only
DROP POLICY IF EXISTS "read order_items" ON public.order_items;
DROP POLICY IF EXISTS "auth manage order_items" ON public.order_items;

CREATE POLICY "staff read order_items" ON public.order_items
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'operator'));

CREATE POLICY "staff write order_items" ON public.order_items
FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'operator'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'operator'));

-- 6) returns: staff only
DROP POLICY IF EXISTS "read returns" ON public.returns;
DROP POLICY IF EXISTS "auth manage returns" ON public.returns;

CREATE POLICY "staff read returns" ON public.returns
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'operator'));

CREATE POLICY "staff write returns" ON public.returns
FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'operator'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'operator'));

-- 7) opname_sessions: staff only (replace permissive SELECT)
DROP POLICY IF EXISTS "read opname_sessions" ON public.opname_sessions;
-- keep existing "auth manage opname_sessions" (already role-scoped)
CREATE POLICY "staff read opname_sessions" ON public.opname_sessions
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'operator'));

-- 8) opname_entries: staff only + counted_by = auth.uid() on writes
DROP POLICY IF EXISTS "read opname_entries" ON public.opname_entries;
DROP POLICY IF EXISTS "auth manage opname_entries" ON public.opname_entries;

CREATE POLICY "staff read opname_entries" ON public.opname_entries
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'operator'));

CREATE POLICY "staff insert opname_entries" ON public.opname_entries
FOR INSERT TO authenticated
WITH CHECK (
  (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'operator'))
  AND counted_by = auth.uid()
);

CREATE POLICY "staff update opname_entries" ON public.opname_entries
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'operator'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'operator'));

CREATE POLICY "admin delete opname_entries" ON public.opname_entries
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

-- 9) stock_ledger: restrict SELECT to staff
DROP POLICY IF EXISTS "read ledger" ON public.stock_ledger;
CREATE POLICY "staff read ledger" ON public.stock_ledger
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'operator'));
