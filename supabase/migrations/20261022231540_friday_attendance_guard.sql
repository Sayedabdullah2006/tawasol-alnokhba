create or replace function public.wf_work_command(p_actor uuid,p_command text,p_key uuid,p_session uuid,p_device text,p_task uuid default null,p_title text default '')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare employee uuid; s public.wf_attendance_sessions; tick timestamptz:=workforce_private.work_now(); day date;
 expiry jsonb; previous workforce_private.work_command_keys; payload jsonb; result jsonb; used_seconds numeric;
 task public.wf_tasks; kind text; target uuid; seg public.wf_work_segments;
begin
 employee:=workforce_private.assert_task_actor(p_actor);
 if employee is null then raise insufficient_privilege;end if;
 if p_device is null or length(p_device)<>64 or p_key is null then raise insufficient_privilege;end if;
 -- Riyadh server time is authoritative, including retries and direct RPC calls.
 if p_command in ('in','out') and extract(dow from tick at time zone 'Asia/Riyadh')=5 then
  raise sqlstate 'PT409' using message='الجمعة إجازة أسبوعية؛ تسجيل الحضور والانصراف غير متاح';
 end if;
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
