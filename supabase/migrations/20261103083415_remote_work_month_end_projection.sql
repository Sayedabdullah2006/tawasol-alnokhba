-- Display-only month-end projection of approved agreements. Daily accrual,
-- the posted payroll and paid statements keep their existing accounting basis.
do $patch$
declare f oid;body text;previous text;
begin
 f:='public.wf_attendance_payroll_snapshot(uuid,uuid,date)'::regprocedure;
 select prosrc into body from pg_proc where oid=f;previous:=body;
 body:=replace(body,'''daily_accrual'',workforce_private.daily_payroll_accrual(p)',
 '''daily_accrual'',workforce_private.daily_payroll_accrual(p),''remote_work_projection'',case when p.status=''paid'' then null else workforce_private.remote_work_payroll(p.employee_id,p.month,(p.month+interval ''1 month - 1 day'')::date) end');
 if body=previous then raise exception 'Missing payroll snapshot projection seam';end if;
 execute replace(pg_get_functiondef(f),previous,body);
end $patch$;
