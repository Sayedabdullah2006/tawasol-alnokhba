create table public.wf_attendance_settings (
 employee_id uuid primary key references public.wf_employees(id),
 workdays integer[] not null default array[0,1,2,3,4] check(cardinality(workdays) between 1 and 7 and workdays <@ array[0,1,2,3,4,5,6]),
 starts_at time not null default '09:00', ends_at time not null default '17:00',
 updated_by uuid not null references public.profiles(id), updated_at timestamptz not null default now(),
 check(ends_at>starts_at)
);
create table public.wf_leave_entitlements (
 employee_id uuid not null references public.wf_employees(id),year integer not null check(year between 2020 and 2200),
 days numeric(7,2) not null check(days between 0 and 366), reason text not null check(length(btrim(reason)) between 3 and 2000),
 updated_by uuid not null references public.profiles(id),updated_at timestamptz not null default now(),primary key(employee_id,year)
);
create table public.wf_attendance_sessions (
 id uuid primary key,employee_id uuid not null references public.wf_employees(id),
 business_date date not null,checked_in timestamptz not null,checked_out timestamptz,
 checkout_key uuid unique,source text not null check(source in ('clock','correction','admin')),
 note text not null default '' check(length(note)<=2000),version integer not null default 1,
 updated_by uuid not null references public.profiles(id),updated_at timestamptz not null default now(),
 check(checked_out is null or (checked_out>=checked_in and checked_out<=checked_in+interval '24 hours'))
);
create unique index wf_attendance_one_open on public.wf_attendance_sessions(employee_id) where checked_out is null;
create index wf_attendance_employee_date on public.wf_attendance_sessions(employee_id,business_date desc,id);
alter table public.wf_employee_requests add column attendance_session_id uuid references public.wf_attendance_sessions(id);
alter table public.wf_employee_requests add column leave_type text not null default 'paid' check(leave_type in ('paid','unpaid'));
create table public.wf_leave_movements (
 request_id uuid not null references public.wf_employee_requests(id),employee_id uuid not null references public.wf_employees(id),
 year integer not null,days numeric(7,2) not null check(days>0),primary key(request_id,year)
);
create index wf_leave_movements_employee_year on public.wf_leave_movements(employee_id,year);
alter table public.wf_attendance_settings enable row level security;
alter table public.wf_leave_entitlements enable row level security;
alter table public.wf_attendance_sessions enable row level security;
alter table public.wf_leave_movements enable row level security;
revoke all on public.wf_attendance_settings,public.wf_leave_entitlements,public.wf_attendance_sessions,public.wf_leave_movements from public,anon,authenticated;
grant select on public.wf_attendance_settings,public.wf_leave_entitlements,public.wf_attendance_sessions,public.wf_leave_movements to authenticated;
grant select,insert,update on public.wf_attendance_settings,public.wf_leave_entitlements,public.wf_attendance_sessions,public.wf_leave_movements to service_role;
create policy wf_attendance_settings_read on public.wf_attendance_settings for select to authenticated using((select workforce_private.is_admin()) or employee_id=(select workforce_private.employee_id()));
create policy wf_leave_entitlements_read on public.wf_leave_entitlements for select to authenticated using((select workforce_private.is_admin()) or employee_id=(select workforce_private.employee_id()));
create policy wf_attendance_sessions_read on public.wf_attendance_sessions for select to authenticated using((select workforce_private.is_admin()) or employee_id=(select workforce_private.employee_id()));
create policy wf_leave_movements_read on public.wf_leave_movements for select to authenticated using((select workforce_private.is_admin()) or employee_id=(select workforce_private.employee_id()));

create function public.wf_clock_attendance(p_actor uuid,p_command text,p_key uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare employee uuid; row public.wf_attendance_sessions; tick timestamptz:=clock_timestamp();
begin
 employee:=workforce_private.assert_task_actor(p_actor);
 if employee is null then raise insufficient_privilege; end if;
 perform pg_advisory_xact_lock(hashtextextended(employee::text,19));
 if p_command='in' then
  select * into row from public.wf_attendance_sessions where id=p_key;
  if found then if row.employee_id<>employee then raise insufficient_privilege;end if;return to_jsonb(row);end if;
  if exists(select 1 from public.wf_attendance_sessions where employee_id=employee and checked_out is null) then raise exception 'الحضور مسجل؛ سجلي الانصراف أولًا' using errcode='PT409';end if;
  insert into public.wf_attendance_sessions(id,employee_id,business_date,checked_in,source,updated_by) values(p_key,employee,(tick at time zone 'Asia/Riyadh')::date,tick,'clock',p_actor) returning * into row;
 elsif p_command='out' then
  select * into row from public.wf_attendance_sessions where checkout_key=p_key;
  if found then if row.employee_id<>employee then raise insufficient_privilege;end if;return to_jsonb(row);end if;
  select * into row from public.wf_attendance_sessions where employee_id=employee and checked_out is null for update;
  if not found then raise exception 'سجلي الحضور أولًا' using errcode='PT409';end if;
  if tick>row.checked_in+interval '24 hours' then raise exception 'السجل تجاوز يومًا؛ ارفعي طلب تصحيح حضور' using errcode='PT400';end if;
  update public.wf_attendance_sessions set checked_out=tick,checkout_key=p_key,version=version+1,updated_by=p_actor,updated_at=tick where id=row.id returning * into row;
 else raise insufficient_privilege;end if;
 insert into public.wf_audit_events(entity_table,entity_id,action,actor_id,changed_fields) values('wf_attendance_sessions',row.id::text,p_command,p_actor,array['checked_in','checked_out']);
 return to_jsonb(row);
end $$;
revoke all on function public.wf_clock_attendance(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.wf_clock_attendance(uuid,text,uuid) to service_role;

-- Attendance corrections and leave deductions happen in the same transaction as approval.
create or replace function public.wf_decide_employee_request(p_id uuid,p_actor uuid,p_version integer,p_decision text,p_reason text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare r public.wf_employee_requests; admin_actor boolean; configured_days integer[]; slice record; remaining numeric; session_id uuid;
begin
 select * into r from public.wf_employee_requests where id=p_id for update;
 if not found then raise exception 'الطلب غير متاح' using errcode='P0002';end if;
 select exists(select 1 from public.profiles p where p.id=p_actor and p.role='admin' and workforce_private.task_actor_unbanned(p_actor)) into admin_actor;
 if p_decision='cancelled' then
  if not exists(select 1 from public.wf_employees e join public.profiles p on p.id=e.user_id where e.id=r.employee_id and e.user_id=p_actor and e.status='active' and p.role='employee') then raise insufficient_privilege;end if;
 elsif not admin_actor or p_decision not in ('approved','rejected') then raise insufficient_privilege;end if;
 if p_version is null or r.version<>p_version or r.status<>'pending' then raise exception 'تمت معالجة الطلب؛ حدّث القائمة' using errcode='PT409';end if;
 if p_decision<>'cancelled' and length(btrim(coalesce(p_reason,''))) not between 3 and 2000 then raise exception 'أدخل سبب القرار' using errcode='PT400';end if;
 if p_decision='approved' then
  if not exists(select 1 from public.wf_employees where id=r.employee_id and status='active') then raise exception 'الموظفة غير نشطة' using errcode='PT400';end if;
  perform pg_advisory_xact_lock(hashtextextended(r.employee_id::text,19));
  if r.kind='attendance-correction' then
   if r.starts_at>now() or r.ends_at>now() or r.ends_at>r.starts_at+interval '24 hours' then raise exception 'تصحيح الحضور لفترة سابقة حتى 24 ساعة' using errcode='PT400';end if;
   if r.attendance_session_id is not null and not exists(select 1 from public.wf_attendance_sessions where id=r.attendance_session_id and employee_id=r.employee_id) then raise exception 'سجل الحضور غير متاح' using errcode='PT400';end if;
   if exists(select 1 from public.wf_attendance_sessions where employee_id=r.employee_id and id is distinct from r.attendance_session_id and tstzrange(checked_in,coalesce(checked_out,now()),'[)') && tstzrange(r.starts_at,r.ends_at,'[)')) then raise exception 'الفترة تتداخل مع سجل حضور آخر' using errcode='PT409';end if;
   session_id:=coalesce(r.attendance_session_id,gen_random_uuid());
   insert into public.wf_attendance_sessions(id,employee_id,business_date,checked_in,checked_out,source,note,updated_by)
   values(session_id,r.employee_id,(r.starts_at at time zone 'Asia/Riyadh')::date,r.starts_at,r.ends_at,'correction',p_reason,p_actor)
   on conflict(id) do update set business_date=excluded.business_date,checked_in=excluded.checked_in,checked_out=excluded.checked_out,source='correction',note=excluded.note,updated_by=p_actor,updated_at=now(),version=wf_attendance_sessions.version+1;
   insert into public.wf_audit_events(entity_table,entity_id,action,actor_id,changed_fields) values('wf_attendance_sessions',session_id::text,'correction',p_actor,array['checked_in','checked_out']);
  elsif r.kind='leave' then
   if exists(select 1 from public.wf_employee_requests where employee_id=r.employee_id and id<>r.id and kind='leave' and status='approved' and daterange((starts_at at time zone 'Asia/Riyadh')::date,(ends_at at time zone 'Asia/Riyadh')::date,'[]') && daterange((r.starts_at at time zone 'Asia/Riyadh')::date,(r.ends_at at time zone 'Asia/Riyadh')::date,'[]')) then raise exception 'توجد إجازة معتمدة في الفترة' using errcode='PT409';end if;
   if r.leave_type='paid' then
    select workdays into configured_days from public.wf_attendance_settings where employee_id=r.employee_id;
    configured_days:=coalesce(configured_days,array[0,1,2,3,4]);
    for slice in select extract(year from day)::integer as leave_year,count(*) as leave_days from generate_series((r.starts_at at time zone 'Asia/Riyadh')::date::timestamp,(r.ends_at at time zone 'Asia/Riyadh')::date::timestamp,interval '1 day') day where extract(dow from day)::integer=any(configured_days) group by 1 loop
     select coalesce((select days from public.wf_leave_entitlements where employee_id=r.employee_id and year=slice.leave_year),0)-coalesce((select sum(days) from public.wf_leave_movements where employee_id=r.employee_id and year=slice.leave_year),0) into remaining;
     if remaining<slice.leave_days then raise exception 'رصيد الإجازة غير كافٍ؛ حدّثي الاستحقاق قبل الاعتماد' using errcode='PT400';end if;
     insert into public.wf_leave_movements(request_id,employee_id,year,days) values(r.id,r.employee_id,slice.leave_year,slice.leave_days);
    end loop;
   end if;
  end if;
 end if;
 update public.wf_employee_requests set status=p_decision,decision_reason=left(p_reason,2000),decided_by=p_actor,decided_at=now(),version=version+1 where id=p_id;
 insert into public.wf_audit_events(entity_table,entity_id,action,actor_id,changed_fields) values('wf_employee_requests',p_id::text,p_decision,p_actor,array['status','decision_reason']);
 return p_id;
end $$;

create function public.wf_save_attendance_settings(p_actor uuid,p_employee uuid,p_workdays integer[],p_start time,p_end time,p_year integer,p_days numeric,p_reason text) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.profiles p where p.id=p_actor and p.role='admin' and workforce_private.task_actor_unbanned(p_actor)) then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtextextended(p_employee::text,19));
 if p_days<coalesce((select sum(days) from public.wf_leave_movements where employee_id=p_employee and year=p_year),0) then raise exception 'الاستحقاق أقل من الإجازات المعتمدة' using errcode='PT400';end if;
 insert into public.wf_attendance_settings(employee_id,workdays,starts_at,ends_at,updated_by) values(p_employee,p_workdays,p_start,p_end,p_actor)
 on conflict(employee_id) do update set workdays=excluded.workdays,starts_at=excluded.starts_at,ends_at=excluded.ends_at,updated_by=p_actor,updated_at=now();
 insert into public.wf_leave_entitlements(employee_id,year,days,reason,updated_by) values(p_employee,p_year,p_days,p_reason,p_actor)
 on conflict(employee_id,year) do update set days=p_days,reason=p_reason,updated_by=p_actor,updated_at=now();
 insert into public.wf_audit_events(entity_table,entity_id,action,actor_id,changed_fields) values('wf_attendance_settings',p_employee::text,'settings',p_actor,array['workdays','starts_at','ends_at','leave_entitlement']);
end $$;
revoke all on function public.wf_save_attendance_settings(uuid,uuid,integer[],time,time,integer,numeric,text) from public,anon,authenticated;
grant execute on function public.wf_save_attendance_settings(uuid,uuid,integer[],time,time,integer,numeric,text) to service_role;
