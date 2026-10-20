-- Read-only report snapshots. The Saturday boundary closes the preceding Sat–Fri week.
create or replace function workforce_private.report_attendance_seconds(p_employee uuid,p_from timestamptz,p_until timestamptz)
returns bigint language sql stable security invoker set search_path='' as $$
 with periods as (
  select greatest(a.checked_in,p_from,e.start_date::timestamp at time zone 'Asia/Riyadh') lo,
   least(coalesce(a.checked_out,a.checked_in+interval '24 hours'),p_until,now()) hi
  from public.wf_attendance_sessions a join public.wf_employees e on e.id=a.employee_id
  where a.employee_id=p_employee and a.checked_in<p_until and (a.checked_out>=p_from or a.checked_out is null)
 ), merged as (select range_agg(tstzrange(lo,hi,'[)')) ranges from periods where hi>lo)
 select coalesce(sum(extract(epoch from upper(r)-lower(r))),0)::bigint from merged cross join lateral unnest(ranges) r;
$$;
revoke all on function workforce_private.report_attendance_seconds(uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function workforce_private.report_attendance_seconds(uuid,timestamptz,timestamptz) to service_role;

create or replace function public.wf_weekly_report_data(p_week_end date) returns setof jsonb
language plpgsql stable security invoker set search_path='' as $$
declare emp record; tasks jsonb; start_day date:=p_week_end-7; start_at timestamptz; end_at timestamptz;
 month_day date:=date_trunc('month',(p_week_end-1)::timestamp)::date;
 required integer; worked integer; monthly integer; workdays integer[]; daily integer;
begin
 if extract(dow from p_week_end)<>6 or p_week_end<date '2020-01-04' or p_week_end>(now() at time zone 'Asia/Riyadh')::date+7 then
  raise sqlstate 'PT400' using message='فترة التقرير غير صحيحة';
 end if;
 start_at:=start_day::timestamp at time zone 'Asia/Riyadh';
 end_at:=least(p_week_end::timestamp at time zone 'Asia/Riyadh',now());
 for emp in select e.* from public.wf_employees e where e.status='active' and e.start_date<p_week_end
  and workforce_private.notification_recipient_matches_email(e.user_id,e.email)
 order by e.id loop
  select s.workdays,s.daily_minutes into workdays,daily from public.wf_attendance_settings s where s.employee_id=emp.id;
  workdays:=coalesce(workdays,array[0,1,2,3,4,6]); daily:=coalesce(daily,480);
  select count(*)*daily into required from generate_series(greatest(start_day,emp.start_date)::timestamp,(p_week_end-1)::timestamp,interval '1 day') day
   where extract(dow from day)::integer=any(workdays)
   and not exists(select 1 from public.wf_employee_requests q where q.employee_id=emp.id and q.test_run_id is null
    and q.kind='leave' and q.status='approved' and q.decided_at<end_at
    and day::date between (q.starts_at at time zone 'Asia/Riyadh')::date and (q.ends_at at time zone 'Asia/Riyadh')::date);
  worked:=floor(workforce_private.report_attendance_seconds(emp.id,start_at,end_at)/60.0);
  monthly:=floor(workforce_private.report_attendance_seconds(emp.id,month_day::timestamp at time zone 'Asia/Riyadh',end_at)/60.0);
  with scoped as (
   select t.*,c.kind, s.created_at submitted_at,s.status submission_status,
    (s.id is not null and (s.status='pending' or s.decided_at>=end_at)) pending_review
   from public.wf_tasks t join public.wf_task_columns c on c.id=t.column_id join public.wf_boards b on b.id=t.board_id
   left join lateral(select s.* from public.wf_task_submissions s where s.task_id=t.id and s.created_at<end_at order by s.created_at desc,s.id desc limit 1) s on true
   where (t.assignee_id=emp.id or emp.id=any(t.co_assignee_ids)) and t.test_run_id is null
    and t.deleted_at is null and t.archived_at is null and b.archived_at is null and t.created_at<end_at
  ), returns as (
   select s.task_id,count(*) total,count(*) filter(where s.decided_at>=start_at) this_week
   from public.wf_task_submissions s join scoped t on t.id=s.task_id
   where s.status='changes' and s.decided_at<end_at and s.submitted_by=emp.user_id group by s.task_id
  ) select jsonb_build_object(
   'completed',count(*) filter(where kind='done' and completed_at>=start_at and completed_at<end_at),
   'unfinished',count(*) filter(where kind<>'done' or completed_at>=end_at),
   'pendingReview',count(*) filter(where pending_review),
   'overdue',count(*) filter(where (kind<>'done' or completed_at>=end_at) and not pending_review and due_at<end_at),
   'onTime',count(*) filter(where submitted_at>=start_at and (submission_status in ('pending','approved') or pending_review) and due_at is not null and submitted_at<=due_at),
   'lateSubmissions',count(*) filter(where submitted_at>=start_at and (submission_status in ('pending','approved') or pending_review) and due_at is not null and submitted_at>due_at),
   'changesCount',coalesce((select sum(this_week) from returns),0),
   'repeatedChanges',coalesce((select count(*) from returns where total>=2 and this_week>0),0),
   'openTasks',coalesce((select jsonb_agg(jsonb_build_object('title',x.title,'dueAt',x.due_at,'pendingReview',x.pending_review)) from
    (select * from scoped where kind<>'done' or completed_at>=end_at order by due_at nulls last,id limit 8) x),'[]'::jsonb)
  ) into tasks from scoped;
  return next jsonb_build_object('employeeId',emp.id,'recipientId',emp.user_id,'weekEnd',p_week_end,
   'snapshot',jsonb_build_object('email',emp.email,'name',emp.full_name,'kind','weekly_report',
    'title','تقرير '||emp.full_name||' الأسبوعي — '||to_char(p_week_end-1,'YYYY-MM-DD'),'href','/employee','createdAt',now(),
    'cc',jsonb_build_array('elitecnnct@gmail.com'),'weeklyReport',tasks||jsonb_build_object(
     'periodStart',start_day,'periodEnd',p_week_end-1,'asOf',end_at,'month',to_char(month_day,'YYYY-MM'),
     'weekWorkedMinutes',worked,'weekRequiredMinutes',coalesce(required,0),'monthWorkedMinutes',monthly)));
 end loop;
end $$;
revoke all on function public.wf_weekly_report_data(date) from public,anon,authenticated;
grant execute on function public.wf_weekly_report_data(date) to service_role;

-- A unique notification event key and one transaction make weekly retries safe.
create or replace function public.wf_generate_weekly_reports() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare local_now timestamp:=now() at time zone 'Asia/Riyadh'; report jsonb; notice uuid; added integer:=0;
begin
 if extract(dow from local_now)<>6 or extract(hour from local_now)<9
  or not exists(select 1 from public.wf_notification_delivery_settings where id and enabled)
  then return jsonb_build_object('created',0);end if;
 perform pg_advisory_xact_lock(74122,79);
 for report in select * from public.wf_weekly_report_data(local_now::date) loop
  -- Active silent test participants never receive reports from this job.
  if exists(select 1 from workforce_private.test_runs r where r.ended_at is null and r.expires_at>now()
    and (report->>'recipientId')::uuid=any(r.participants)) then continue;end if;
  notice:=null;
  insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
  values((report->>'recipientId')::uuid,'weekly_report',report->'snapshot'->>'title','ملخص مهامك وساعات دوامك للأسبوع.','/employee',
    'weekly-report:'||(report->>'employeeId')||':'||(report->>'weekEnd'))
  on conflict(recipient_id,event_key) do nothing returning id into notice;
  if notice is not null then
   update public.wf_notification_deliveries set snapshot=report->'snapshot' where notification_id=notice;
   added:=added+1;
  end if;
 end loop;
 return jsonb_build_object('created',added);
end $$;
revoke all on function public.wf_generate_weekly_reports() from public,anon,authenticated;
grant execute on function public.wf_generate_weekly_reports() to service_role;

-- Weekly management reports have their own category, independent of task-event muting.
create or replace function workforce_private.notification_group(p_kind text) returns text
language sql immutable set search_path='' as $$
 select case when p_kind='weekly_report' then 'weekly_reports'
 when p_kind in ('due_24h','due_2h','overdue','approval_digest','admin_digest','document_expiry','contract_expiry','attendance_missing','attendance_reminder','attendance_missing_admin') then 'reminders'
 when p_kind='payroll' then 'finance' when p_kind in ('employee_request','profile_request') then 'requests'
 when p_kind in ('hr','attendance_in','attendance_out') then 'hr' else 'tasks' end;
$$;

-- 06:00 UTC = Saturday 09:00 Riyadh; later passes recover a missed run without duplicates.
select cron.schedule('workforce-weekly-reports','*/15 6-20 * * 6','select public.wf_generate_weekly_reports();');
