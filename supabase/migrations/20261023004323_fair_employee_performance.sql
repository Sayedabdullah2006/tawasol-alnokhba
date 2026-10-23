-- Weight derives from planned working duration, never from a manual size.
create function workforce_private.performance_duration_size(p_start timestamptz,p_due timestamptz) returns text language sql immutable set search_path='' as $$
 with days as(select d::date as work_day from generate_series((p_start at time zone 'Asia/Riyadh')::date::timestamp,(p_due at time zone 'Asia/Riyadh')::date::timestamp,interval '1 day') d), duration as(
 select coalesce(sum(greatest(0,extract(epoch from least(p_due,(work_day+time '17:00') at time zone 'Asia/Riyadh')-greatest(p_start,(work_day+time '09:00') at time zone 'Asia/Riyadh')))),0)/3600 hours from days where extract(dow from work_day)<>5 and to_char(work_day,'MM-DD') not in ('02-22','09-23'))
 select case when p_start is null or p_due is null or p_due<=p_start or hours<=0 then null when hours<=8 then 'small' when hours<=40 then 'medium' else 'large' end from duration;
$$;
revoke all on function workforce_private.performance_duration_size(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function workforce_private.performance_duration_size(timestamptz,timestamptz) to service_role;
-- Prospective evidence only: existing work is never backfilled with invented scores.
create table public.wf_performance_assignments (
 task_id uuid not null references public.wf_tasks(id) on delete cascade,
 employee_id uuid not null references public.wf_employees(id),
 size text check(size in ('small','medium','large')),
 participant_count integer not null default 1 check(participant_count>0),
 starts_at timestamptz,
 weight_due_at timestamptz,
 responsibility text not null default '',
 sealed boolean not null default false,
 due_at timestamptz,
 configured_at timestamptz,
 enrolled_at timestamptz not null default now(),
 withdrawn boolean not null default false,
 exception_reason text,
 exception_by uuid references public.profiles(id),
 exception_at timestamptz,
 primary key(task_id,employee_id)
);
alter table public.wf_task_submissions
 add column review_category text check(review_category in ('requirements','improvement','scope_change')),
 add column revision_due_at timestamptz,
 add column review_incomplete boolean not null default false,
 add column review_employee_ids uuid[],
 add column review_command_key uuid unique;
create table public.wf_performance_deliveries (
 task_id uuid not null,
 employee_id uuid not null,
 round integer not null check(round>0),
 delivered_at timestamptz not null default now(),
 due_at timestamptz not null,
 summary text not null,
 status text not null default 'pending' check(status in ('pending','approved','changes')),
 category text check(category in ('requirements','improvement','scope_change')),
 incomplete boolean not null default false,
 affected boolean not null default false,
 decided_at timestamptz,
 revision_due_at timestamptz,
 primary key(task_id,employee_id,round),
 foreign key(task_id,employee_id) references public.wf_performance_assignments(task_id,employee_id) on delete cascade
);
create table public.wf_performance_exceptions (
 id uuid primary key default gen_random_uuid(),task_id uuid not null,employee_id uuid not null,
 previous_due_at timestamptz,new_due_at timestamptz not null,reason text not null,approved_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 foreign key(task_id,employee_id) references public.wf_performance_assignments(task_id,employee_id) on delete cascade
);
create index wf_performance_assignments_employee on public.wf_performance_assignments(employee_id,task_id);
create index wf_performance_deliveries_employee on public.wf_performance_deliveries(employee_id,task_id,round);
create index wf_performance_exceptions_employee on public.wf_performance_exceptions(employee_id,created_at,id);
alter table public.wf_performance_assignments enable row level security;
alter table public.wf_performance_deliveries enable row level security;
alter table public.wf_performance_exceptions enable row level security;
revoke all on public.wf_performance_assignments,public.wf_performance_deliveries,public.wf_performance_exceptions from public,anon,authenticated;
grant select on public.wf_performance_assignments,public.wf_performance_deliveries,public.wf_performance_exceptions to authenticated;
grant all on public.wf_performance_assignments,public.wf_performance_deliveries,public.wf_performance_exceptions to service_role;
create policy performance_config_read on public.wf_performance_assignments for select to authenticated using(workforce_private.is_admin() or employee_id=workforce_private.employee_id());
create policy performance_deliveries_read on public.wf_performance_deliveries for select to authenticated using(workforce_private.is_admin() or employee_id=workforce_private.employee_id());
create policy performance_exceptions_read on public.wf_performance_exceptions for select to authenticated using(workforce_private.is_admin() or employee_id=workforce_private.employee_id());

create function workforce_private.performance_members() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if current_setting('workforce.performance_exception',true)=new.id::text then return new;end if;
  -- Only prospective scheduling edits can alter automatic weight or assessment baseline.
  if (old.starts_at is distinct from new.starts_at or old.due_at is distinct from new.due_at) and (old.due_at is null or old.due_at>now()) and not exists(select 1 from public.wf_task_submissions where task_id=new.id) and not exists(select 1 from public.wf_performance_deliveries where task_id=new.id) then
   update public.wf_performance_assignments set starts_at=new.starts_at,weight_due_at=new.due_at,due_at=new.due_at,size=workforce_private.performance_duration_size(new.starts_at,new.due_at),configured_at=case when new.due_at>now() then coalesce(configured_at,now()) else null end where task_id=new.id and not withdrawn and (weight_due_at is null or weight_due_at>now());
  end if;
  if (old.due_at is null or old.due_at>now()) and not exists(select 1 from public.wf_task_submissions where task_id=new.id) and not exists(select 1 from public.wf_performance_deliveries where task_id=new.id) then
   update public.wf_performance_assignments set participant_count=(cardinality(array_remove(array[new.assignee_id]||new.co_assignee_ids,null))+case when new.assignee_admin_id is not null then 1 else 0 end) where task_id=new.id;
  end if;
  if old.assignee_id is not distinct from new.assignee_id and old.co_assignee_ids=new.co_assignee_ids then return new;end if;
 end if;
 update public.wf_performance_assignments set withdrawn=true where task_id=new.id and not(employee_id=any(array_remove(array[new.assignee_id]||new.co_assignee_ids,null)));
 insert into public.wf_performance_assignments(task_id,employee_id,starts_at,weight_due_at,due_at,size,configured_at,participant_count)
 select new.id,e,new.starts_at,new.due_at,new.due_at,workforce_private.performance_duration_size(new.starts_at,new.due_at),case when new.due_at>now() and not exists(select 1 from public.wf_task_submissions where task_id=new.id) and not exists(select 1 from public.wf_performance_deliveries where task_id=new.id) then now() else null end,(cardinality(array_remove(array[new.assignee_id]||new.co_assignee_ids,null))+case when new.assignee_admin_id is not null then 1 else 0 end) from unnest(array_remove(array[new.assignee_id]||new.co_assignee_ids,null)) e
 on conflict(task_id,employee_id) do update set withdrawn=false;
 return new;
end $$;
create trigger wf_performance_members after insert or update of assignee_id,assignee_admin_id,co_assignee_ids,starts_at,due_at on public.wf_tasks for each row execute function workforce_private.performance_members();
-- Enrol unfinished, unsubmitted work prospectively; never invent past deliveries.
insert into public.wf_performance_assignments(task_id,employee_id,starts_at,weight_due_at,due_at,size,configured_at,participant_count)
select t.id,e,t.starts_at,t.due_at,t.due_at,workforce_private.performance_duration_size(t.starts_at,t.due_at),now(),(cardinality(array_remove(array[t.assignee_id]||t.co_assignee_ids,null))+case when t.assignee_admin_id is not null then 1 else 0 end)
from public.wf_tasks t cross join lateral unnest(array_remove(array[t.assignee_id]||t.co_assignee_ids,null)) e
where t.deleted_at is null and t.test_run_id is null and t.archived_at is null and t.due_at>now() and not exists(select 1 from public.wf_task_submissions s where s.task_id=t.id)
on conflict do nothing;


create function public.wf_performance_command(p_actor uuid,p_task uuid,p_version integer,p_command text,p_payload jsonb,p_key uuid) returns jsonb language plpgsql set search_path='' as $$
declare employee uuid; task public.wf_tasks; target uuid; item public.wf_performance_assignments; manager boolean; reviewer boolean; previous jsonb; cycle integer; revised timestamptz; effective_due timestamptz;
begin
 employee:=workforce_private.assert_task_actor(p_actor);
 previous:=workforce_private.command_retry(p_actor,p_key,'performance:'||p_command,p_task,p_payload);if previous is not null then return previous;end if;
 perform 1 from public.wf_boards b join public.wf_tasks t on t.board_id=b.id where t.id=p_task and b.archived_at is null for update of b;
 if not found then raise exception 'اللوحة غير متاحة' using errcode='P0002';end if;
 select * into task from public.wf_tasks where id=p_task and archived_at is null for update;
 if not found then raise exception 'المهمة غير متاحة' using errcode='P0002';end if;
 if task.version is distinct from p_version then raise exception 'تغيرت المهمة؛ حدّث البيانات' using errcode='PT409';end if;
 manager:=employee is null or workforce_private.can_manage_tasks(p_actor);
 reviewer:=employee is null or(manager and task.assignee_id is distinct from employee and not employee=any(task.co_assignee_ids));
 target:=case when p_command='contribute' then employee else (p_payload->>'employee_id')::uuid end;
 if target is null or not(target=any(array_remove(array[task.assignee_id]||task.co_assignee_ids,null))) then raise exception 'الموظفة غير مسندة للمهمة' using errcode='42501';end if;
 if p_command<>'contribute' and not manager then raise exception 'إعداد التقييم متاح للإدارة والمفوض' using errcode='42501';end if;
 insert into public.wf_performance_assignments(task_id,employee_id,due_at) values(p_task,target,task.due_at) on conflict do nothing;
 select * into item from public.wf_performance_assignments where task_id=p_task and employee_id=target for update;
 if p_command='configure' then
  if not reviewer then raise exception 'لا يمكنك ضبط تقييم مهمتك' using errcode='42501';end if;
  if item.sealed or (item.configured_at is not null and item.due_at<=now()) or task.due_at is null or task.due_at<=now() or exists(select 1 from public.wf_task_submissions where task_id=p_task) or exists(select 1 from public.wf_performance_deliveries where task_id=p_task) then raise exception 'تحدد المساهمة قبل التسليم وقبل الموعد' using errcode='PT409';end if;
  if p_payload ? 'size' then raise exception 'حجم المهمة يحسب تلقائيًا من المدة' using errcode='PT400';end if;
  if item.size is null or length(coalesce(p_payload->>'responsibility',''))>2000 then raise exception 'حدد المدة والمساهمة الفردية' using errcode='PT400';end if;
  update public.wf_performance_assignments set responsibility=coalesce(p_payload->>'responsibility',''),due_at=coalesce(item.due_at,task.due_at),configured_at=coalesce(item.configured_at,now()),sealed=true where task_id=p_task and employee_id=target;
 elsif p_command='exception' then
  if not reviewer then raise exception 'لا يمكنك اعتماد استثناء لنفسك' using errcode='42501';end if;
  revised:=nullif(p_payload->>'due_at','')::timestamptz;
  if item.configured_at is null or length(btrim(coalesce(p_payload->>'reason','')))<3 or revised is null or revised<=coalesce(item.due_at,now()) then raise exception 'حدد سبب الاستثناء وموعدًا لاحقًا' using errcode='PT400';end if;
  insert into public.wf_performance_exceptions(task_id,employee_id,previous_due_at,new_due_at,reason,approved_by) values(p_task,target,item.due_at,revised,p_payload->>'reason',p_actor);
  -- An approved exception adjusts only the affected person's deadline, with an audit trail.
  update public.wf_performance_assignments set due_at=revised,exception_reason=p_payload->>'reason',exception_by=p_actor,exception_at=now() where task_id=p_task and employee_id=target;
  perform set_config('workforce.performance_exception',p_task::text,true);
  update public.wf_tasks set due_at=greatest(due_at,revised),updated_by=p_actor where id=p_task;
  perform set_config('workforce.performance_exception','',true);
 elsif p_command='contribute' then
  if item.configured_at is null or item.due_at is null or task.blocked_reason<>'' or exists(select 1 from public.wf_task_columns where id=task.column_id and kind in ('done','review')) then raise exception 'المهمة غير جاهزة لتسليم المساهمة' using errcode='PT409';end if;
  if length(btrim(coalesce(p_payload->>'summary','')))<3 or length(p_payload->>'summary')>10000 then raise exception 'أدخل ملخص مساهمتك' using errcode='PT400';end if;
  select count(*)+1 into cycle from public.wf_task_submissions where task_id=p_task;
  select revision_due_at into effective_due from public.wf_task_submissions where task_id=p_task and status='changes' and target=any(review_employee_ids) order by submission_number desc limit 1;
  insert into public.wf_performance_deliveries(task_id,employee_id,round,due_at,summary) values(p_task,target,cycle,greatest(item.due_at,effective_due),p_payload->>'summary') on conflict do nothing;
 else raise exception 'إجراء غير صحيح' using errcode='PT400';end if;
 return workforce_private.save_command(p_actor,p_key,'performance:'||p_command,p_task,p_payload,jsonb_build_object('id',p_task,'saved',true));
end $$;

create function workforce_private.performance_submission() returns trigger language plpgsql security definer set search_path='' as $$
declare employee uuid; item public.wf_performance_assignments; effective_due timestamptz; cycle integer;
begin
 select count(*) into cycle from public.wf_task_submissions where task_id=new.task_id and submission_number<=new.submission_number;
 if tg_op='INSERT' then
  select id into employee from public.wf_employees where user_id=new.submitted_by;
  select * into item from public.wf_performance_assignments where task_id=new.task_id and employee_id=employee and configured_at is not null and not withdrawn;
  if found then
   select revision_due_at into effective_due from public.wf_task_submissions where task_id=new.task_id and status='changes' and employee=any(review_employee_ids) order by submission_number desc limit 1;
   insert into public.wf_performance_deliveries(task_id,employee_id,round,due_at,summary) values(new.task_id,employee,cycle,greatest(item.due_at,effective_due),new.summary) on conflict do nothing;
  end if;
  -- Shared evaluated work needs an explicit personal delivery from every participant.
  if exists(select 1 from public.wf_tasks t where t.id=new.task_id and cardinality(t.co_assignee_ids)>0 and not exists(select 1 from unnest(array_remove(array[t.assignee_id]||t.co_assignee_ids,null)) e where not exists(select 1 from public.wf_performance_assignments a where a.task_id=t.id and a.employee_id=e and a.configured_at is not null and not a.withdrawn))) and exists(select 1 from public.wf_performance_assignments a where a.task_id=new.task_id and a.configured_at is not null and not a.withdrawn and not exists(select 1 from public.wf_performance_deliveries d where d.task_id=a.task_id and d.employee_id=a.employee_id and d.round=cycle)) then raise exception 'على كل مكلفة تسليم مساهمتها أولًا' using errcode='PT409';end if;
 elsif old.status='pending' and new.status in ('approved','changes') then
  update public.wf_performance_deliveries set status=new.status,category=case when new.status='approved' or new.review_category is null or new.review_employee_ids is null then null when employee_id=any(new.review_employee_ids) then new.review_category else 'scope_change' end,incomplete=new.review_incomplete and employee_id=any(new.review_employee_ids),affected=coalesce(employee_id=any(new.review_employee_ids),false),decided_at=new.decided_at,revision_due_at=case when employee_id=any(new.review_employee_ids) then new.revision_due_at else null end where task_id=new.task_id and round=cycle;
  -- A colleague's return does not force an unaffected employee to repeat her contribution.
  if new.status='changes' and new.review_employee_ids is not null then
   insert into public.wf_performance_deliveries(task_id,employee_id,round,delivered_at,due_at,summary)
   select task_id,employee_id,round+1,delivered_at,due_at,summary from public.wf_performance_deliveries where task_id=new.task_id and round=cycle and not affected on conflict do nothing;
  end if;
 end if;
 return new;
end $$;
create trigger wf_performance_submission after insert or update of status on public.wf_task_submissions for each row execute function workforce_private.performance_submission();

-- Keep the existing task transaction (CAS, review authorization, test guard and notices).
create function public.wf_evaluated_task_command(p_actor uuid,p_id uuid,p_version integer,p_command text,p_payload jsonb,p_key uuid,p_run uuid default null) returns jsonb language plpgsql set search_path='' as $$
declare employee uuid; task public.wf_tasks; submission public.wf_task_submissions; category text; affected uuid[]; deadline timestamptz; incomplete boolean; stripped jsonb;
begin
 employee:=workforce_private.assert_task_actor(p_actor);
 if p_command<>'review' then raise exception 'إجراء غير صحيح' using errcode='PT400';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_actor::text||p_key::text,0));
 if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('decision','reason','category','revision_due_at','affected_employee_ids','incomplete')) then raise exception 'حقول غير مسموحة' using errcode='PT400';end if;
 category:=p_payload->>'category';deadline:=nullif(p_payload->>'revision_due_at','')::timestamptz;incomplete:=coalesce((p_payload->>'incomplete')::boolean,false);
 affected:=array(select distinct x::uuid from jsonb_array_elements_text(coalesce(p_payload->'affected_employee_ids','[]')) x order by x::uuid);
 perform 1 from public.wf_boards b join public.wf_tasks t on t.board_id=b.id where t.id=p_id for update of b;
 select * into task from public.wf_tasks where id=p_id for update;
 if employee is not null and (not workforce_private.can_manage_tasks(p_actor) or employee=any(array_remove(array[task.assignee_id]||task.co_assignee_ids,null))) then raise exception 'لا يمكنك مراجعة مهمتك' using errcode='42501';end if;
 select * into submission from public.wf_task_submissions where review_command_key=p_key;
 if found then
  if submission.task_id<>p_id or submission.review_category is distinct from category or submission.revision_due_at is distinct from deadline or submission.review_employee_ids is distinct from affected or submission.review_incomplete<>incomplete then raise exception 'مفتاح الإجراء مستخدم لقرار آخر' using errcode='PT409';end if;
 else
  if task.version is distinct from p_version then raise exception 'تغيرت المهمة؛ حدّث البيانات' using errcode='PT409';end if;
  if p_payload->>'decision'='changes' then
   if coalesce(category,'') not in ('requirements','improvement','scope_change') or deadline is null or deadline<=now() or (cardinality(affected)=0 and cardinality(array_remove(array[task.assignee_id]||task.co_assignee_ids,null))>0) or exists(select 1 from unnest(affected) e where not(e=any(array_remove(array[task.assignee_id]||task.co_assignee_ids,null)))) or (incomplete and category<>'requirements') then raise exception 'حدد نوع الإرجاع والمكلفة وموعد إعادة التسليم' using errcode='PT400';end if;
  elsif category is not null or deadline is not null or cardinality(affected)>0 or incomplete then raise exception 'حقول الإرجاع لا تستخدم للاعتماد' using errcode='PT400';end if;
  update public.wf_task_submissions set review_category=category,revision_due_at=deadline,review_incomplete=incomplete,review_employee_ids=affected,review_command_key=p_key where task_id=p_id and status='pending';
 end if;
 stripped:=jsonb_build_object('decision',p_payload->>'decision','reason',p_payload->>'reason');
 if p_run is not null then return public.wf_test_task_command(p_run,p_actor,p_id,p_version,p_command,stripped,p_key);end if;
 return public.wf_task_command(p_actor,p_id,p_version,p_command,stripped,p_key);
end $$;
revoke all on function workforce_private.performance_members(),workforce_private.performance_submission() from public,anon,authenticated;
revoke all on function public.wf_performance_command(uuid,uuid,integer,text,jsonb,uuid),public.wf_evaluated_task_command(uuid,uuid,integer,text,jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function public.wf_performance_command(uuid,uuid,integer,text,jsonb,uuid),public.wf_evaluated_task_command(uuid,uuid,integer,text,jsonb,uuid,uuid) to service_role;

-- One task update, one state notice: return deadlines also reach lists/reminders.
create function workforce_private.performance_revision_deadline() returns trigger language plpgsql security definer set search_path='' as $$
declare deadline timestamptz;
begin
 if new.column_id is distinct from old.column_id and exists(select 1 from public.wf_task_columns where id=old.column_id and kind='review') and exists(select 1 from public.wf_task_columns where id=new.column_id and kind='changes') then
  select revision_due_at into deadline from public.wf_task_submissions where task_id=new.id and status='changes' order by submission_number desc limit 1;
  if deadline is not null then new.due_at:=deadline;end if;
 end if;
 return new;
end $$;
revoke all on function workforce_private.performance_revision_deadline() from public,anon,authenticated;
create trigger wf_01_performance_revision_deadline before update of column_id on public.wf_tasks for each row execute function workforce_private.performance_revision_deadline();
