-- A read timestamp is not payroll evidence. Keep it on the live balance RPC,
-- but out of persisted settlement JSON so closed attendance is idempotent.
do $$
declare f oid:='workforce_private.attendance_payroll(uuid,date)'::regprocedure;old_body text;body text;
begin
 select prosrc into old_body from pg_proc where oid=f;
 body:=replace(old_body,$s$jsonb_build_object('weekly_compensation',weekly,$s$,$s$jsonb_build_object('weekly_compensation',weekly-'as_of',$s$);
 if body=old_body then raise exception 'Weekly payroll seam changed; review snapshot stability patch';end if;
 execute replace(pg_get_functiondef(f),old_body,body);
end $$;
