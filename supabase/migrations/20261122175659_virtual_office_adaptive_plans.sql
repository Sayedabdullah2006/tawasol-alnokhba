-- Existing sessions keep their approved legacy route; new callers opt into adaptive planning.
alter table public.vo_sessions add column workflow text not null default 'legacy' check (workflow in ('legacy','adaptive'));
alter table public.vo_sessions add column plan jsonb;
alter table public.vo_sessions add column plan_version integer not null default 0 check (plan_version>=0);
alter table public.vo_sessions add column approved_plan_version integer not null default 0 check (approved_plan_version>=0 and approved_plan_version<=plan_version);
alter table public.vo_sessions drop constraint vo_sessions_status_check;
alter table public.vo_sessions add constraint vo_sessions_status_check check (status in ('queued','running','plan_review','handoff','review','completed','failed','cancelled'));

create function public.vo_valid_plan(p jsonb) returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare item jsonb; field text; roles text[] := '{}';
begin
  if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p->'summary') is distinct from 'string'
    or char_length(trim(p->>'summary')) not between 3 and 600
    or jsonb_typeof(p->'steps') is distinct from 'array' or jsonb_typeof(p->'excluded') is distinct from 'array' then return false; end if;
  if jsonb_array_length(p->'steps')>5 or jsonb_array_length(p->'excluded')>5 or p-array['summary','steps','excluded']<>'{}'::jsonb then return false; end if;
  for item in select value from jsonb_array_elements((p->'steps')||(p->'excluded')) loop
    if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'agentId') is distinct from 'string'
      or (item->>'agentId') not in ('researcher','writer','art','reviewer','publisher')
      or item->>'agentId'=any(roles) or jsonb_typeof(item->'reason') is distinct from 'string'
      or char_length(trim(item->>'reason')) not between 3 and 300 then return false; end if;
    roles:=array_append(roles,item->>'agentId');
  end loop;
  if cardinality(roles)<>5 then return false; end if;
  for item in select value from jsonb_array_elements(p->'steps') loop
    foreach field in array array['instruction','deliverable'] loop
      if jsonb_typeof(item->field) is distinct from 'string' or char_length(trim(item->>field)) not between 3 and (case when field='instruction' then 1600 else 600 end) then return false; end if;
    end loop;
    if item-array['agentId','reason','instruction','deliverable']<>'{}'::jsonb then return false; end if;
  end loop;
  for item in select value from jsonb_array_elements(p->'excluded') loop
    if item-array['agentId','reason']<>'{}'::jsonb then return false; end if;
  end loop;
  return true;
end $$;
alter table public.vo_sessions add constraint vo_sessions_plan_valid check (plan is null or public.vo_valid_plan(plan));

create function public.vo_steps(p_kind text,p_agent text,p_workflow text,p_plan jsonb) returns text[] language sql immutable security invoker set search_path='' as $$
 select case when p_workflow='adaptive' then case when p_plan is null then array['editor'] else array['editor']||array(select value->>'agentId' from jsonb_array_elements(p_plan->'steps'))||array['editor'] end
 when p_kind in ('team','meeting') then array['editor','researcher','writer','art','reviewer','publisher','editor'] else array[p_agent] end;
$$;

create or replace function public.vo_submit(p_workspace text,p_actor uuid,p_request uuid,p_agent text,p_kind text,p_brief text,p_context jsonb)
returns public.vo_sessions language plpgsql security invoker set search_path='' as $$
declare v public.vo_sessions;
begin
 perform pg_advisory_xact_lock(hashtext('vo-submit:'||p_workspace));
 select * into v from public.vo_sessions where created_by=p_actor and request_id=p_request;
 if found then
  if v.agent_id<>p_agent or v.kind<>p_kind or v.brief<>p_brief or v.context<>p_context then raise exception using errcode='PT409',message='معرف الطلب مستخدم لطلب مختلف'; end if;
  return v;
 end if;
 if (select count(*) from public.vo_sessions where workspace_id=p_workspace and status in ('queued','running'))>=20 then raise exception using errcode='PT409',message='قائمة الانتظار ممتلئة'; end if;
 insert into public.vo_sessions(workspace_id,created_by,request_id,agent_id,kind,title,brief,context,workflow)
 values(p_workspace,p_actor,p_request,p_agent,p_kind,left(p_brief,80),p_brief,p_context,
  case when p_kind in ('team','meeting') and p_context->>'workflow'='adaptive-v1' then 'adaptive' else 'legacy' end) returning * into v;
 insert into public.vo_messages(session_id,message_key,kind,content) values(v.id,'initial','user',p_brief);
 return v;
end $$;

create function public.vo_claim_next(p_workspace text,p_adaptive boolean) returns setof public.vo_sessions language plpgsql security invoker set search_path='' as $$
declare v_id uuid;
begin
 perform pg_advisory_xact_lock(hashtext('vo-worker:'||p_workspace));
 if exists(select 1 from public.vo_sessions where workspace_id=p_workspace and status='running' and lease_until>now()) then return; end if;
 select id into v_id from public.vo_sessions where workspace_id=p_workspace
  and (status='queued' or (status='running' and lease_until<=now())) and (p_adaptive or workflow='legacy')
  and (case when workflow='adaptive' then (step=0 and plan is null) or (plan is not null and approved_plan_version=plan_version and step<=approved_step)
    else kind not in ('team','meeting') or step<=approved_step end)
  order by case when status='running' then 0 else 1 end,created_at for update skip locked limit 1;
 if v_id is null then return; end if;
 return query update public.vo_sessions set status='running',lease_token=gen_random_uuid(),lease_until=now()+interval '150 seconds',updated_at=now(),progress='جاري تجهيز سياق المهمة' where id=v_id returning *;
end $$;
-- Old deployments may overlap the rollout: they can never claim adaptive sessions.
create or replace function public.vo_claim(p_workspace text) returns setof public.vo_sessions language sql security invoker set search_path='' as $$ select * from public.vo_claim_next(p_workspace,false); $$;
create function public.vo_claim_v3(p_workspace text) returns setof public.vo_sessions language sql security invoker set search_path='' as $$ select * from public.vo_claim_next(p_workspace,true); $$;

create function public.vo_save_plan(p_id uuid,p_lease uuid,p_plan jsonb,p_text text,p_input integer,p_output integer) returns boolean language plpgsql security invoker set search_path='' as $$
declare v public.vo_sessions;
begin
 select * into v from public.vo_sessions where id=p_id for update;
 if not found or v.status<>'running' or v.lease_token is distinct from p_lease or v.lease_until<=now() then return false; end if;
 if v.workflow<>'adaptive' or v.step<>0 or v.plan is not null or not public.vo_valid_plan(p_plan) or char_length(p_text) not between 3 and 20000 then raise exception using errcode='PT400',message='خطة الفريق غير صالحة'; end if;
 insert into public.vo_messages(session_id,message_key,agent_id,kind,content) values(p_id,'answer:'||v.revision||':0','editor','assistant',p_text);
 update public.vo_sessions set plan=p_plan,plan_version=plan_version+1,approved_plan_version=0,step=1,approved_step=0,status='plan_review',
  progress='الخطة جاهزة؛ راجع التخصصات والتسليمات قبل بدء التنفيذ',lease_token=null,lease_until=null,
  input_tokens=input_tokens+greatest(p_input,0),output_tokens=output_tokens+greatest(p_output,0),updated_at=now() where id=p_id;
 return true;
end $$;

create or replace function public.vo_finish_step(p_id uuid,p_lease uuid,p_agent text,p_content text,p_citations jsonb,p_input integer,p_output integer,p_total integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v public.vo_sessions; route text[]; total integer;
begin
 select * into v from public.vo_sessions where id=p_id for update;
 if not found or v.status<>'running' or v.lease_token is distinct from p_lease or v.lease_until<=now() then return false; end if;
 route:=public.vo_steps(v.kind,v.agent_id,v.workflow,v.plan); total:=cardinality(route);
 if p_total<>total or p_agent is distinct from route[v.step+1] or (v.workflow='adaptive' and (v.step=0 or v.approved_plan_version<>v.plan_version or v.plan is null)) then raise exception using errcode='PT409',message='المهمة لا تطابق الخطة المعتمدة'; end if;
 insert into public.vo_messages(session_id,message_key,agent_id,kind,content,citations) values(p_id,'answer:'||v.revision||':'||v.step,p_agent,'assistant',p_content,p_citations);
 update public.vo_sessions set step=step+1,status=case when step+1>=total then 'review' when kind in ('team','meeting') then 'handoff' else 'queued' end,
  progress=case when step+1>=total then 'اكتمل التسليم؛ راجعه واعتمده' else 'التسليم جاهز؛ بانتظار موافقة مدير التحرير' end,
  input_tokens=input_tokens+greatest(p_input,0),output_tokens=output_tokens+greatest(p_output,0),lease_token=null,lease_until=null,updated_at=now() where id=p_id;
 return true;
end $$;

create or replace function public.vo_session_action(p_workspace text,p_id uuid,p_action text,p_request uuid,p_content text default '')
returns public.vo_sessions language plpgsql security invoker set search_path='' as $$
declare v public.vo_sessions; payload jsonb;
begin
 select * into v from public.vo_sessions where id=p_id and workspace_id=p_workspace for update;
 if not found then raise exception using errcode='P0002',message='السجل غير متاح'; end if;
 if exists(select 1 from public.vo_messages where session_id=p_id and message_key=p_request::text) then return v; end if;
 if p_action in ('approve_plan','revise_plan') or (p_action='approve_handoff' and v.workflow='adaptive') then
  begin payload:=p_content::jsonb; exception when invalid_text_representation then raise exception using errcode='PT400',message='الموافقة غير صالحة'; end;
  if v.workflow<>'adaptive' or (payload->>'planVersion') is distinct from v.plan_version::text then raise exception using errcode='PT409',message='تغيرت الخطة؛ راجع النسخة الحالية قبل الموافقة'; end if;
 end if;
 if p_action='reply' then
  if v.status not in ('review','completed','failed') then raise exception using errcode='PT409',message='انتظر انتهاء التنفيذ قبل المتابعة'; end if;
  if char_length(trim(p_content)) not between 3 and 12000 then raise exception using errcode='PT400',message='اكتب رسالة من ٣ إلى ١٢٠٠٠ حرف'; end if;
  update public.vo_sessions set brief=p_content,status='queued',step=0,approved_step=0,plan=null,approved_plan_version=0,revision=revision+1,error_message=null,progress='تم استلام المتابعة',updated_at=now() where id=p_id returning * into v;
  insert into public.vo_messages(session_id,message_key,kind,content) values(p_id,p_request::text,'user',p_content); return v;
 elsif p_action='revise_plan' and v.status='plan_review' then
  if jsonb_typeof(payload->'notes') is distinct from 'string' or char_length(trim(payload->>'notes')) not between 3 and 4000 then raise exception using errcode='PT400',message='وضح تعديل الخطة من ٣ إلى ٤٠٠٠ حرف'; end if;
  update public.vo_sessions set status='queued',step=0,approved_step=0,plan=null,approved_plan_version=0,revision=revision+1,error_message=null,progress='مدير التحرير يعيد إعداد الخطة وفق ملاحظاتك',updated_at=now() where id=p_id returning * into v;
  insert into public.vo_messages(session_id,message_key,kind,content) values(p_id,p_request::text,'user','تعديل الخطة: '||(payload->>'notes')); return v;
 elsif p_action='approve_plan' and v.status='plan_review' and v.step=1 and v.plan is not null then
  if (select count(*) from public.vo_sessions where workspace_id=p_workspace and status in ('queued','running'))>=20 then raise exception using errcode='PT409',message='قائمة الانتظار ممتلئة'; end if;
  update public.vo_sessions set status='queued',approved_plan_version=plan_version,approved_step=1,progress='اعتمدت الإدارة الخطة؛ أُسندت أول مرحلة مختارة',updated_at=now() where id=p_id returning * into v;
 elsif p_action='approve_handoff' and v.status='handoff' and v.kind in ('team','meeting') then
  if (case when v.workflow='adaptive' then payload->>'step' else p_content end) is distinct from v.step::text then raise exception using errcode='PT409',message='تغيرت المرحلة؛ راجع التسليم الحالي قبل الموافقة'; end if;
  if v.workflow='adaptive' and (v.plan is null or v.approved_plan_version<>v.plan_version) then raise exception using errcode='PT409',message='الخطة غير معتمدة'; end if;
  if (select count(*) from public.vo_sessions where workspace_id=p_workspace and status in ('queued','running'))>=20 then raise exception using errcode='PT409',message='قائمة الانتظار ممتلئة'; end if;
  update public.vo_sessions set status='queued',approved_step=step,progress='وافق مدير التحرير؛ أُسندت المرحلة التالية',updated_at=now() where id=p_id returning * into v;
 elsif p_action='cancel' and v.status in ('queued','running','handoff','plan_review') then
  update public.vo_sessions set status='cancelled',progress='أُلغي التكليف',lease_token=null,lease_until=null,updated_at=now() where id=p_id returning * into v;
 elsif p_action='approve' and v.status='review' then
  update public.vo_sessions set status='completed',progress='اعتمدت الإدارة التسليم',updated_at=now() where id=p_id returning * into v;
 elsif p_action='retry' and v.status in ('failed','cancelled') then
  update public.vo_sessions set status=case when workflow='adaptive' and plan is not null and approved_plan_version<>plan_version then 'plan_review' when kind in ('team','meeting') and step>approved_step then 'handoff' else 'queued' end,
   error_message=null,progress='أُعيد التكليف مع حفظ الموافقات السابقة',updated_at=now() where id=p_id returning * into v;
 else raise exception using errcode='PT409',message='تغيرت حالة المهمة؛ حدّث الصفحة'; end if;
 insert into public.vo_messages(session_id,message_key,kind,content) values(p_id,p_request::text,'event',v.progress);
 return v;
end $$;
revoke all on function public.vo_valid_plan(jsonb),public.vo_steps(text,text,text,jsonb),public.vo_claim_next(text,boolean),public.vo_claim_v3(text),public.vo_save_plan(uuid,uuid,jsonb,text,integer,integer) from public,anon,authenticated;
grant execute on function public.vo_valid_plan(jsonb),public.vo_steps(text,text,text,jsonb),public.vo_claim_next(text,boolean),public.vo_claim_v3(text),public.vo_save_plan(uuid,uuid,jsonb,text,integer,integer) to service_role;
