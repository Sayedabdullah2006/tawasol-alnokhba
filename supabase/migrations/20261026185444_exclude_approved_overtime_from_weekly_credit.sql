-- An approved overtime interval is excluded even if an older/flexible clock
-- record covering it was not explicitly linked to the overtime request.
do $$declare f oid:='workforce_private.weekly_hours(uuid,date)'::regprocedure;old_body text;body text;marker text;replacement text;begin
 select prosrc into old_body from pg_proc where oid=f;
 marker:='), merged as(select range_agg(tstzrange(a,b,''[)'')) rr from ranges where b>a)';
 replacement:=$s$), overtime as (
   select range_agg(tstzrange(q.starts_at,q.ends_at,'[)')) rr from public.wf_employee_requests q
   where q.employee_id=p_employee and q.kind='overtime' and q.status='approved' and q.test_run_id is null and q.starts_at<hi and q.ends_at>lo
  ), regular as (
   select unnest(tstzmultirange(tstzrange(a,b,'[)'))-coalesce((select rr from overtime),'{}'::tstzmultirange)) r from ranges where b>a
  ), merged as(select range_agg(r) rr from regular)$s$;
 if (length(old_body)-length(replace(old_body,marker,'')))/length(marker)<>2 then raise exception 'Weekly range seam changed';end if;
 body:=replace(old_body,marker,replacement);execute replace(pg_get_functiondef(f),old_body,body);
end $$;

-- Settlement and live accrual use the same capped regular-hour ledger as the
-- bank. Never add bank credit to a base that still includes paid overtime.
do $$declare f record;old_body text;body text;begin
 for f in select oid,proname,prosrc from pg_proc where oid in
 ('workforce_private.attendance_payroll(uuid,date)'::regprocedure,'workforce_private.daily_payroll_accrual(public.wf_monthly_payroll)'::regprocedure) loop
  old_body:=f.prosrc;
  if f.proname='attendance_payroll' then
   body:=replace(old_body,$s$seconds:=least(daily*60,seconds+coalesce((select (v->>'applied_seconds')::numeric from jsonb_array_elements(weekly->'days') v where v->>'day'=d::text),0));$s$,
   $s$seconds:=coalesce((select least(daily*60,(v->>'base_credited_seconds')::numeric+(v->>'applied_seconds')::numeric) from jsonb_array_elements(weekly->'days') v where v->>'day'=d::text),seconds);$s$);
  else
   body:=replace(old_body,$s$credited:=least(daily*60,credited+coalesce((select (v->>'applied_seconds')::numeric from jsonb_array_elements(detail->'weekly_compensation'->'days') v where v->>'day'=today::text),0));$s$,
   $s$credited:=coalesce((select least(daily*60,(v->>'base_credited_seconds')::numeric+(v->>'applied_seconds')::numeric) from jsonb_array_elements(detail->'weekly_compensation'->'days') v where v->>'day'=today::text),credited);$s$);
  end if;
  if body=old_body then raise exception 'Weekly settlement seam changed: %',f.proname;end if;
  execute replace(pg_get_functiondef(f.oid),old_body,body);
 end loop;
end $$;

create function workforce_private.guard_paid_weekly_overtime() returns trigger
language plpgsql security invoker set search_path='' as $$
declare work_day date:=(new.starts_at at time zone 'Asia/Riyadh')::date;
begin
 if new.kind<>'overtime' or new.status<>'approved' or new.test_run_id is not null then return new;end if;
 if TG_OP='UPDATE' and old.kind='overtime' and old.status='approved' then return new;end if;
 if exists(select 1 from public.wf_monthly_payroll p cross join lateral jsonb_array_elements(p.attendance_details->'weekly_compensation'->'transfers') t
   where p.employee_id=new.employee_id and p.status='paid' and t->>'source_day'=work_day::text and (t->>'seconds')::numeric>0)
  and exists(select 1 from public.wf_attendance_sessions a cross join lateral workforce_private.work_credit_ranges(a,workforce_private.work_now()) r
   where a.employee_id=new.employee_id and a.overtime_request_id is null and r&&tstzrange(new.starts_at,new.ends_at,'[)')) then
  raise sqlstate 'PT409' using message='الفترة مرتبطة بتعويض ساعات مستخدم في كشف مصروف؛ راجع التسوية قبل اعتماد خارج الدوام';
 end if;
 return new;
end $$;
revoke all on function workforce_private.guard_paid_weekly_overtime() from public,anon,authenticated;
grant execute on function workforce_private.guard_paid_weekly_overtime() to service_role;
create trigger wf_overtime_paid_compensation_guard before insert or update on public.wf_employee_requests for each row execute function workforce_private.guard_paid_weekly_overtime();
