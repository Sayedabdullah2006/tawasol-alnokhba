-- Unpaid leave is an agreed wage exclusion, separate from absence settlement.
-- It cannot be waived by an attendance-only exception or charged twice as absence.
create function workforce_private.is_unpaid_leave(p_employee uuid,p_day date) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from public.wf_employee_requests q where q.employee_id=p_employee and q.kind='leave' and q.leave_type='unpaid' and q.status='approved' and q.test_run_id is null
 and p_day between (q.starts_at at time zone 'Asia/Riyadh')::date and (q.ends_at at time zone 'Asia/Riyadh')::date)
$$;
create function workforce_private.unpaid_leave_payroll(p_employee uuid,p_month date,p_through date) returns jsonb
language plpgsql stable set search_path='' as $$
declare d date; joined date; wage numeric; total numeric:=0; days jsonb:='[]';
begin
 if p_through is null or not exists(select 1 from public.wf_employee_requests q where q.employee_id=p_employee and q.kind='leave' and q.leave_type='unpaid' and q.status='approved' and q.test_run_id is null and (q.starts_at at time zone 'Asia/Riyadh')::date<=least(p_through,(p_month+interval '1 month - 1 day')::date) and (q.ends_at at time zone 'Asia/Riyadh')::date>=p_month) then return jsonb_build_object('amount','0.00','days','[]'::jsonb);end if;
 select start_date into joined from public.wf_employees where id=p_employee;
 for d in select generate_series(greatest(p_month,joined)::timestamp,least(p_through,(p_month+interval '1 month - 1 day')::date)::timestamp,interval '1 day')::date loop
  if not workforce_private.is_unpaid_leave(p_employee,d) then continue;end if;
  select c.basic_salary+coalesce((select sum((a->>'amount')::numeric) from jsonb_array_elements(c.allowances) a),0) into wage
   from public.wf_compensation_versions c where c.employee_id=p_employee and c.effective_from<=d order by c.effective_from desc,c.revision desc limit 1;
  if not found then raise sqlstate 'PT409' using message='أكملي إعداد راتب الموظفة لفترة الإجازة';end if;
  total:=total+wage/30;days:=days||jsonb_build_array(jsonb_build_object('day',d,'amount',round(wage/30,2)::text));
 end loop;
 return jsonb_build_object('amount',round(total,2)::text,'days',days);
end$$;
revoke all on function workforce_private.is_unpaid_leave(uuid,date),workforce_private.unpaid_leave_payroll(uuid,date,date) from public,anon,authenticated;
grant execute on function workforce_private.is_unpaid_leave(uuid,date),workforce_private.unpaid_leave_payroll(uuid,date,date) to service_role;

-- Preserve the shipped weekly, sick, insurance and daily-accrual algorithms.
do $$declare f oid; definition text; original text; body text;
begin
 f:='workforce_private.attendance_payroll(uuid,date)'::regprocedure;
 definition:=replace(pg_get_functiondef(f),'FUNCTION workforce_private.attendance_payroll(', 'FUNCTION workforce_private.attendance_payroll_before_unpaid(');execute definition;
 f:='workforce_private.daily_payroll_accrual(public.wf_monthly_payroll)'::regprocedure;
 select prosrc into original from pg_proc where oid=f;
 body:=replace(original,'if not paid_day then','if not paid_day and not workforce_private.is_unpaid_leave(p.employee_id,today) then');
 if body=original then raise exception 'Review daily accrual current-day settlement seam';end if;
 definition:=replace(replace(pg_get_functiondef(f),original,body),'FUNCTION workforce_private.daily_payroll_accrual(', 'FUNCTION workforce_private.daily_payroll_accrual_before_unpaid(');execute definition;
end$$;
revoke all on function workforce_private.attendance_payroll_before_unpaid(uuid,date),workforce_private.daily_payroll_accrual_before_unpaid(public.wf_monthly_payroll) from public,anon,authenticated;
grant execute on function workforce_private.attendance_payroll_before_unpaid(uuid,date),workforce_private.daily_payroll_accrual_before_unpaid(public.wf_monthly_payroll) to service_role;

create or replace function workforce_private.attendance_payroll(p_employee uuid,p_month date) returns jsonb
language plpgsql stable set search_path='' as $$
declare result jsonb; leave_data jsonb; rebate numeric:=0; amount numeric;
begin
 result:=workforce_private.attendance_payroll_before_unpaid(p_employee,p_month);
 if exists(select 1 from public.wf_monthly_payroll where employee_id=p_employee and month=p_month and status='paid') then return result;end if;
 leave_data:=workforce_private.unpaid_leave_payroll(p_employee,p_month,(result->>'through')::date);
 if (leave_data->>'amount')::numeric=0 then return result||jsonb_build_object('unpaid_leave',leave_data);end if;
 if coalesce((result->>'waived_amount')::numeric,0)=0 then
  select coalesce(sum((v->>'missing_seconds')::numeric/3600*(v->>'hourly_rate')::numeric),0) into rebate from jsonb_array_elements(result->'missing_days') v
   where workforce_private.is_unpaid_leave(p_employee,(v->>'day')::date);
 end if;
 amount:=greatest(0,(result->>'calculated_amount')::numeric-round(rebate,2))+(leave_data->>'amount')::numeric;
 return result||jsonb_build_object('calculated_amount',round(amount,2)::text,'unpaid_leave',leave_data);
end$$;

create or replace function workforce_private.daily_payroll_accrual(p public.wf_monthly_payroll) returns jsonb
language plpgsql stable set search_path='' as $$
declare result jsonb; detail jsonb; leave_data jsonb; extra numeric; adjustment numeric; available numeric;
begin
 result:=workforce_private.daily_payroll_accrual_before_unpaid(p);
 if p.status='paid' or (result->>'closed')::boolean then return result;end if;
 leave_data:=workforce_private.unpaid_leave_payroll(p.employee_id,p.month,(workforce_private.work_now() at time zone 'Asia/Riyadh')::date);
 if (leave_data->>'amount')::numeric=0 then return result;end if;
 detail:=workforce_private.attendance_payroll(p.employee_id,p.month);
 extra:=greatest(0,(leave_data->>'amount')::numeric-coalesce((detail->'unpaid_leave'->>'amount')::numeric,0));
 available:=greatest(0,(result->>'gross_amount')::numeric-(result->>'insurance_amount')::numeric-(result->>'other_amount')::numeric);
 adjustment:=least(available,(result->>'attendance_amount')::numeric+extra);
 return result||jsonb_build_object('attendance_amount',round(adjustment,2)::text,'total_amount',round(greatest(0,available-adjustment),2)::text,'unpaid_leave_amount',leave_data->>'amount');
end$$;
-- No existing request, attendance, payroll statement or delivery is mutated here.
