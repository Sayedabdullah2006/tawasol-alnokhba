-- Read-only report: use a saved statement when present, otherwise project the
-- contractual salary. A projection never approves a payroll or records payment.
create function workforce_private.monthly_payroll_mail_data(p_day date)
returns setof jsonb language plpgsql stable set search_path='' as $$
declare e record; p public.wf_monthly_payroll; first_day date:=date_trunc('month',p_day)::date;
 last_day date:=(date_trunc('month',p_day)+interval '1 month - 1 day')::date;
 period_start date; denominator numeric; basic numeric; allowances numeric; missing integer;
 gross numeric; insurance numeric; attendance numeric; other numeric; net numeric;
 insurance_detail jsonb; attendance_detail jsonb; source text;
begin
 for e in select emp.id,emp.user_id,emp.full_name,emp.start_date,u.email from public.wf_employees emp
 join auth.users u on u.id=emp.user_id join public.profiles profile on profile.id=emp.user_id
 where emp.status='active' and profile.role='employee' and emp.start_date<=last_day
 and u.deleted_at is null and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now())
 and not exists(select 1 from workforce_private.test_runs t where t.ended_at is null and t.expires_at>now() and emp.user_id=any(t.participants))
 loop
  period_start:=greatest(first_day,e.start_date);
  select * into p from public.wf_monthly_payroll where employee_id=e.id and month=first_day;
  if found then
   gross:=p.total_amount+p.deductions_amount; attendance:=p.attendance_amount;
   select coalesce(sum((x->>'amount')::numeric),0) into insurance from jsonb_array_elements(p.deductions) x where x->>'kind'='insurance';
   other:=p.deductions_amount-attendance-insurance;net:=p.total_amount;
   attendance_detail:=p.attendance_details;source:='statement';
  else
   denominator:=case when period_start>first_day then 30 else extract(day from last_day) end;
   with days as(select generate_series(period_start::timestamp,last_day::timestamp,interval '1 day')::date d),
   terms as(select c.basic_salary,c.allowances from days left join lateral
    (select c.basic_salary,c.allowances from public.wf_compensation_versions c where c.employee_id=e.id and c.effective_from<=days.d order by c.effective_from desc,c.revision desc limit 1) c on true)
   select round(sum(basic_salary)/denominator,2),round(sum(basic_salary+coalesce((select sum((a->>'amount')::numeric) from jsonb_array_elements(terms.allowances) a),0))/denominator,2)-round(sum(basic_salary)/denominator,2),count(*) filter(where basic_salary is null)
   into basic,allowances,missing from terms;
   if missing>0 then raise exception 'Salary settings missing for monthly report' using errcode='PT409';end if;
   insurance_detail:=workforce_private.insurance_payroll(e.id,first_day);
   if insurance_detail is null then raise exception 'Insurance settings missing for monthly report' using errcode='PT409';end if;
   insurance:=(insurance_detail->>'amount')::numeric;
   gross:=basic+allowances+workforce_private.overtime_total(e.id,first_day)+workforce_private.expense_total(e.id,first_day);
   attendance_detail:=workforce_private.attendance_payroll(e.id,first_day);
   attendance:=least((attendance_detail->>'calculated_amount')::numeric,greatest(0,gross-insurance));
   other:=0;net:=gross-insurance-attendance;source:='projection';
  end if;
  if net<0 or other<0 then raise exception 'Payroll report totals invalid';end if;
  return next jsonb_build_object('employeeId',e.id,'recipientId',e.user_id,
   'snapshot',jsonb_build_object('email',e.email,'name',e.full_name,'kind','monthly_payroll',
    'title','ملخص مستحقات راتب '||to_char(first_day,'YYYY-MM'),'href','/employee/finance/overview','createdAt',now(),
    'payrollReport',jsonb_build_object('month',to_char(first_day,'YYYY-MM'),'startDate',e.start_date,
    'periodStart',period_start,'periodEnd',last_day,'gross',round(gross,2)::text,
    'attendance',round(attendance,2)::text,'insurance',round(insurance,2)::text,'otherDeductions',round(other,2)::text,
    'net',round(net,2)::text,'attendanceThrough',attendance_detail->>'through','source',source)));
 end loop;
end $$;
revoke all on function workforce_private.monthly_payroll_mail_data(date) from public,anon,authenticated;
grant execute on function workforce_private.monthly_payroll_mail_data(date) to service_role;

create function public.wf_generate_monthly_payroll_emails()
returns jsonb language plpgsql set search_path='' as $$
declare local_now timestamp:=now() at time zone 'Asia/Riyadh'; report jsonb; notice uuid; added integer:=0;
begin
 if extract(day from local_now)<>28 or local_now::time<time '10:00'
  or not exists(select 1 from public.wf_notification_delivery_settings where id and enabled)
  then return jsonb_build_object('created',0);end if;
 perform pg_advisory_xact_lock(74122,80);
 -- Refresh saved unpaid statements before taking their immutable mail snapshot.
 perform workforce_private.refresh_attendance_payroll(e.id,date_trunc('month',local_now)::date)
 from public.wf_employees e where e.status='active';
 for report in select * from workforce_private.monthly_payroll_mail_data(local_now::date) loop
  notice:=null;
  insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
  values((report->>'recipientId')::uuid,'monthly_payroll',report->'snapshot'->>'title',
   'صافي المستحق: '||(report->'snapshot'->'payrollReport'->>'net')||' ريال',
   '/employee/finance/overview','monthly-payroll:'||(report->>'employeeId')||':'||to_char(local_now,'YYYY-MM'))
  on conflict(recipient_id,event_key) do nothing returning id into notice;
  if notice is not null then
   -- The existing queue trigger handles recipient validation and worker wake-up.
   -- Replace the generic snapshot atomically before the worker can see the row.
   update public.wf_notification_deliveries set snapshot=report->'snapshot' where notification_id=notice;
   added:=added+1;
  end if;
 end loop;
 return jsonb_build_object('created',added);
end $$;
revoke all on function public.wf_generate_monthly_payroll_emails() from public,anon,authenticated;
grant execute on function public.wf_generate_monthly_payroll_emails() to service_role;

create or replace function workforce_private.notification_group(p_kind text)
returns text language sql immutable set search_path='' as $$
 select case when p_kind='knowledge_file' then 'knowledge' when p_kind='weekly_report' then 'weekly_reports'
 when p_kind in ('attendance_confirmation','due_24h','due_2h','overdue','approval_digest','admin_digest','document_expiry','contract_expiry','attendance_missing','attendance_reminder','attendance_missing_admin') then 'reminders'
 when p_kind in ('payroll','monthly_payroll') then 'finance' when p_kind in ('employee_request','profile_request') then 'requests'
 when p_kind in ('hr','attendance_in','attendance_out') then 'hr' else 'tasks' end;
$$;

-- UTC 07:00 = Riyadh 10:00. Retry during the day; event_key prevents duplicates.
select cron.schedule('workforce-monthly-payroll-emails','*/15 7-20 28 * *',
 'select public.wf_generate_monthly_payroll_emails();');
