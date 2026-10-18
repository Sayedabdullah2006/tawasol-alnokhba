-- Explicit membership cannot fall through SQL NULL semantics.
create or replace function public.wf_test_run(p_action text,p_actor uuid,p_run uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r workforce_private.test_runs; actor_role text;
begin
 select role into actor_role from public.profiles where id=p_actor;
 if actor_role is null or not coalesce(workforce_private.task_actor_unbanned(p_actor),false) or actor_role not in ('admin','employee') or
 (actor_role='employee' and not exists(select 1 from public.wf_employees where user_id=p_actor and status='active')) then raise insufficient_privilege; end if;
 if p_action='start' then
  if actor_role<>'admin' then raise insufficient_privilege; end if;
  insert into workforce_private.test_runs(created_by,participants)
  values(p_actor,array(select user_id from public.wf_employees where status='active' and user_id is not null)||array[p_actor]) returning * into r;
 else
  select * into r from workforce_private.test_runs where id=p_run;
  if r.id is null or not(coalesce(p_actor=any(r.participants),false) or actor_role='admin') then raise insufficient_privilege; end if;
  if p_action='finish' then
   if actor_role<>'admin' then raise insufficient_privilege; end if;
   update workforce_private.test_runs set ended_at=coalesce(ended_at,now()) where id=r.id returning * into r;
  elsif p_action in ('join','assert') then
   if r.ended_at is not null or r.expires_at<=now() then raise sqlstate 'PT409' using message='انتهت جولة الاختبار. اخرج من وضع الاختبار أو ابدأ جولة جديدة.'; end if;
  elsif p_action<>'status' then raise sqlstate 'PT400' using message='إجراء اختبار غير صحيح'; end if;
 end if;
 return jsonb_build_object('id',r.id,'active',r.ended_at is null and r.expires_at>now(),'expires_at',r.expires_at);
end $$;
