-- New sessions opt in; historical attendance remains unchanged. Never apply before release approval.
alter table public.wf_attendance_sessions
 add column policy_version integer not null default 0,
 add column cutoff_at timestamptz,
 add column last_seen_at timestamptz,
 add column next_confirmation_at timestamptz,
 add column device_hash text,
 add column close_reason text,
 add column break_started_at timestamptz,
 add column break_paid_until timestamptz,
 add column unpaid_periods jsonb not null default '[]';

create table public.wf_work_segments (
 id uuid primary key default gen_random_uuid(),
 session_id uuid not null references public.wf_attendance_sessions(id),
 employee_id uuid not null references public.wf_employees(id),
 task_id uuid references public.wf_tasks(id),
 kind text not null check(kind in ('task','activity','break','unallocated')),
 title text not null default '', starts_at timestamptz not null, ends_at timestamptz,
 paid_until timestamptz,
 check(ends_at is null or ends_at>=starts_at),
 check((kind='task')=(task_id is not null))
);
create unique index wf_work_one_active on public.wf_work_segments(employee_id) where ends_at is null;
create index wf_work_session_segments on public.wf_work_segments(session_id,starts_at);
create index wf_work_task_segments on public.wf_work_segments(task_id) where ends_at is null;
alter table public.wf_work_segments enable row level security;
revoke all on public.wf_work_segments from public,anon,authenticated;
grant select on public.wf_work_segments to authenticated;
grant select,insert,update,delete on public.wf_work_segments to service_role;
create policy wf_work_segments_read on public.wf_work_segments for select to authenticated
 using((select workforce_private.is_admin()) or employee_id=(select workforce_private.employee_id()));

alter table public.wf_task_time_entries add column attendance_segment_id uuid unique references public.wf_work_segments(id);

create function workforce_private.work_now() returns timestamptz language sql volatile set search_path='' as $$ select clock_timestamp() $$;
revoke all on function workforce_private.work_now() from public,anon,authenticated;
grant execute on function workforce_private.work_now() to service_role,authenticated;

-- The same deadline is used by commands, cron, reports and the live UI.
create function workforce_private.work_expiry(s public.wf_attendance_sessions, tick timestamptz)
returns jsonb language plpgsql stable set search_path='' as $$
declare finish timestamptz; reason text; seen timestamptz;
begin
 if s.checked_out is not null then return jsonb_build_object('at',s.checked_out,'reason',s.close_reason); end if;
 if s.policy_version=0 then return null; end if;
 if tick>=s.cutoff_at then finish:=s.cutoff_at; reason:='day_end';end if;
 seen:=case when s.break_started_at is not null then greatest(s.last_seen_at,s.break_paid_until) else s.last_seen_at end;
 if tick>=seen+interval '5 minutes' and (finish is null or seen<finish) then finish:=seen;reason:='connection_lost';end if;
 if s.break_started_at is null and tick>=s.next_confirmation_at+interval '5 minutes'
  and (finish is null or s.next_confirmation_at<finish) then finish:=s.next_confirmation_at;reason:='confirmation_missed';end if;
 if finish is null then return null;end if;
 return jsonb_build_object('at',greatest(s.checked_in,finish),'reason',reason);
end $$;
revoke all on function workforce_private.work_expiry(public.wf_attendance_sessions,timestamptz) from public,anon,authenticated;
grant execute on function workforce_private.work_expiry(public.wf_attendance_sessions,timestamptz) to service_role;
-- Pure deadline calculation; caller-supplied rows grant no data access or mutation.
grant execute on function workforce_private.work_expiry(public.wf_attendance_sessions,timestamptz) to authenticated;

create or replace function public.wf_time_summary(p_task uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 with closed as (
  select coalesce(sum(extract(epoch from ends_at-starts_at)) filter(where ends_at is not null),0) seconds,
   count(*) filter(where ends_at is not null) entries,count(*) filter(where ends_at is null) running
  from public.wf_task_time_entries where task_id=p_task and archived_at is null
 ), active as (
  select coalesce(sum(greatest(0,extract(epoch from least(workforce_private.work_now(),a.cutoff_at,coalesce((workforce_private.work_expiry(a,workforce_private.work_now())->>'at')::timestamptz,workforce_private.work_now()))-w.starts_at))),0) seconds,count(*) entries
  from public.wf_work_segments w join public.wf_attendance_sessions a on a.id=w.session_id
  where w.task_id=p_task and w.ends_at is null and a.checked_out is null
 ) select jsonb_build_object('seconds',floor(closed.seconds+active.seconds)::bigint,'entries',closed.entries,'running',closed.running,'active',active.entries)
 from closed cross join active;
$$;
revoke all on function public.wf_time_summary(uuid) from public,anon;
grant execute on function public.wf_time_summary(uuid) to authenticated,service_role;

create function workforce_private.end_work_segment(p_session uuid,p_at timestamptz) returns void
language plpgsql security invoker set search_path='' as $$
declare seg public.wf_work_segments; finish timestamptz; owner_user uuid; locked_task uuid;
begin
 -- Task/FK locks precede segment locks, matching the task review transaction.
 select task_id into locked_task from public.wf_work_segments where session_id=p_session and ends_at is null;
 if locked_task is not null then perform 1 from public.wf_tasks where id=locked_task for key share;end if;
 select * into seg from public.wf_work_segments where session_id=p_session and ends_at is null for update;
 if not found then return;end if;
 finish:=greatest(seg.starts_at,p_at);
 update public.wf_work_segments set ends_at=finish where id=seg.id;
 if seg.kind='break' then
  if finish>seg.paid_until then
   update public.wf_attendance_sessions set unpaid_periods=unpaid_periods||jsonb_build_array(jsonb_build_object('start',seg.paid_until,'end',finish)) where id=p_session;
  end if;
  update public.wf_attendance_sessions set next_confirmation_at=next_confirmation_at+(finish-seg.starts_at),break_started_at=null,break_paid_until=null where id=p_session;
 elsif seg.kind='task' and finish>seg.starts_at then
  select user_id into owner_user from public.wf_employees where id=seg.employee_id;
  insert into public.wf_task_time_entries(id,task_id,employee_id,starts_at,ends_at,note,created_by,attendance_segment_id)
   values(seg.id,seg.task_id,seg.employee_id,seg.starts_at,finish,seg.title,owner_user,seg.id);
  insert into public.wf_task_time_revisions(entry_id,version,starts_at,ends_at,note,archived,action,reason,changed_by)
   values(seg.id,1,seg.starts_at,finish,seg.title,false,'create','جلسة عمل مرتبطة بالحضور',owner_user);
 end if;
end $$;
revoke all on function workforce_private.end_work_segment(uuid,timestamptz) from public,anon,authenticated;
grant execute on function workforce_private.end_work_segment(uuid,timestamptz) to service_role;

create function workforce_private.close_work_session(p_session uuid,p_at timestamptz,p_reason text) returns void
language plpgsql security invoker set search_path='' as $$
begin
 perform workforce_private.end_work_segment(p_session,p_at);
 update public.wf_attendance_sessions set checked_out=greatest(checked_in,p_at),close_reason=p_reason,
  version=version+1,updated_at=workforce_private.work_now() where id=p_session and checked_out is null;
end $$;
revoke all on function workforce_private.close_work_session(uuid,timestamptz,text) from public,anon,authenticated;
grant execute on function workforce_private.close_work_session(uuid,timestamptz,text) to service_role;

create function public.wf_expire_work_sessions() returns integer language plpgsql security invoker set search_path='' as $$
declare s public.wf_attendance_sessions; expiry jsonb; changed integer:=0;
begin
 for s in select * from public.wf_attendance_sessions where policy_version=1 and checked_out is null order by employee_id for update skip locked loop
  expiry:=workforce_private.work_expiry(s,workforce_private.work_now());
  if expiry is not null then perform workforce_private.close_work_session(s.id,(expiry->>'at')::timestamptz,expiry->>'reason');changed:=changed+1;end if;
 end loop;
 return changed;
end $$;
revoke all on function public.wf_expire_work_sessions() from public,anon,authenticated;
grant execute on function public.wf_expire_work_sessions() to service_role;

create function public.wf_work_snapshot(p_actor uuid,p_employee uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare employee uuid; s public.wf_attendance_sessions; expiry jsonb; tick timestamptz:=workforce_private.work_now(); result jsonb;
begin
 employee:=workforce_private.assert_task_actor(p_actor);
 if employee is null then employee:=p_employee;elsif p_employee is not null and p_employee<>employee then raise insufficient_privilege;end if;
 if employee is null then raise insufficient_privilege;end if;
 select * into s from public.wf_attendance_sessions where employee_id=employee and checked_out is null for update;
 if found then
  expiry:=workforce_private.work_expiry(s,tick);
  if expiry is not null then perform workforce_private.close_work_session(s.id,(expiry->>'at')::timestamptz,expiry->>'reason');s:=null;end if;
 end if;
 select jsonb_build_object('now',tick,'session',case when s.id is null then null else to_jsonb(s)-'device_hash' end,
  'todaySeconds',coalesce((select sum(extract(epoch from upper(r)-lower(r))) from public.wf_attendance_sessions a
    cross join lateral workforce_private.work_credit_ranges(a,tick) r where a.employee_id=employee and a.business_date=(tick at time zone 'Asia/Riyadh')::date),0),
  'active',(select to_jsonb(w) from public.wf_work_segments w where session_id=s.id and ends_at is null),
  'lastSession',(select to_jsonb(a)-'device_hash' from public.wf_attendance_sessions a where employee_id=employee order by checked_in desc limit 1),
  'breakUsedSeconds',coalesce((select sum(extract(epoch from least(w.ends_at,w.paid_until)-w.starts_at)) from public.wf_work_segments w
   join public.wf_attendance_sessions a on a.id=w.session_id where w.employee_id=employee and a.business_date=(tick at time zone 'Asia/Riyadh')::date and w.kind='break' and w.ends_at is not null),0),
  'tasks',coalesce((select jsonb_agg(t order by t.due_at nulls last,t.id) from (
    select t.id,t.title,t.due_at,c.kind state from public.wf_tasks t join public.wf_task_columns c on c.id=t.column_id join public.wf_boards b on b.id=t.board_id
    where (t.assignee_id=employee or employee=any(t.co_assignee_ids)) and t.archived_at is null and b.archived_at is null and c.archived_at is null
    and c.kind not in ('review','done') and t.test_run_id is null and t.blocked_reason=''
    and not exists(select 1 from public.wf_task_dependencies d join public.wf_tasks dep on dep.id=d.depends_on_id join public.wf_task_columns dc on dc.id=dep.column_id where d.task_id=t.id and dc.kind<>'done')
  ) t),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.wf_work_snapshot(uuid,uuid) from public,anon,authenticated;
grant execute on function public.wf_work_snapshot(uuid,uuid) to service_role;

create table workforce_private.work_command_keys (
 actor_id uuid not null, key uuid not null, payload jsonb not null, result jsonb not null, primary key(actor_id,key)
);
alter table workforce_private.work_command_keys enable row level security;
revoke all on workforce_private.work_command_keys from public,anon,authenticated;
grant select,insert on workforce_private.work_command_keys to service_role;

create table workforce_private.work_policy (id boolean primary key default true check(id), activated_at timestamptz not null default clock_timestamp());
insert into workforce_private.work_policy(id) values(true);
alter table workforce_private.work_policy enable row level security;
revoke all on workforce_private.work_policy from public,anon,authenticated;
grant select on workforce_private.work_policy to service_role;

create function public.wf_work_command(p_actor uuid,p_command text,p_key uuid,p_session uuid,p_device text,p_task uuid default null,p_title text default '')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare employee uuid; s public.wf_attendance_sessions; tick timestamptz:=workforce_private.work_now(); day date;
 expiry jsonb; previous workforce_private.work_command_keys; payload jsonb; result jsonb; used_seconds numeric;
 task public.wf_tasks; kind text; target uuid; seg public.wf_work_segments;
begin
 employee:=workforce_private.assert_task_actor(p_actor);
 if employee is null then raise insufficient_privilege;end if;
 if p_device is null or length(p_device)<>64 or p_key is null then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtextextended(employee::text,19));
 payload:=jsonb_build_object('command',p_command,'session',p_session,'device',p_device,'task',p_task,'title',p_title);
 if p_command<>'heartbeat' then
  select * into previous from workforce_private.work_command_keys where actor_id=p_actor and key=p_key;
  if found then
   if previous.payload<>payload then raise exception 'أعيد استخدام الطلب ببيانات مختلفة' using errcode='PT409';end if;
   return public.wf_work_snapshot(p_actor,employee);
  end if;
 end if;
 select * into s from public.wf_attendance_sessions where employee_id=employee and checked_out is null for update;
 if found then
  expiry:=workforce_private.work_expiry(s,tick);
  if expiry is not null then perform workforce_private.close_work_session(s.id,(expiry->>'at')::timestamptz,expiry->>'reason');s:=null;end if;
 end if;
 day:=(tick at time zone 'Asia/Riyadh')::date;
 if p_command='in' then
  if s.id is not null then raise exception 'الحضور مسجل بالفعل' using errcode='PT409';end if;
  if (tick at time zone 'Asia/Riyadh')::time>=time '17:00' then raise exception 'انتهى وقت الدوام؛ تسجيل الحضور متاح قبل الخامسة مساءً' using errcode='PT409';end if;
  if not exists(select 1 from public.wf_employees where id=employee and start_date<=day) then raise exception 'لم يبدأ تاريخ المباشرة' using errcode='PT409';end if;
  insert into public.wf_attendance_sessions(id,employee_id,business_date,checked_in,source,updated_by,policy_version,cutoff_at,last_seen_at,next_confirmation_at,device_hash)
   values(p_key,employee,day,tick,'clock',p_actor,1,(day+time '17:00') at time zone 'Asia/Riyadh',tick,tick+interval '1 hour',p_device) returning * into s;
  insert into public.wf_work_segments(session_id,employee_id,kind,title,starts_at) values(s.id,employee,'unallocated','وقت غير مرتبط بمهمة',tick);
 else
  -- Return a closed snapshot (do not roll back the automatic closure by raising).
  if s.id is null then return public.wf_work_snapshot(p_actor,employee);end if;
  if p_session is distinct from s.id then raise insufficient_privilege;end if;
  if p_command='out' and s.policy_version=0 then
   perform workforce_private.close_work_session(s.id,least(tick,s.checked_in+interval '24 hours'),'manual');
   return public.wf_work_snapshot(p_actor,employee);
  end if;
  if p_device is distinct from s.device_hash then raise insufficient_privilege;end if;
  if s.policy_version<>1 then raise exception 'أغلقي فترة الحضور السابقة أولًا' using errcode='PT409';end if;
  if p_command='heartbeat' then
   update public.wf_attendance_sessions set last_seen_at=tick where id=s.id;
  elsif p_command='out' then
   perform workforce_private.close_work_session(s.id,tick,'manual');
  elsif p_command='confirm' then
   if s.break_started_at is not null or tick<s.next_confirmation_at then raise exception 'لم يحن موعد التأكيد' using errcode='PT409';end if;
   update public.wf_attendance_sessions set next_confirmation_at=tick+interval '1 hour',last_seen_at=tick where id=s.id;
  elsif p_command in ('task','activity','break','resume') then
   if s.break_started_at is null and tick>=s.next_confirmation_at then raise exception 'أكدي استمرار العمل أولًا' using errcode='PT409';end if;
   if p_command='task' then
    -- Switching shared tasks across boards locks both boards in deterministic order.
    perform 1 from public.wf_boards b where b.id in (
     select t.board_id from public.wf_tasks t where t.id=p_task
     union select t.board_id from public.wf_tasks t join public.wf_work_segments w on w.task_id=t.id where w.session_id=s.id and w.ends_at is null
    ) order by b.id for update;
    select * into task from public.wf_tasks where id=p_task for update;
    if not found or not(coalesce(task.assignee_id=employee,false) or employee=any(task.co_assignee_ids)) then raise insufficient_privilege;end if;
    select c.kind into kind from public.wf_task_columns c join public.wf_boards b on b.id=c.board_id
     where c.id=task.column_id and c.archived_at is null and b.archived_at is null;
    if kind is null or kind in ('review','done') or task.archived_at is not null or task.test_run_id is not null or task.blocked_reason<>'' then raise exception 'المهمة غير متاحة للعمل الآن' using errcode='PT409';end if;
    if exists(select 1 from public.wf_task_dependencies d join public.wf_tasks t on t.id=d.depends_on_id join public.wf_task_columns c on c.id=t.column_id where d.task_id=p_task and c.kind<>'done') then raise exception 'أكملي المهام السابقة أولًا' using errcode='PT409';end if;
    if kind='new' then
     select c.id into target from public.wf_task_columns c where c.board_id=task.board_id and c.kind='in_progress' and c.archived_at is null order by c.position,c.id limit 1;
     if target is null then raise exception 'عمود قيد التنفيذ غير متاح' using errcode='PT409';end if;
     update public.wf_tasks set column_id=target,version=version+1,updated_at=tick,updated_by=p_actor where id=task.id;
     insert into public.wf_task_events(task_id,actor_id,action,changed_fields,summary) values(task.id,p_actor,'task:move',array['column_id'],'بدء العمل على المهمة');
    end if;
   elsif p_command='activity' and length(btrim(p_title)) not between 3 and 200 then raise exception 'اكتبي عنوان النشاط' using errcode='PT400';end if;
   select * into seg from public.wf_work_segments where session_id=s.id and ends_at is null;
   if p_command='break' and seg.kind='break' then raise exception 'الاستراحة مسجلة' using errcode='PT409';end if;
   if p_command='resume' and seg.kind is distinct from 'break' then raise exception 'لا توجد استراحة مفتوحة' using errcode='PT409';end if;
   if p_command='task' and seg.task_id=p_task then return public.wf_work_snapshot(p_actor,employee);end if;
   perform workforce_private.end_work_segment(s.id,tick);
   if p_command='break' then
    select coalesce(sum(extract(epoch from least(w.ends_at,w.paid_until)-w.starts_at)),0) into used_seconds
     from public.wf_work_segments w join public.wf_attendance_sessions a on a.id=w.session_id
     where w.employee_id=employee and a.business_date=day and w.kind='break' and w.ends_at is not null;
    update public.wf_attendance_sessions set break_started_at=tick,break_paid_until=least(s.cutoff_at,tick+greatest(0,1800-used_seconds)*interval '1 second') where id=s.id returning * into s;
   end if;
   insert into public.wf_work_segments(session_id,employee_id,task_id,kind,title,starts_at,paid_until)
    values(s.id,employee,case when p_command='task' then p_task end,
     case p_command when 'resume' then 'unallocated' else p_command end,
     case p_command when 'task' then task.title when 'activity' then btrim(p_title) when 'break' then 'استراحة' else 'وقت غير مرتبط بمهمة' end,tick,
     case when p_command='break' then s.break_paid_until end);
   update public.wf_attendance_sessions set last_seen_at=tick where id=s.id;
  else raise exception 'إجراء غير صحيح' using errcode='PT400';end if;
 end if;
 result:=public.wf_work_snapshot(p_actor,employee);
 if p_command<>'heartbeat' then insert into workforce_private.work_command_keys values(p_actor,p_key,payload,'{}');end if;
 return result;
end $$;
revoke all on function public.wf_work_command(uuid,text,uuid,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.wf_work_command(uuid,text,uuid,uuid,text,uuid,text) to service_role;

-- A submission, approval, archive or reassignment ends time for affected workers atomically.
create function workforce_private.stop_unavailable_work() returns trigger language plpgsql security invoker set search_path='' as $$
declare seg public.wf_work_segments; kind text; expiry jsonb; s public.wf_attendance_sessions; tick timestamptz:=workforce_private.work_now();
begin
 select c.kind into kind from public.wf_task_columns c where c.id=new.column_id;
 for seg in select * from public.wf_work_segments where task_id=new.id and ends_at is null order by employee_id for update loop
  if new.archived_at is not null or kind in ('review','done') or not(coalesce(new.assignee_id=seg.employee_id,false) or seg.employee_id=any(new.co_assignee_ids)) then
   select * into s from public.wf_attendance_sessions where id=seg.session_id;
   expiry:=workforce_private.work_expiry(s,tick);
   perform workforce_private.end_work_segment(seg.session_id,least(tick,coalesce((expiry->>'at')::timestamptz,tick)));
   -- Leave the attendance open without a task. Do not take an attendance-row lock
   -- from this task trigger: clock commands consistently lock attendance before tasks.
  end if;
 end loop;
 return new;
end $$;

-- Credited attendance = merged attendance ranges minus unpaid break excess; never add task time.
create function workforce_private.work_credit_ranges(a public.wf_attendance_sessions,p_now timestamptz)
returns setof tstzrange language plpgsql stable set search_path='' as $$
declare finish timestamptz; expiry jsonb; ranges tstzmultirange; ex jsonb;
begin
 finish:=least(coalesce(a.checked_out,a.checked_in+interval '24 hours'),p_now);
 if a.policy_version=1 then
  expiry:=workforce_private.work_expiry(a,p_now);
  finish:=least(finish,a.cutoff_at,coalesce((expiry->>'at')::timestamptz,finish));
 end if;
 if finish<=a.checked_in then return;end if;
 ranges:=tstzmultirange(tstzrange(a.checked_in,finish,'[)'));
 for ex in select * from jsonb_array_elements(a.unpaid_periods) loop
  ranges:=ranges-tstzmultirange(tstzrange((ex->>'start')::timestamptz,(ex->>'end')::timestamptz,'[)'));
 end loop;
 if a.break_started_at is not null and a.break_paid_until<finish then
  ranges:=ranges-tstzmultirange(tstzrange(a.break_paid_until,finish,'[)'));
 end if;
 return query select unnest(ranges);
end $$;
revoke all on function workforce_private.work_credit_ranges(public.wf_attendance_sessions,timestamptz) from public,anon,authenticated;
grant execute on function workforce_private.work_credit_ranges(public.wf_attendance_sessions,timestamptz) to service_role;

create or replace function workforce_private.report_attendance_seconds(p_employee uuid,p_from timestamptz,p_until timestamptz)
returns bigint language sql stable security invoker set search_path='' as $$
 with periods as (
  select greatest(lower(r),p_from,e.start_date::timestamp at time zone 'Asia/Riyadh') lo,
    least(upper(r),p_until) hi
  from public.wf_attendance_sessions a join public.wf_employees e on e.id=a.employee_id
  cross join lateral workforce_private.work_credit_ranges(a,workforce_private.work_now()) r
  where a.employee_id=p_employee and a.checked_in<p_until and (a.checked_out>=p_from or a.checked_out is null)
 ), merged as (select range_agg(tstzrange(lo,hi,'[)')) ranges from periods where hi>lo)
 select floor(coalesce(sum(extract(epoch from upper(r)-lower(r))),0))::bigint from merged cross join lateral unnest(ranges) r;
$$;
revoke all on function workforce_private.stop_unavailable_work() from public,anon,authenticated;
grant execute on function workforce_private.stop_unavailable_work() to service_role;
create trigger wf_work_task_changed after update of column_id,assignee_id,co_assignee_ids,archived_at on public.wf_tasks
 for each row execute function workforce_private.stop_unavailable_work();

create function workforce_private.stop_archived_workspace_work() returns trigger language plpgsql security invoker set search_path='' as $$
declare seg public.wf_work_segments; s public.wf_attendance_sessions; expiry jsonb; tick timestamptz:=workforce_private.work_now();
begin
 if new.archived_at is null then return new;end if;
 for seg in select w.* from public.wf_work_segments w join public.wf_tasks t on t.id=w.task_id
   where w.ends_at is null and ((tg_table_name='wf_boards' and t.board_id=new.id) or (tg_table_name='wf_task_columns' and t.column_id=new.id))
   order by w.employee_id for update of w loop
  select * into s from public.wf_attendance_sessions where id=seg.session_id;
  expiry:=workforce_private.work_expiry(s,tick);
  perform workforce_private.end_work_segment(seg.session_id,least(tick,coalesce((expiry->>'at')::timestamptz,tick)));
 end loop;
 return new;
end $$;
revoke all on function workforce_private.stop_archived_workspace_work() from public,anon,authenticated;
grant execute on function workforce_private.stop_archived_workspace_work() to service_role;
create trigger wf_work_board_archived after update of archived_at on public.wf_boards for each row execute function workforce_private.stop_archived_workspace_work();
create trigger wf_work_column_archived after update of archived_at on public.wf_task_columns for each row execute function workforce_private.stop_archived_workspace_work();

-- Managed task periods are immutable; future manual periods cannot bypass the attendance clock.
create function workforce_private.guard_attendance_time() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and old.attendance_segment_id is not null then
  if pg_trigger_depth()<2 or new.attendance_segment_id is distinct from old.attendance_segment_id or new.employee_id<>old.employee_id or new.task_id<>old.task_id or new.note<>old.note then
   raise exception 'وقت مرتبط بالحضور؛ قدمي طلب تصحيح حضور' using errcode='PT409';
  end if;
 end if;
 if new.attendance_segment_id is null and coalesce(new.ends_at,workforce_private.work_now())>=(select activated_at from workforce_private.work_policy) then
  raise exception 'استخدمي بدء العمل لربط الوقت بالحضور' using errcode='PT409';end if;
 return new;
end $$;
revoke all on function workforce_private.guard_attendance_time() from public,anon,authenticated;
grant execute on function workforce_private.guard_attendance_time() to service_role;
create trigger wf_guard_attendance_time before insert or update on public.wf_task_time_entries for each row execute function workforce_private.guard_attendance_time();

-- Corrections keep managed task periods inside attendance, with an immutable revision trail.
create function workforce_private.reconcile_work_correction() returns trigger language plpgsql security invoker set search_path='' as $$
declare seg public.wf_work_segments; entry public.wf_task_time_entries; lo timestamptz; hi timestamptz;
begin
 if new.source<>'correction' or old.policy_version<>1 then return new;end if;
 if (new.checked_in at time zone 'Asia/Riyadh')::date<>old.business_date or new.checked_out is null or new.checked_out>old.cutoff_at then
  raise exception 'تصحيح الفترة ضمن يوم الحضور وحتى الخامسة مساءً' using errcode='PT409';end if;
 perform 1 from public.wf_tasks t where t.id in(select task_id from public.wf_work_segments where session_id=new.id) order by t.id for key share;
 for seg in select * from public.wf_work_segments where session_id=new.id order by starts_at for update loop
  lo:=least(greatest(seg.starts_at,new.checked_in),new.checked_out);
  hi:=greatest(lo,least(coalesce(seg.ends_at,new.checked_out),new.checked_out));
  update public.wf_work_segments set starts_at=lo,ends_at=hi,paid_until=case when paid_until is null then null else greatest(lo,least(paid_until,hi)) end where id=seg.id;
  if seg.task_id is not null then
   update public.wf_task_time_entries set starts_at=case when hi>lo then lo else starts_at end,ends_at=case when hi>lo then hi else ends_at end,
     archived_at=case when hi=lo then workforce_private.work_now() else archived_at end,version=version+1
    where attendance_segment_id=seg.id returning * into entry;
   if found then insert into public.wf_task_time_revisions(entry_id,version,starts_at,ends_at,note,archived,action,reason,changed_by)
    values(entry.id,entry.version,entry.starts_at,entry.ends_at,entry.note,entry.archived_at is not null,case when hi=lo then 'archive' else 'edit' end,'تصحيح حضور معتمد: '||new.note,new.updated_by);
   elsif hi>lo then
    insert into public.wf_task_time_entries(id,task_id,employee_id,starts_at,ends_at,note,created_by,attendance_segment_id)
     values(seg.id,seg.task_id,seg.employee_id,lo,hi,seg.title,(select user_id from public.wf_employees where id=seg.employee_id),seg.id);
    insert into public.wf_task_time_revisions(entry_id,version,starts_at,ends_at,note,archived,action,reason,changed_by)
     values(seg.id,1,lo,hi,seg.title,false,'create','تصحيح حضور معتمد',new.updated_by);
   end if;
  elsif seg.kind='break' and seg.ends_at is null and hi>seg.paid_until then
   update public.wf_attendance_sessions set unpaid_periods=unpaid_periods||jsonb_build_array(jsonb_build_object('start',seg.paid_until,'end',hi)) where id=new.id;
  end if;
 end loop;
 update public.wf_attendance_sessions set break_started_at=null,break_paid_until=null where id=new.id;
 return new;
end $$;
revoke all on function workforce_private.reconcile_work_correction() from public,anon,authenticated;
grant execute on function workforce_private.reconcile_work_correction() to service_role;
create trigger wf_reconcile_work_correction after update of checked_in,checked_out on public.wf_attendance_sessions
 for each row execute function workforce_private.reconcile_work_correction();

create function workforce_private.guard_work_correction() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.source='correction' and (new.policy_version=1 or new.checked_in>=(select date_trunc('day',activated_at at time zone 'Asia/Riyadh') at time zone 'Asia/Riyadh' from workforce_private.work_policy)) then
  if new.checked_out is null or (new.checked_out at time zone 'Asia/Riyadh')::date<>(new.checked_in at time zone 'Asia/Riyadh')::date
    or (new.checked_out at time zone 'Asia/Riyadh')::time>time '17:00' then
   raise exception 'تصحيح الحضور ضمن يوم واحد وحتى الخامسة مساءً' using errcode='PT409';end if;
  new.policy_version:=1;new.cutoff_at:=((new.checked_in at time zone 'Asia/Riyadh')::date+time '17:00') at time zone 'Asia/Riyadh';
 end if;
 return new;
end $$;
revoke all on function workforce_private.guard_work_correction() from public,anon,authenticated;
grant execute on function workforce_private.guard_work_correction() to service_role;
create trigger wf_guard_work_correction before insert or update of checked_in,checked_out on public.wf_attendance_sessions
 for each row execute function workforce_private.guard_work_correction();

alter table public.wf_attendance_sessions add constraint wf_managed_session_bounds check(
 policy_version=0 or (policy_version=1 and cutoff_at is not null and checked_in<=cutoff_at
 and (checked_out is null or checked_out<=cutoff_at)
 and (checked_out is not null or (last_seen_at is not null and next_confirmation_at is not null and device_hash is not null)))
);

-- Block the legacy check-in RPC from bypassing the new session/device/confirmation policy.
alter function public.wf_clock_attendance(uuid,text,uuid) rename to wf_clock_attendance_legacy;
revoke all on function public.wf_clock_attendance_legacy(uuid,text,uuid) from service_role;

-- The scheduler enforces closure even if every browser is closed. No HTTP or email invocation.
do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('workforce-close-work-sessions','* * * * *','select public.wf_expire_work_sessions()');
 end if;
end $$;
