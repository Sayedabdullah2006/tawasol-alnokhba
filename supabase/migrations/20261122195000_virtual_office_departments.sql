-- Each department has an independent workspace, memory and durable approval queue.
-- Stable role-seat IDs preserve old editorial sessions without rewriting any record.
create function public.vo_claim_departments(p_workspaces text[])
returns setof public.vo_sessions language plpgsql security invoker set search_path='' as $$
declare scope text;
begin
 if p_workspaces is null or cardinality(p_workspaces) not between 1 and 8 then
  raise exception using errcode='PT400',message='قائمة الإدارات غير صالحة';
 end if;
 foreach scope in array p_workspaces loop
  if scope is null or char_length(scope) not between 1 and 200 then
   raise exception using errcode='PT400',message='مساحة الإدارة غير صالحة';
  end if;
  return query select * from public.vo_claim_v3(scope);
  if found then return; end if;
 end loop;
end $$;
revoke all on function public.vo_claim_departments(text[]) from public,anon,authenticated;
grant execute on function public.vo_claim_departments(text[]) to service_role;

-- Only system-authored progress labels change; approvals, lease fences and histories stay intact.
do $$ declare target regprocedure; definition text; begin
 foreach target in array array[
  'public.vo_save_plan(uuid,uuid,jsonb,text,integer,integer)'::regprocedure,
  'public.vo_finish_step(uuid,uuid,text,text,jsonb,integer,integer,integer)'::regprocedure,
  'public.vo_session_action(text,uuid,text,uuid,text)'::regprocedure
 ] loop
  definition:=replace(pg_get_functiondef(target),'مدير التحرير','مدير الإدارة');
  execute definition;
 end loop;
end $$;
