
revoke execute on function public.allocate_batch_fefo(uuid, integer) from public, anon;
revoke execute on function public.record_stock_movement(uuid, text, text, text, integer, text, uuid, uuid, uuid) from public, anon;
revoke execute on function public.process_shipment(uuid) from public, anon;
revoke execute on function public.process_cancellation(uuid, text) from public, anon;
revoke execute on function public.process_return(uuid, text, text) from public, anon;
revoke execute on function public.daily_consistency_check() from public, anon;
revoke execute on function public.apply_opname_correction(uuid) from public, anon;
revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
revoke execute on function public.current_user_role() from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.forbid_ledger_mutation() from public, anon, authenticated;
