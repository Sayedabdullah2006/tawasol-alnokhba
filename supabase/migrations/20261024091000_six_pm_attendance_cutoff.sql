-- Effective prospectively: historical attendance and payroll keep their prior cutoff.
create function workforce_private.regular_work_end(p_day date)
returns time language sql immutable set search_path='' as $$
 select case when p_day>=date '2026-10-24' then time '18:00' else time '17:00' end
$$;
revoke all on function workforce_private.regular_work_end(date) from public,anon;
grant execute on function workforce_private.regular_work_end(date) to authenticated,service_role;

do $$
declare f record; body text; day_expr text;
begin
 for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='public' and p.proname='wf_work_command') or
 (n.nspname='workforce_private' and p.proname in ('attendance_payroll','daily_payroll_accrual','guard_work_correction','reconcile_work_correction','next_daily_work_confirmation','post_missing_hours','quote_overtime','validate_missing_hours'))
 loop
  body:=pg_get_functiondef(f.oid);
  foreach day_expr in array array['new.work_day','work_date','p_day','today','day','d'] loop
   body:=replace(body,day_expr||'+time ''17:00''',day_expr||'+workforce_private.regular_work_end('||day_expr||')');
  end loop;
  body:=replace(body,$s$(tick at time zone 'Asia/Riyadh')::time>=time '17:00'$s$,$s$(tick at time zone 'Asia/Riyadh')::time>=workforce_private.regular_work_end((tick at time zone 'Asia/Riyadh')::date)$s$);
  body:=replace(body,$s$(tick at time zone 'Asia/Riyadh')::time<time '17:00'$s$,$s$(tick at time zone 'Asia/Riyadh')::time<workforce_private.regular_work_end((tick at time zone 'Asia/Riyadh')::date)$s$);
  body:=replace(body,$s$(new.checked_out at time zone 'Asia/Riyadh')::time>time '17:00'$s$,$s$(new.checked_out at time zone 'Asia/Riyadh')::time>workforce_private.regular_work_end((new.checked_in at time zone 'Asia/Riyadh')::date)$s$);
  body:=replace(body,$s$(new.checked_in at time zone 'Asia/Riyadh')::date+time '17:00'$s$,$s$(new.checked_in at time zone 'Asia/Riyadh')::date+workforce_private.regular_work_end((new.checked_in at time zone 'Asia/Riyadh')::date)$s$);
  body:=replace(body,'قبل الخامسة مساءً','قبل نهاية الدوام');
  body:=replace(body,'وحتى الخامسة مساءً','وحتى نهاية الدوام لليوم المحدد');
  body:=replace(body,'بعد الخامسة مساءً','بعد نهاية الدوام');
  body:=replace(body,'من التاسعة إلى الخامسة','المعتمدة لليوم المحدد');
  execute body;
 end loop;
end $$;

-- The planned-task sizing window stays eight hours; extending the attendance
-- cutoff does not change the daily target or historical performance weights.
alter table public.wf_attendance_settings alter column ends_at set default '18:00';
do $$
begin
 if exists(select 1 from pg_trigger where tgrelid='public.wf_attendance_settings'::regclass and tgname='wf_attendance_setting_notifications') then
  alter table public.wf_attendance_settings disable trigger wf_attendance_setting_notifications;
 end if;
 update public.wf_attendance_settings set ends_at='18:00' where schedule_mode='flexible' and ends_at='17:00';
 if exists(select 1 from pg_trigger where tgrelid='public.wf_attendance_settings'::regclass and tgname='wf_attendance_setting_notifications') then
  alter table public.wf_attendance_settings enable trigger wf_attendance_setting_notifications;
 end if;
end $$;
update public.wf_attendance_sessions
set next_confirmation_at=case when next_confirmation_at=cutoff_at then (business_date+time '18:00') at time zone 'Asia/Riyadh' else next_confirmation_at end,
 cutoff_at=(business_date+time '18:00') at time zone 'Asia/Riyadh'
where checked_out is null and policy_version=1 and source='clock' and overtime_request_id is null and business_date>=date '2026-10-24'
 and cutoff_at=(business_date+time '17:00') at time zone 'Asia/Riyadh';
