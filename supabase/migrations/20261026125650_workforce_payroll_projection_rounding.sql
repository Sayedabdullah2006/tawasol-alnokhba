create or replace function workforce_private.monthly_payroll_mail_data(p_day date)
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

