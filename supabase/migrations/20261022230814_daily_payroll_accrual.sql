-- Read-time earned balance. The monthly ledger remains the month-end projection;
-- no payroll payment, notification or email is produced by this calculation.
create function workforce_private.daily_payroll_accrual(p public.wf_monthly_payroll) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare tick timestamptz:=workforce_private.work_now(); today date:=(tick at time zone 'Asia/Riyadh')::date;
 first_day date; last_day date:=(p.month+interval '1 month - 1 day')::date; cutoff date;
 days_total integer; days_elapsed integer; ratio numeric:=0; base numeric:=p.basic_amount+p.allowances_amount;
 gross numeric:=0; insurance numeric:=0; other numeric:=0; settlement numeric:=0; pending numeric:=0;
 credited numeric:=0; daily integer; workdays integer[]; paid_day boolean; term record; hourly numeric;
 detail jsonb; final boolean; day_gap numeric:=0; result numeric; award numeric;
 policy public.wf_employee_insurance_settings; insured_start date; insured_day date; insured_basis numeric:=0; insured_term numeric; insured_denominator numeric;
begin
 select greatest(p.month,e.start_date) into first_day from public.wf_employees e where e.id=p.employee_id;
 select cutoff_on into cutoff from workforce_private.payroll_attendance_policy where id;
 final:=p.status='paid' or today>last_day or today=last_day and today>=cutoff and (tick at time zone 'Asia/Riyadh')::time>=time '17:00';
 select coalesce(sum((d->>'amount')::numeric) filter(where d->>'kind'='insurance'),0),
  coalesce(sum((d->>'amount')::numeric) filter(where d->>'kind'<>'insurance'),0) into insurance,other from jsonb_array_elements(p.deductions) d;
 if final then
  return jsonb_build_object('starts_on',first_day,'through',last_day,'as_of',tick,'closed',true,
   'gross_amount',p.gross_amount::text,'insurance_amount',insurance::text,'other_amount',other::text,
   'attendance_amount',p.attendance_amount::text,'total_amount',p.total_amount::text,'current_credited_seconds',0);
 end if;
 days_total:=greatest(1,last_day-first_day+1);days_elapsed:=greatest(0,least(today,last_day)-first_day+1);
 ratio:=least(1,days_elapsed::numeric/days_total);
 -- The joining-month salary already uses the approved /30 proration. Distribute
 -- that period over its calendar days; a full month always accrues exactly its salary.
 gross:=base*ratio;insurance:=round(insurance*ratio,2);
 -- Calculate the contribution from source wages, not from an already-rounded
 -- monthly contribution. This also respects a later insurance effective date.
 select * into policy from public.wf_employee_insurance_settings where employee_id=p.employee_id;
 if found then
  insured_start:=greatest(first_day,policy.effective_from);
  insured_denominator:=case when insured_start>p.month then 30 else extract(day from last_day) end;
  for insured_day in select generate_series(insured_start::timestamp,least(today,last_day)::timestamp,interval '1 day')::date loop
   select c.basic_salary+coalesce((select sum((a->>'amount')::numeric) from jsonb_array_elements(c.allowances) a where coalesce(a->>'name','') ~* '(سكن|housing)'),0)
    into insured_term from public.wf_compensation_versions c where c.employee_id=p.employee_id and c.effective_from<=insured_day order by c.effective_from desc,c.revision desc limit 1;
   if not found then raise sqlstate 'PT409' using message='أكملي إعداد الراتب الأساسي وبدل السكن أولًا';end if;
   insured_basis:=insured_basis+insured_term;
  end loop;
  insurance:=round(insured_basis/insured_denominator*policy.rate/100,2);
 end if;
 detail:=workforce_private.attendance_payroll(p.employee_id,p.month);
 settlement:=(detail->>'calculated_amount')::numeric;
 if today between first_day and last_day then
  select s.daily_minutes,s.workdays into daily,workdays from public.wf_attendance_settings s where s.employee_id=p.employee_id;
  daily:=coalesce(daily,480);workdays:=coalesce(workdays,array[0,1,2,3,4,6]);
  paid_day:=extract(dow from today)::integer<>all(workdays) or to_char(today,'MM-DD') in ('02-22','09-23')
   or exists(select 1 from public.wf_paid_calendar_days where day=today)
   or exists(select 1 from public.wf_employee_requests q where q.employee_id=p.employee_id and q.test_run_id is null
    and q.kind='leave' and q.status='approved' and q.leave_type='paid'
    and today between (q.starts_at at time zone 'Asia/Riyadh')::date and (q.ends_at at time zone 'Asia/Riyadh')::date);
  if not paid_day then
   select (c.basic_salary+coalesce((select sum((a->>'amount')::numeric) from jsonb_array_elements(c.allowances) a),0))/30/8 hourly
    into term from public.wf_compensation_versions c where c.employee_id=p.employee_id and c.effective_from<=today order by c.effective_from desc,c.revision desc limit 1;
   if not found then raise sqlstate 'PT409' using message='أكملي إعداد راتب الموظفة للفترة أولًا';end if;
   hourly:=term.hourly;
   with ranges as (
    select greatest(lower(r),today::timestamp at time zone 'Asia/Riyadh') lo,
     least(upper(r),tick,(case when today<cutoff then (today+1)::timestamp else today+time '17:00' end) at time zone 'Asia/Riyadh') hi
    from public.wf_attendance_sessions a cross join lateral workforce_private.work_credit_ranges(a,tick) r
    where a.employee_id=p.employee_id and a.checked_in<((today+1)::timestamp at time zone 'Asia/Riyadh')
     and (a.checked_out>=today::timestamp at time zone 'Asia/Riyadh' or a.checked_out is null)
    union all
    select greatest(q.starts_at,(today+time '09:00') at time zone 'Asia/Riyadh'),least(q.ends_at,(today+time '17:00') at time zone 'Asia/Riyadh',tick)
    from public.wf_employee_requests q where q.employee_id=p.employee_id and q.test_run_id is null and q.kind='permission' and q.status='approved'
     and q.starts_at<((today+1)::timestamp at time zone 'Asia/Riyadh') and q.ends_at>today::timestamp at time zone 'Asia/Riyadh'
   ), merged as(select range_agg(tstzrange(lo,hi,'[)')) rr from ranges where hi>lo)
   select least(daily*60,coalesce(sum(extract(epoch from upper(r)-lower(r))),0)) into credited from merged cross join lateral unnest(rr) r;
   day_gap:=greatest(0,daily*60-credited)*hourly/3600;
   if (detail->>'through')::date=today then
    -- At 17:00 the monthly settlement includes today. Keep it exactly once.
    settlement:=greatest(0,settlement-round(day_gap,2));
   end if;
   pending:=least(base/days_total,day_gap);
  end if;
 end if;
 -- Recorded incentives are earned when entered; future salary is never included.
 award:=case when days_elapsed>0 then greatest(0,p.gross_amount-base) else 0 end;
 gross:=round(greatest(0,gross-pending)+award,2);settlement:=round(least(settlement,greatest(0,gross-insurance-other)),2);
 result:=greatest(0,gross-insurance-other-settlement);
 return jsonb_build_object('starts_on',first_day,'through',case when days_elapsed>0 then least(today,last_day) else null end,
  'as_of',tick,'closed',false,'gross_amount',gross::text,'insurance_amount',insurance::text,'other_amount',other::text,
  'attendance_amount',settlement::text,'total_amount',result::text,'current_credited_seconds',credited);
end $$;
revoke all on function workforce_private.daily_payroll_accrual(public.wf_monthly_payroll) from public,anon,authenticated;
grant execute on function workforce_private.daily_payroll_accrual(public.wf_monthly_payroll) to service_role;

create or replace function public.wf_attendance_payroll_snapshot(p_actor uuid,p_employee uuid,p_month date) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb; emp_start date; term record; factor numeric;
begin

 if not workforce_private.can_read_team_summary(p_actor,p_employee) then raise insufficient_privilege;end if;
 if p_month is null or extract(day from p_month)<>1 then raise sqlstate 'PT400' using message='الشهر غير صحيح';end if;
 if not exists(select 1 from public.wf_monthly_payroll where employee_id=p_employee and month=p_month) then
  select start_date into emp_start from public.wf_employees where id=p_employee for update;
  if p_month>=date_trunc('month',emp_start)::date and p_month<=date_trunc('month',workforce_private.work_now() at time zone 'Asia/Riyadh')::date then
   select * into term from public.wf_compensation_versions c where c.employee_id=p_employee
    and c.effective_from<=least((p_month+interval '1 month - 1 day')::date,(workforce_private.work_now() at time zone 'Asia/Riyadh')::date)
    order by c.effective_from desc,c.revision desc limit 1;
   if found then
    factor:=case when emp_start>p_month then least(30,(p_month+interval '1 month - 1 day')::date-emp_start+1)/30.0 else 1 end;
    insert into public.wf_monthly_payroll(employee_id,month,basic_amount,allowances_amount,gross_amount,total_amount,updated_by)
     select p_employee,p_month,round(term.basic_salary*factor,2),round(coalesce(sum((a->>'amount')::numeric),0)*factor,2),
      round(term.basic_salary*factor,2)+round(coalesce(sum((a->>'amount')::numeric),0)*factor,2),round(term.basic_salary*factor,2)+round(coalesce(sum((a->>'amount')::numeric),0)*factor,2),p_actor
     from jsonb_array_elements(term.allowances) a on conflict(employee_id,month) do nothing;
   end if;
  end if;
 end if;
 perform workforce_private.refresh_attendance_payroll(p_employee,p_month);
 select to_jsonb(p)||jsonb_build_object('daily_accrual',workforce_private.daily_payroll_accrual(p)) into result from public.wf_monthly_payroll p where employee_id=p_employee and month=p_month;
 return jsonb_build_object('statement',result,'attendance',case when result is not null then result->'attendance_details' else workforce_private.attendance_payroll(p_employee,p_month) end);
end $$;
revoke all on function public.wf_attendance_payroll_snapshot(uuid,uuid,date) from public,anon,authenticated;
grant execute on function public.wf_attendance_payroll_snapshot(uuid,uuid,date) to service_role;
