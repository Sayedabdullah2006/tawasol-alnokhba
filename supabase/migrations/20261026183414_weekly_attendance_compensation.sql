-- Regular-hour balancing only. No attendance rows, overtime awards, leave banks,
-- notifications or paid payroll statements are created/rewritten by this policy.
create table workforce_private.weekly_hours_policy(
 id boolean primary key default true check(id), starts_on date not null
);
insert into workforce_private.weekly_hours_policy values(true,date_trunc('month',workforce_private.work_now() at time zone 'Asia/Riyadh')::date);
alter table workforce_private.weekly_hours_policy enable row level security;
revoke all on workforce_private.weekly_hours_policy from public,anon,authenticated;
grant select on workforce_private.weekly_hours_policy to service_role;

create function workforce_private.weekly_hours(p_employee uuid,p_month date) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare tick timestamptz:=workforce_private.work_now(); today date:=(tick at time zone 'Asia/Riyadh')::date;
 first_day date; last_day date; activation date; cutoff date; joined date; d date; week_start date;
 workdays integer[]; daily integer; actual numeric; credit numeric; lo timestamptz; hi timestamptz;
 days jsonb:='[]'; transfers jsonb:='[]'; weeks jsonb:='[]'; saved jsonb; current_week jsonb;
 i integer; j integer; balance numeric; take numeric; target_gap numeric; week_target numeric; w record;
begin
 if p_month is null or extract(day from p_month)<>1 then raise sqlstate 'PT400' using message='الشهر غير صحيح';end if;
 select start_date into joined from public.wf_employees where id=p_employee;
 if not found then raise sqlstate 'P0002' using message='الموظفة غير متاحة';end if;
 -- Preserve a paid month's exact allocation, including its unused balance.
 select attendance_details->'weekly_compensation' into saved from public.wf_monthly_payroll where employee_id=p_employee and month=p_month and status='paid';
 if found then return coalesce(saved,jsonb_build_object('enabled',false,'days','[]'::jsonb,'weeks','[]'::jsonb,'transfers','[]'::jsonb));end if;
 select starts_on into activation from workforce_private.weekly_hours_policy where id;
 select cutoff_on into cutoff from workforce_private.payroll_attendance_policy where id;
 select s.workdays,s.daily_minutes into workdays,daily from public.wf_attendance_settings s where s.employee_id=p_employee;
 workdays:=coalesce(workdays,array[0,1,2,3,4,6]);daily:=coalesce(daily,480);
 first_day:=greatest(p_month,joined,activation);last_day:=(p_month+interval '1 month - 1 day')::date;
 for d in select generate_series(first_day::timestamp,least(today,last_day)::timestamp,interval '1 day')::date loop
  if extract(dow from d)::integer<>all(workdays) or to_char(d,'MM-DD') in ('02-22','09-23')
   or exists(select 1 from public.wf_paid_calendar_days h where h.day=d)
   or exists(select 1 from public.wf_employee_requests q where q.employee_id=p_employee and q.test_run_id is null and q.kind='leave' and q.status='approved'
    and d between (q.starts_at at time zone 'Asia/Riyadh')::date and (q.ends_at at time zone 'Asia/Riyadh')::date) then continue;end if;
  lo:=d::timestamp at time zone 'Asia/Riyadh';
  hi:=least(tick,(case when d<cutoff then (d+1)::timestamp else d+workforce_private.employee_work_end(p_employee,d) end) at time zone 'Asia/Riyadh');
  -- Only genuine regular attendance can earn surplus. Approved missing-hour
  -- credits and paid permission can fill a gap but can never mint surplus.
  with ranges as (
   select greatest(lower(r),lo) a,least(upper(r),hi) b
   from public.wf_attendance_sessions s cross join lateral workforce_private.work_credit_ranges(s,tick) r
   where s.employee_id=p_employee and s.credit_request_id is null and s.overtime_request_id is null
    and s.checked_in<hi and (s.checked_out>lo or s.checked_out is null)
  ), merged as(select range_agg(tstzrange(a,b,'[)')) rr from ranges where b>a)
  select coalesce(sum(extract(epoch from upper(r)-lower(r))),0) into actual from merged cross join lateral unnest(rr) r;
  with ranges as (
   select greatest(lower(r),lo) a,least(upper(r),hi) b
   from public.wf_attendance_sessions s cross join lateral workforce_private.work_credit_ranges(s,tick) r
   where s.employee_id=p_employee and s.overtime_request_id is null and s.checked_in<hi and (s.checked_out>lo or s.checked_out is null)
   union all
   select greatest(q.starts_at,(d+workforce_private.employee_work_start(p_employee,d)) at time zone 'Asia/Riyadh'),least(q.ends_at,hi)
   from public.wf_employee_requests q where q.employee_id=p_employee and q.test_run_id is null and q.kind='permission' and q.status='approved' and q.starts_at<hi and q.ends_at>lo
  ), merged as(select range_agg(tstzrange(a,b,'[)')) rr from ranges where b>a)
  select least(daily*60,coalesce(sum(extract(epoch from upper(r)-lower(r))),0)) into credit from merged cross join lateral unnest(rr) r;
  week_start:=d-((extract(dow from d)::integer+1)%7);
  days:=days||jsonb_build_array(jsonb_build_object('day',d,'week_start',week_start,'required_seconds',daily*60,
   'attendance_seconds',actual,'base_credited_seconds',credit,'generated_seconds',greatest(0,actual-daily*60),
   'unused_seconds',greatest(0,actual-daily*60),'applied_seconds',0,'missing_seconds',greatest(0,daily*60-credit)));
 end loop;
 -- Deterministic FIFO allocation. All source/target days are already elapsed;
 -- allocations cannot cross an employee, Saturday boundary or payroll month.
 for i in 0..jsonb_array_length(days)-1 loop
  balance:=(days->i->>'unused_seconds')::numeric;
  for j in 0..jsonb_array_length(days)-1 loop
   exit when balance<=0;
   if days->i->>'week_start'<>days->j->>'week_start' then continue;end if;
   target_gap:=(days->j->>'missing_seconds')::numeric;take:=least(balance,target_gap);
   if take<=0 then continue;end if;
   days:=jsonb_set(days,array[j::text,'applied_seconds'],to_jsonb((days->j->>'applied_seconds')::numeric+take));
   days:=jsonb_set(days,array[j::text,'missing_seconds'],to_jsonb(target_gap-take));balance:=balance-take;
   transfers:=transfers||jsonb_build_array(jsonb_build_object('source_day',days->i->>'day','target_day',days->j->>'day','seconds',take));
  end loop;
  days:=jsonb_set(days,array[i::text,'unused_seconds'],to_jsonb(balance));
 end loop;
 for w in select (v->>'week_start')::date starts_on,sum((v->>'attendance_seconds')::numeric) actual,
   sum((v->>'generated_seconds')::numeric) generated,sum((v->>'applied_seconds')::numeric) applied,
   sum((v->>'base_credited_seconds')::numeric) base,sum((v->>'unused_seconds')::numeric) unused
  from jsonb_array_elements(days) v group by v->>'week_start' order by v->>'week_start' loop
  select count(*)*daily*60 into week_target from generate_series(greatest(w.starts_on,first_day)::timestamp,least(w.starts_on+6,last_day)::timestamp,interval '1 day') x
   where extract(dow from x)::integer=any(workdays) and to_char(x,'MM-DD') not in ('02-22','09-23')
   and not exists(select 1 from public.wf_paid_calendar_days h where h.day=x::date)
   and not exists(select 1 from public.wf_employee_requests q where q.employee_id=p_employee and q.test_run_id is null and q.kind='leave' and q.status='approved'
    and x::date between (q.starts_at at time zone 'Asia/Riyadh')::date and (q.ends_at at time zone 'Asia/Riyadh')::date);
  weeks:=weeks||jsonb_build_array(jsonb_build_object('starts_on',greatest(w.starts_on,first_day),'ends_on',least(w.starts_on+6,last_day),
   'generated_seconds',w.generated,'applied_seconds',w.applied,'attendance_seconds',w.actual,'credited_seconds',w.base+w.applied,'target_seconds',week_target,
   'available_seconds',case when today<=least(w.starts_on+6,last_day) then least(w.unused,greatest(0,week_target-w.base-w.applied)) else 0 end,
   'expired_seconds',case when today>least(w.starts_on+6,last_day) then w.unused else 0 end));
 end loop;
 select v into current_week from jsonb_array_elements(weeks) v where today between (v->>'starts_on')::date and (v->>'ends_on')::date;
 return jsonb_build_object('enabled',first_day<=last_day,'starts_on',activation,'as_of',tick,'days',days,'weeks',weeks,'transfers',transfers,'current_week',current_week,
  'applied_seconds',coalesce((select sum((v->>'applied_seconds')::numeric) from jsonb_array_elements(days) v),0),
  'credited_seconds',coalesce((select sum((v->>'base_credited_seconds')::numeric+(v->>'applied_seconds')::numeric) from jsonb_array_elements(days) v),0));
end $$;
revoke all on function workforce_private.weekly_hours(uuid,date) from public,anon,authenticated;
grant execute on function workforce_private.weekly_hours(uuid,date) to service_role;

create function public.wf_weekly_hours_snapshot(p_actor uuid,p_employee uuid,p_month date) returns jsonb
language plpgsql stable security invoker set search_path='' as $$begin
 if not workforce_private.can_read_team_summary(p_actor,p_employee) then raise insufficient_privilege;end if;
 return workforce_private.weekly_hours(p_employee,p_month);
end $$;
revoke all on function public.wf_weekly_hours_snapshot(uuid,uuid,date) from public,anon,authenticated;
grant execute on function public.wf_weekly_hours_snapshot(uuid,uuid,date) to service_role;

-- Deepen the existing payroll seam rather than posting a second payroll award.
-- Existing rate versions, sick pay, October waivers and paid-statement locks stay.
do $$declare f record;old_body text;body text;marker text;begin
 for f in select oid,proname,prosrc from pg_proc where oid in
 ('workforce_private.attendance_payroll(uuid,date)'::regprocedure,'workforce_private.daily_payroll_accrual(public.wf_monthly_payroll)'::regprocedure) loop
  old_body:=f.prosrc;body:=old_body;
  if f.proname='attendance_payroll' then
   body:=replace(body,'missing_days jsonb:=''[]'';','missing_days jsonb:=''[]''; weekly jsonb;');
   body:=replace(body,'for d in select generate_series(first_day::timestamp,last_day::timestamp,interval ''1 day'')::date loop',
    'weekly:=workforce_private.weekly_hours(p_employee,p_month); for d in select generate_series(first_day::timestamp,last_day::timestamp,interval ''1 day'')::date loop');
   marker:='gap:=greatest(0,daily*60-seconds);';
   body:=replace(body,marker,$s$seconds:=least(daily*60,seconds+coalesce((select (v->>'applied_seconds')::numeric from jsonb_array_elements(weekly->'days') v where v->>'day'=d::text),0)); $s$||marker);
   body:=replace(body,'return jsonb_build_object(', 'return jsonb_build_object(''weekly_compensation'',weekly,');
  else
   marker:='day_gap:=greatest(0,daily*60-credited)*hourly/3600;';
   body:=replace(body,marker,$s$credited:=least(daily*60,credited+coalesce((select (v->>'applied_seconds')::numeric from jsonb_array_elements(detail->'weekly_compensation'->'days') v where v->>'day'=today::text),0)); $s$||marker);
  end if;
  if body=old_body or position('applied_seconds' in body)=0 or (f.proname='attendance_payroll' and position('weekly:=workforce_private.weekly_hours' in body)=0) then raise exception 'Payroll seam changed: %',f.proname;end if;
  execute replace(pg_get_functiondef(f.oid),old_body,body);
 end loop;
end $$;
