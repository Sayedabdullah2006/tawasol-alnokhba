create or replace function workforce_private.hr_marker() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='UPDATE' and new.test_run_id is distinct from old.test_run_id then raise sqlstate 'PT409' using message='لا يمكن تغيير علامة الاختبار';end if;
 if TG_OP='INSERT' then
  if new.test_run_id is not null then perform public.wf_test_run('assert',new.created_by,new.test_run_id);
  elsif new.title ~* '^(QA-LIVE-|WF-TEST:|wf-qa-|QA-profile-)' then raise sqlstate 'PT400' using message='ابدأ جولة اختبار قبل إنشاء بيانات الاختبار';end if;
 end if;
 return new;
end $$;
create or replace function workforce_private.suppress_test_notification() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if (new.task_id is not null and exists(select 1 from public.wf_tasks where id=new.task_id and test_run_id is not null))
 or (new.event_key like 'employee-request:%' and exists(select 1 from public.wf_employee_requests where id::text=split_part(new.event_key,':',2) and test_run_id is not null))
 or (new.event_key like 'hr:%' and exists(select 1 from public.wf_hr_items where id::text=split_part(new.event_key,':',2) and test_run_id is not null))
 or new.body ~* '^(QA-LIVE-|WF-TEST:|wf-qa-|QA-profile-)' then return null;end if;
 return new;
end $$;
create or replace function workforce_private.notification_group(p_kind text) returns text language sql immutable set search_path='' as $$
 select case when p_kind in ('due_24h','due_2h','overdue','approval_digest','admin_digest','document_expiry','contract_expiry','attendance_missing','attendance_reminder') then 'reminders'
 when p_kind='payroll' then 'finance' when p_kind in ('employee_request','profile_request') then 'requests' when p_kind='hr' then 'hr' else 'tasks' end
$$;
