-- Explicit, month-scoped management exception; keep attendance evidence intact.
create table workforce_private.payroll_attendance_waivers(
 employee_id uuid not null references public.wf_employees(id),
 month date not null check(extract(day from month)=1),
 reason text not null check(length(reason) between 3 and 2000),
 created_at timestamptz not null default now(), primary key(employee_id,month)
);
alter table workforce_private.payroll_attendance_waivers enable row level security;
revoke all on workforce_private.payroll_attendance_waivers from public,anon,authenticated;
grant select on workforce_private.payroll_attendance_waivers to service_role;
insert into workforce_private.payroll_attendance_waivers(employee_id,month,reason) values
 ('20941f23-a84c-44a9-a316-94a436e0d3cb','2026-10-01','إعفاء استثنائي من حسم الحضور لشهر أكتوبر 2026 بتوجيه مالك الشركة؛ التأمينات مستمرة'),
 ('a4e79fa0-d078-4a7e-8650-196342a0dec3','2026-10-01','إعفاء استثنائي من حسم الحضور لشهر أكتوبر 2026 بتوجيه مالك الشركة؛ التأمينات مستمرة');
CREATE OR REPLACE FUNCTION workforce_private.attendance_payroll(p_employee uuid, p_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare tick timestamptz:=workforce_private.work_now(); emp public.wf_employees; d date; first_day date; last_day date;
 workdays integer[]; daily integer; required numeric:=0; credited numeric:=0; missing numeric:=0;
 seconds numeric; gap numeric; fixed numeric; adjustment numeric:=0; day_rate numeric; last_rate numeric;
 covered_days integer:=0; missing_days jsonb:='[]'; term record; activated date; cutoff_on date; leave_day boolean; sick jsonb;
begin
 select * into emp from public.wf_employees where id=p_employee;
 if not found then raise sqlstate 'P0002' using message='الموظفة غير متاحة';end if;
 select p.starts_on,p.cutoff_on into activated,cutoff_on from workforce_private.payroll_attendance_policy p where id;
 select s.workdays,s.daily_minutes into workdays,daily from public.wf_attendance_settings s where s.employee_id=p_employee;
 workdays:=coalesce(workdays,array[0,1,2,3,4,6]);daily:=coalesce(daily,480);
 first_day:=greatest(p_month,emp.start_date,activated);
 last_day:=least((p_month+interval '1 month - 1 day')::date,
   (tick at time zone 'Asia/Riyadh')::date-case when (tick at time zone 'Asia/Riyadh')::date>=cutoff_on and (tick at time zone 'Asia/Riyadh')::time>=workforce_private.regular_work_end((tick at time zone 'Asia/Riyadh')::date) then 0 else 1 end);
 for d in select generate_series(first_day::timestamp,last_day::timestamp,interval '1 day')::date loop
  if extract(dow from d)::integer<>all(workdays) then continue;end if;
  if to_char(d,'MM-DD') in ('02-22','09-23') or exists(select 1 from public.wf_paid_calendar_days h where h.day=d) then continue;end if;
  select exists(select 1 from public.wf_employee_requests q where q.employee_id=p_employee and q.test_run_id is null
    and q.kind='leave' and q.leave_type in ('paid','sick') and q.status='approved' and d between (q.starts_at at time zone 'Asia/Riyadh')::date and (q.ends_at at time zone 'Asia/Riyadh')::date) into leave_day;
  if leave_day then continue;end if;
  -- A missing salary version is not a zero-wage working day. Fail closed.
  select c.basic_salary+coalesce((select sum((a->>'amount')::numeric) from jsonb_array_elements(c.allowances) a),0) monthly
   into term from public.wf_compensation_versions c where c.employee_id=p_employee and c.effective_from<=d order by c.effective_from desc,c.revision desc limit 1;
  if not found then raise sqlstate 'PT409' using message='أكملي إعداد راتب الموظفة للفترة أولًا';end if;
  fixed:=term.monthly;day_rate:=fixed/30/8;last_rate:=day_rate;
  with ranges as (
   select greatest(lower(r),d::timestamp at time zone 'Asia/Riyadh') lo,
    least(upper(r),(case when d<cutoff_on then (d+1)::timestamp else d+workforce_private.regular_work_end(d) end) at time zone 'Asia/Riyadh') hi
   from public.wf_attendance_sessions a cross join lateral workforce_private.work_credit_ranges(a,tick) r
   where a.employee_id=p_employee and a.checked_in<((d+1)::timestamp at time zone 'Asia/Riyadh')
    and (a.checked_out>=(d::timestamp at time zone 'Asia/Riyadh') or a.checked_out is null)
   union all
   select greatest(q.starts_at,(d+time '09:00') at time zone 'Asia/Riyadh'),least(q.ends_at,(d+workforce_private.regular_work_end(d)) at time zone 'Asia/Riyadh')
   from public.wf_employee_requests q where q.employee_id=p_employee and q.test_run_id is null and q.kind='permission' and q.status='approved'
    and q.starts_at<((d+1)::timestamp at time zone 'Asia/Riyadh') and q.ends_at>(d::timestamp at time zone 'Asia/Riyadh')
  ), merged as(select range_agg(tstzrange(lo,hi,'[)')) rr from ranges where hi>lo)
  select least(daily*60,coalesce(sum(extract(epoch from upper(r)-lower(r))),0)) into seconds from merged cross join lateral unnest(rr) r;
  gap:=greatest(0,daily*60-seconds);required:=required+daily*60;credited:=credited+seconds;missing:=missing+gap;
  adjustment:=adjustment+day_rate*gap/3600;covered_days:=covered_days+1;
  if gap>0 then missing_days:=missing_days||jsonb_build_array(jsonb_build_object('day',d,'required_seconds',daily*60,'credited_seconds',seconds,'missing_seconds',gap,'hourly_rate',round(day_rate,6)::text));end if;
 end loop;
 if last_rate is null then
  select (c.basic_salary+coalesce((select sum((a->>'amount')::numeric) from jsonb_array_elements(c.allowances) a),0))/30/8 into last_rate
   from public.wf_compensation_versions c where c.employee_id=p_employee and c.effective_from<=least((p_month+interval '1 month - 1 day')::date,(tick at time zone 'Asia/Riyadh')::date)
   order by c.effective_from desc,c.revision desc limit 1;
 end if;
 sick:=workforce_private.sick_payroll(p_employee,p_month,(tick at time zone 'Asia/Riyadh')::date);
 adjustment:=adjustment+(sick->>'amount')::numeric;
 return jsonb_build_object('sick_leave',sick,'starts_on',activated,'through',case when last_day>=first_day then last_day else null end,
  'required_seconds',required,'credited_seconds',credited,'missing_seconds',missing,'days',covered_days,
  'hourly_rate',round(last_rate,6)::text,'calculated_amount',case when exists(select 1 from workforce_private.payroll_attendance_waivers w where w.employee_id=p_employee and w.month=p_month) then '0.00' else round(adjustment,2)::text end,
  'waived_amount',case when exists(select 1 from workforce_private.payroll_attendance_waivers w where w.employee_id=p_employee and w.month=p_month) then round(adjustment,2)::text else '0.00' end,
  'waiver_reason',(select w.reason from workforce_private.payroll_attendance_waivers w where w.employee_id=p_employee and w.month=p_month),'missing_days',missing_days);
end $function$
;
-- Reconcile the two existing statements without approving or recording a payment.
select workforce_private.refresh_attendance_payroll(employee_id,month)
from public.wf_monthly_payroll where month='2026-10-01'
and employee_id in ('20941f23-a84c-44a9-a316-94a436e0d3cb','a4e79fa0-d078-4a7e-8650-196342a0dec3');

