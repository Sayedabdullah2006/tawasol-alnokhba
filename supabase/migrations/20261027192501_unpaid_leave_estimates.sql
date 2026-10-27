-- Share the exact day rate with payroll; quotes never create a request or delivery.
create function workforce_private.unpaid_leave_day_amount(p_employee uuid,p_day date) returns numeric
language sql stable set search_path='' as $$
 select (c.basic_salary+coalesce((select sum((a->>'amount')::numeric) from jsonb_array_elements(c.allowances) a),0))/30
 from public.wf_compensation_versions c where c.employee_id=p_employee and c.effective_from<=p_day order by c.effective_from desc,c.revision desc limit 1
$$;
revoke all on function workforce_private.unpaid_leave_day_amount(uuid,date) from public,anon,authenticated;
grant execute on function workforce_private.unpaid_leave_day_amount(uuid,date) to service_role;
do $$declare f oid:='workforce_private.unpaid_leave_payroll(uuid,date,date)'::regprocedure;original text;body text;
begin
 select prosrc into original from pg_proc where oid=f;
 body:=regexp_replace(original,'select c.basic_salary\+coalesce\(\(select sum\(\(a->>''amount''\)::numeric\) from jsonb_array_elements\(c.allowances\) a\),0\) into wage\s+from public.wf_compensation_versions c where c.employee_id=p_employee and c.effective_from<=d order by c.effective_from desc,c.revision desc limit 1;',
  'wage:=workforce_private.unpaid_leave_day_amount(p_employee,d);');
 body:=replace(replace(body,'total:=total+wage/30','total:=total+wage'),'round(wage/30,2)','round(wage,2)');
 body:=replace(body,'if not found then raise sqlstate ''PT409''','if wage is null then raise sqlstate ''PT409''');
 if body=original or position('wage:=workforce_private.unpaid_leave_day_amount' in body)=0 then raise exception 'Review unpaid payroll day-rate seam';end if;
 execute replace(pg_get_functiondef(f),original,body);
end$$;
create function public.wf_unpaid_leave_estimate(p_actor uuid,p_starts date default null,p_ends date default null,p_request uuid default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare employee uuid; joined date; r public.wf_employee_requests; n integer; missing integer; amount numeric;
begin
 employee:=workforce_private.assert_task_actor(p_actor);
 if p_request is not null then
  select * into r from public.wf_employee_requests where id=p_request;
  if r.id is null or r.kind<>'leave' or r.leave_type<>'unpaid' then raise sqlstate 'PT404' using message='الطلب غير متاح';end if;
  if employee is not null and employee<>r.employee_id then raise insufficient_privilege;end if;
  if employee is null and not exists(select 1 from public.profiles where id=p_actor and role='admin') then raise insufficient_privilege;end if;
  if p_starts is not null or p_ends is not null then raise sqlstate 'PT400' using message='تقدير الطلب يعتمد مدته المسجلة';end if;
  employee:=r.employee_id;p_starts:=(r.starts_at at time zone 'Asia/Riyadh')::date;p_ends:=(r.ends_at at time zone 'Asia/Riyadh')::date;
 elsif employee is null then raise insufficient_privilege;
 end if;
 if p_starts is null or p_ends is null or p_ends<p_starts or p_ends-p_starts>3660 then raise sqlstate 'PT400' using message='حددي فترة إجازة صحيحة';end if;
 select start_date into joined from public.wf_employees where id=employee;
 if p_starts<joined then raise sqlstate 'PT400' using message='لا تبدأ الإجازة قبل تاريخ المباشرة';end if;
 with rates as(select d::date as calendar_day,workforce_private.unpaid_leave_day_amount(employee,d::date) rate from generate_series(p_starts::timestamp,p_ends::timestamp,interval '1 day') d),
 months as(select date_trunc('month',calendar_day) as month_start,count(*) as day_count,count(*) filter(where rate is null) as missing_count,sum(rate) as month_amount from rates group by 1)
 select sum(months.day_count)::integer,sum(months.missing_count)::integer,sum(round(months.month_amount,2)) into n,missing,amount from months;
 if missing>0 then raise sqlstate 'PT409' using message='يلزم استكمال إعداد الراتب لفترة الإجازة';end if;
 return jsonb_build_object('calendar_days',n,'amount',round(amount,2)::text,'starts_on',p_starts,'ends_on',p_ends);
end$$;
revoke all on function public.wf_unpaid_leave_estimate(uuid,date,date,uuid) from public,anon,authenticated;
grant execute on function public.wf_unpaid_leave_estimate(uuid,date,date,uuid) to service_role;
