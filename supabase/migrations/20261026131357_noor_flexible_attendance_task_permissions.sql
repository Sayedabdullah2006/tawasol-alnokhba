-- Named employee exceptions. No client-controlled flag grants permissions.
alter table public.wf_employees
 add column allow_mobile_attendance boolean not null default false,
 add column flexible_workday_from date,
 add column can_delete_tasks boolean not null default false;

create function workforce_private.employee_work_end(p_employee uuid,p_day date)
returns time language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from public.wf_employees e where e.id=p_employee and e.flexible_workday_from<=p_day)
 then time '24:00' else workforce_private.regular_work_end(p_day) end
$$;
create function workforce_private.employee_work_start(p_employee uuid,p_day date)
returns time language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from public.wf_employees e where e.id=p_employee and e.flexible_workday_from<=p_day)
 then time '00:00' else time '09:00' end
$$;
create function workforce_private.employee_any_device(p_employee uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.wf_employees e where e.id=p_employee and e.status='active' and e.allow_mobile_attendance)
$$;
create function workforce_private.employee_next_confirmation(p_employee uuid,p_day date,p_after timestamptz)
returns timestamptz language sql stable security definer set search_path='' as $$
 select case when workforce_private.employee_work_end(p_employee,p_day)<>time '24:00'
 then workforce_private.next_daily_work_confirmation(p_day,p_after)
 else coalesce((select min(first_in+n*interval '2 hours') from
 (select coalesce(min(a.checked_in),p_after) first_in from public.wf_attendance_sessions a
  where a.employee_id=p_employee and a.business_date=p_day and a.source='clock' and a.overtime_request_id is null) f
 cross join generate_series(1,3) n where first_in+n*interval '2 hours'>p_after and first_in+n*interval '2 hours'<(p_day+time '24:00') at time zone 'Asia/Riyadh'),
 (p_day+time '24:00') at time zone 'Asia/Riyadh') end
$$;
revoke all on function workforce_private.employee_work_end(uuid,date),workforce_private.employee_work_start(uuid,date),workforce_private.employee_any_device(uuid),workforce_private.employee_next_confirmation(uuid,date,timestamptz) from public,anon,authenticated;
grant execute on function workforce_private.employee_work_end(uuid,date),workforce_private.employee_work_start(uuid,date),workforce_private.employee_any_device(uuid),workforce_private.employee_next_confirmation(uuid,date,timestamptz) to service_role;

-- Keep historical days under the policy applicable at that time.
do $$
declare f record; old_body text; body text; owner_expr text; day_expr text;
begin
 for f in select p.oid,p.proname,p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='public' and p.proname in ('wf_work_command','wf_meeting_presence')) or
 (n.nspname='workforce_private' and p.proname in ('attendance_payroll','daily_payroll_accrual','guard_work_correction','validate_missing_hours','post_missing_hours')) loop
  old_body:=f.prosrc;body:=old_body;
  owner_expr:=case f.proname when 'daily_payroll_accrual' then 'p.employee_id'
   when 'attendance_payroll' then 'p_employee'
   when 'wf_work_command' then 'employee' when 'wf_meeting_presence' then 'employee' else 'new.employee_id' end;
  foreach day_expr in array array['(tick at time zone ''Asia/Riyadh'')::date','(new.checked_in at time zone ''Asia/Riyadh'')::date','new.work_day','today','day','d'] loop
   body:=replace(body,'workforce_private.regular_work_end('||day_expr||')','workforce_private.employee_work_end('||owner_expr||','||day_expr||')');
  end loop;
  if f.proname='wf_work_command' then
   body:=replace(body,'if p_device is distinct from s.device_hash then','if p_device is distinct from s.device_hash and not workforce_private.employee_any_device(employee) then');
   body:=replace(body,'workforce_private.next_daily_work_confirmation(day,tick)','workforce_private.employee_next_confirmation(employee,day,tick)');
  elsif f.proname='wf_meeting_presence' then
   body:=replace(body,'s.device_hash is distinct from p_device','(s.device_hash is distinct from p_device and not workforce_private.employee_any_device(employee))');
   body:=replace(body,'workforce_private.next_daily_work_confirmation(s.business_date,tick)','workforce_private.employee_next_confirmation(employee,s.business_date,tick)');
  elsif f.proname in ('attendance_payroll','daily_payroll_accrual','post_missing_hours') then
   foreach day_expr in array array['today','d','new.work_day'] loop
    body:=replace(body,day_expr||'+time ''09:00''',day_expr||'+workforce_private.employee_work_start('||owner_expr||','||day_expr||')');
   end loop;
  elsif f.proname='guard_work_correction' then
   body:=replace(body,$s$(new.checked_out at time zone 'Asia/Riyadh')::date<>(new.checked_in at time zone 'Asia/Riyadh')::date$s$,
    $s$((new.checked_out at time zone 'Asia/Riyadh')::date<>(new.checked_in at time zone 'Asia/Riyadh')::date and new.checked_out<>(((new.checked_in at time zone 'Asia/Riyadh')::date+workforce_private.employee_work_end(new.employee_id,(new.checked_in at time zone 'Asia/Riyadh')::date)) at time zone 'Asia/Riyadh'))$s$);
  end if;
  if body=old_body then raise exception 'Unpatched employee work policy: %',f.proname;end if;
  execute replace(pg_get_functiondef(f.oid),old_body,body);
 end loop;
end $$;

do $$
declare f oid:='public.wf_work_snapshot(uuid,uuid)'::regprocedure; old_body text; body text;
begin
 select prosrc into old_body from pg_proc where oid=f;
 body:=replace(old_body,$s$'now',tick,$s$,$s$'now',tick,'attendancePolicy',jsonb_build_object('anyDevice',workforce_private.employee_any_device(employee),'flexibleDay',workforce_private.employee_work_end(employee,(tick at time zone 'Asia/Riyadh')::date)=time '24:00'),$s$);
 if body=old_body then raise exception 'Snapshot policy seam changed';end if;
 execute replace(pg_get_functiondef(f),old_body,body);
end $$;

-- Task permission patch (the existing command still owns its version and audit checks).
do $$
declare f oid:='public.wf_task_command(uuid,uuid,integer,text,jsonb,uuid)'::regprocedure; old_body text; body text;
begin
 select prosrc into old_body from pg_proc where oid=f;
 body:=replace(old_body,$s$if employee is not null then raise exception 'الحذف للمدير فقط'$s$,$s$if employee is not null and not exists(select 1 from public.wf_employees e where e.id=employee and e.status='active' and e.can_delete_tasks and e.can_manage_tasks) then raise exception 'الحذف للمدير أو المفوض فقط'$s$);
 body:=replace(body,$s$(task_manager and p_command='edit')$s$,$s$(task_manager and (p_command='edit' or p_command='archive' and exists(select 1 from public.wf_employees e where e.id=employee and e.can_delete_tasks)))$s$);
 body:=replace(body,$s$if employee is not null and self_owned is not true then raise exception 'أرشفة تكليف المدير غير مسموحة'$s$,$s$if employee is not null and self_owned is not true and not exists(select 1 from public.wf_employees e where e.id=employee and e.can_delete_tasks and e.can_manage_tasks) then raise exception 'أرشفة تكليف المدير غير مسموحة'$s$);
 if body=old_body or position('الحذف للمدير فقط' in body)>0 then raise exception 'Task permission seam changed';end if;
 execute replace(pg_get_functiondef(f),old_body,body);
end $$;

-- Retain the existing reminder schedule, but do not tell Noor that mobile confirmation is forbidden.
do $$
declare f oid:=to_regprocedure('public.wf_generate_work_confirmation_reminders(timestamptz)'); old_body text; body text;
begin
 if f is null then return;end if;
 select prosrc into old_body from pg_proc where oid=f;
 body:=replace(old_body,
 $s$E' بتوقيت الرياض.\nعدم التأكيد خلال المهلة يؤدي إلى تسجيل انصراف تلقائي.\nأكّدي من نفس جهاز ومتصفح تسجيل الحضور؛ فتح الرابط من الجوال لا يؤكد الجلسة ولا يجددها.'$s$,
 $s$E' بتوقيت الرياض.\nعدم التأكيد خلال المهلة يؤدي إلى تسجيل انصراف تلقائي.'||case when workforce_private.employee_any_device(s.employee_id) then E'\nيمكنك تأكيد الاستمرار من الجوال أو اللابتوب بعد تسجيل الدخول إلى حسابك؛ فتح الرابط وحده لا يؤكد الجلسة.' else E'\nأكّدي من نفس جهاز ومتصفح تسجيل الحضور؛ فتح الرابط من الجوال لا يؤكد الجلسة ولا يجددها.' end$s$);
 if body<>old_body then execute replace(pg_get_functiondef(f),old_body,body);end if;
end $$;

-- Apply only to the existing, active Noor record; resolve by its stable business identity.
do $$
declare target uuid; matched integer;
begin
 select count(*),min(id::text)::uuid into matched,target from public.wf_employees
 where lower(email)='noormahmoudbajunaid@hotmail.com' and status='active';
 if matched<>1 then raise exception 'Expected exactly one active Noor record';end if;
 alter table public.wf_employees disable trigger wf_employment_change_notifications;
 update public.wf_employees set allow_mobile_attendance=true,flexible_workday_from=date '2026-10-26',can_delete_tasks=true,can_manage_tasks=true where id=target;
 alter table public.wf_employees enable trigger wf_employment_change_notifications;
 update public.wf_attendance_sessions set cutoff_at=(business_date+time '24:00') at time zone 'Asia/Riyadh',
 next_confirmation_at=case when next_confirmation_at=cutoff_at then workforce_private.employee_next_confirmation(target,business_date,workforce_private.work_now()) else next_confirmation_at end
 where employee_id=target and business_date>=date '2026-10-26' and checked_out is null and policy_version=1 and overtime_request_id is null;
end $$;
