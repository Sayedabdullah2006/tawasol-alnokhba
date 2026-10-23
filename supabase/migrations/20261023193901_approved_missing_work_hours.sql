-- Credits use the shared attendance ledger, explicitly distinguished from clock punches.
alter table public.wf_employee_requests drop constraint wf_employee_requests_kind_check;
alter table public.wf_employee_requests add constraint wf_employee_requests_kind_check check(kind in ('leave','permission','remote-work','expenses','advance','letter','payroll-review','attendance-correction','general','overtime','missing-hours'));
alter table public.wf_employee_requests add column work_day date,add column missing_minutes integer;
alter table public.wf_employee_requests add constraint wf_missing_hours_fields check(
 (kind='missing-hours' and work_day is not null and missing_minutes is not null and missing_minutes between 1 and 480) or
 (kind<>'missing-hours' and work_day is null and missing_minutes is null));
alter table public.wf_attendance_sessions add column credit_request_id uuid references public.wf_employee_requests(id) on delete restrict;
alter table public.wf_attendance_sessions drop constraint wf_attendance_sessions_source_check;
alter table public.wf_attendance_sessions add constraint wf_attendance_sessions_source_check check(source in ('clock','correction','admin','missing-hours'));
alter table public.wf_attendance_sessions add constraint wf_missing_hours_credit_source check((source='missing-hours')=(credit_request_id is not null));
create unique index wf_missing_hours_credit_once on public.wf_attendance_sessions(credit_request_id,checked_in) where credit_request_id is not null;

create function workforce_private.missing_hours_gaps(p_employee uuid,p_day date)
returns tstzmultirange language sql stable security invoker set search_path='' as $$
 with occupied as (
  select greatest(lower(r),p_day::timestamp at time zone 'Asia/Riyadh') lo,least(upper(r),(p_day+1)::timestamp at time zone 'Asia/Riyadh') hi
  from public.wf_attendance_sessions a cross join lateral workforce_private.work_credit_ranges(a,workforce_private.work_now()) r
  where a.employee_id=p_employee and a.checked_in<((p_day+1)::timestamp at time zone 'Asia/Riyadh') and coalesce(a.checked_out,workforce_private.work_now())>=(p_day::timestamp at time zone 'Asia/Riyadh')
  union all
  select greatest(q.starts_at,p_day::timestamp at time zone 'Asia/Riyadh'),least(q.ends_at,(p_day+1)::timestamp at time zone 'Asia/Riyadh')
  from public.wf_employee_requests q where q.employee_id=p_employee and q.kind='permission' and q.status='approved' and q.test_run_id is null
   and q.starts_at<((p_day+1)::timestamp at time zone 'Asia/Riyadh') and q.ends_at>(p_day::timestamp at time zone 'Asia/Riyadh')
 ) select coalesce(range_agg(tstzrange(lo,hi,'[)')) filter(where hi>lo),'{}'::tstzmultirange) from occupied
$$;

create function workforce_private.validate_missing_hours() returns trigger
language plpgsql security invoker set search_path='' as $$
declare tick timestamptz:=workforce_private.work_now();today date:=(tick at time zone 'Asia/Riyadh')::date;used numeric;daily integer;workdays integer[];r tstzrange;occupied tstzmultirange;
begin
 if new.kind='leave' and new.status='approved' and TG_OP='UPDATE' and old.status='pending' and exists(select 1 from public.wf_attendance_sessions a where a.employee_id=new.employee_id and a.credit_request_id is not null and a.business_date between (new.starts_at at time zone 'Asia/Riyadh')::date and (new.ends_at at time zone 'Asia/Riyadh')::date) then raise sqlstate 'PT409' using message='توجد ساعات مفقودة معتمدة خلال الإجازة؛ راجعي السجل أولًا';end if;
 if new.kind<>'missing-hours' then return new;end if;
 if TG_OP='INSERT' and new.status<>'pending' then raise sqlstate 'PT400' using message='قدمي الطلب أولًا لاعتماد المدير';end if;
 if TG_OP='UPDATE' and old.status='approved' and (new.work_day,new.missing_minutes,new.status) is distinct from (old.work_day,old.missing_minutes,old.status) then raise sqlstate 'PT409' using message='لا يمكن تعديل ساعات سبق اعتمادها';end if;
 if new.status in ('rejected','cancelled') then return new;end if;
 if new.work_day>today or new.work_day=today and (tick at time zone 'Asia/Riyadh')::time<time '17:00' then raise sqlstate 'PT400' using message='تسجيل الساعات المفقودة ليوم مكتمل؛ اليوم الحالي متاح بعد الخامسة مساءً';end if;
 if new.work_day<(select start_date from public.wf_employees where id=new.employee_id) then raise sqlstate 'PT400' using message='اليوم يسبق تاريخ المباشرة';end if;
 select s.daily_minutes,s.workdays into daily,workdays from public.wf_attendance_settings s where s.employee_id=new.employee_id;
 daily:=least(480,coalesce(daily,480));workdays:=coalesce(workdays,array[0,1,2,3,4,6]);
 if extract(dow from new.work_day)::integer=5 or extract(dow from new.work_day)::integer<>all(workdays) or workforce_private.paid_holiday(new.work_day) is not null then raise sqlstate 'PT400' using message='هذا اليوم إجازة؛ ساعات خارج الدوام لها طلب مستقل';end if;
 if new.status='approved' and (TG_OP='INSERT' or old.status='pending') then
  perform pg_advisory_xact_lock(hashtextextended(new.employee_id::text,19));
  if exists(select 1 from public.wf_monthly_payroll p where p.employee_id=new.employee_id and p.month=date_trunc('month',new.work_day)::date and p.status='paid') then raise sqlstate 'PT409' using message='كشف هذا الشهر مصروف؛ يلزم مراجعة التسوية المالية';end if;
  if exists(select 1 from public.wf_employee_requests q where q.employee_id=new.employee_id and q.kind='leave' and q.status='approved' and q.test_run_id is null and new.work_day between (q.starts_at at time zone 'Asia/Riyadh')::date and (q.ends_at at time zone 'Asia/Riyadh')::date) then raise sqlstate 'PT409' using message='توجد إجازة معتمدة لهذا اليوم';end if;
  occupied:=workforce_private.missing_hours_gaps(new.employee_id,new.work_day);
  select coalesce(sum(extract(epoch from upper(x)-lower(x))),0) into used from unnest(occupied) x;
  if used+new.missing_minutes*60>daily*60 then raise sqlstate 'PT409' using message='الساعات المطلوبة تتجاوز المتبقي من الدوام اليومي';end if;
 end if;
 return new;
end $$;
create trigger wf_missing_hours_validate before insert or update on public.wf_employee_requests for each row execute function workforce_private.validate_missing_hours();

create function workforce_private.post_missing_hours() returns trigger
language plpgsql security invoker set search_path='' as $$
declare remaining integer;room tstzmultirange;gap tstzrange;seconds integer;finish timestamptz;
begin
 if new.kind<>'missing-hours' or new.status<>'approved' or old.status<>'pending' or new.test_run_id is not null then return new;end if;
 remaining:=new.missing_minutes*60;
 room:=tstzmultirange(tstzrange((new.work_day+time '09:00') at time zone 'Asia/Riyadh',(new.work_day+time '17:00') at time zone 'Asia/Riyadh','[)'))-workforce_private.missing_hours_gaps(new.employee_id,new.work_day);
 for gap in select unnest(room) order by 1 loop
  exit when remaining=0;
  seconds:=least(remaining,extract(epoch from upper(gap)-lower(gap))::integer);finish:=lower(gap)+seconds*interval '1 second';
  insert into public.wf_attendance_sessions(id,employee_id,business_date,checked_in,checked_out,source,note,updated_by,credit_request_id)
   values(gen_random_uuid(),new.employee_id,new.work_day,lower(gap),finish,'missing-hours','ساعات مفقودة معتمدة',new.decided_by,new.id);
  remaining:=remaining-seconds;
 end loop;
 if remaining<>0 then raise sqlstate 'PT409' using message='لا توجد مدة كافية دون تداخل؛ راجعي سجل الحضور';end if;
 perform workforce_private.refresh_attendance_payroll(new.employee_id,date_trunc('month',new.work_day)::date);
 return new;
end $$;
create trigger wf_missing_hours_post after update on public.wf_employee_requests for each row execute function workforce_private.post_missing_hours();
revoke all on function workforce_private.missing_hours_gaps(uuid,date),workforce_private.validate_missing_hours(),workforce_private.post_missing_hours() from public,anon,authenticated;
grant execute on function workforce_private.missing_hours_gaps(uuid,date),workforce_private.validate_missing_hours(),workforce_private.post_missing_hours() to service_role;

-- Approval sends the existing request decision notification once, without a second correction notice.
do $patch$
declare definition text;
begin
 select pg_get_functiondef('workforce_private.notify_workforce_changes()'::regprocedure) into definition;
 if position('if new.source=''clock'' then return new; end if;' in definition)=0 then raise exception 'Attendance notification guard changed; review migration';end if;
 execute replace(definition,'if new.source=''clock'' then return new; end if;','if new.source=''clock'' or new.credit_request_id is not null then return new; end if;');
 select pg_get_functiondef('workforce_private.notify_employee_request()'::regprocedure) into definition;
 if position('when ''attendance-correction'' then ''تصحيح حضور'' else' in definition)=0 then raise exception 'Request notification contract changed; review migration';end if;
 definition:=replace(definition,'when ''attendance-correction'' then ''تصحيح حضور'' else','when ''attendance-correction'' then ''تصحيح حضور'' when ''missing-hours'' then ''تسجيل ساعات مفقودة'' else');
 definition:=replace(definition,' if new.starts_at is not null then',E' if new.kind=''missing-hours'' then details:=details||E''\\nاليوم: ''||new.work_day::text||E''\\nالساعات: ''||round(new.missing_minutes/60.0,2)::text;end if;\n if new.starts_at is not null then');
 execute definition;
 select pg_get_functiondef('public.wf_work_snapshot(uuid,uuid)'::regprocedure) into definition;
 if position('where employee_id=employee order by checked_in desc limit 1' in definition)=0 then raise exception 'Work snapshot contract changed; review migration';end if;
 execute replace(definition,'where employee_id=employee order by checked_in desc limit 1','where employee_id=employee and credit_request_id is null order by checked_in desc limit 1');
end $patch$;
