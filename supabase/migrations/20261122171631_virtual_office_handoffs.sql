-- Approval is durable server state, not a pause implemented only by the browser.
alter table public.vo_sessions drop constraint vo_sessions_status_check;
alter table public.vo_sessions add constraint vo_sessions_status_check
  check (status in ('queued','running','handoff','review','completed','failed','cancelled'));
alter table public.vo_sessions add column approved_step integer not null default 0 check (approved_step between 0 and 7);
-- Preserve an already-running call; all not-yet-started handoffs now require approval.
update public.vo_sessions set approved_step=step where status='running';
update public.vo_sessions set status='handoff', progress='التسليم جاهز؛ بانتظار موافقة مدير التحرير',updated_at=now()
 where kind in ('team','meeting') and step>0 and status='queued';

create or replace function public.vo_claim(p_workspace text)
returns setof public.vo_sessions language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('vo-worker:' || p_workspace));
  if exists(select 1 from public.vo_sessions where workspace_id=p_workspace and status='running' and lease_until>now()) then return; end if;
  select id into v_id from public.vo_sessions
    where workspace_id=p_workspace and (status='queued' or (status='running' and lease_until<=now()))
      and (kind not in ('team','meeting') or step<=approved_step)
    order by case when status='running' then 0 else 1 end, created_at for update skip locked limit 1;
  if v_id is null then return; end if;
  return query update public.vo_sessions set status='running', lease_token=gen_random_uuid(),
    lease_until=now()+interval '150 seconds', updated_at=now(), progress='جاري تجهيز سياق المهمة'
    where id=v_id returning *;
end $$;

create or replace function public.vo_finish_step(p_id uuid,p_lease uuid,p_agent text,p_content text,p_citations jsonb,p_input integer,p_output integer,p_total integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v public.vo_sessions;
begin
  select * into v from public.vo_sessions where id=p_id for update;
  if not found or v.status<>'running' or v.lease_token is distinct from p_lease or v.lease_until<=now() then return false; end if;
  insert into public.vo_messages(session_id,message_key,agent_id,kind,content,citations)
    values(p_id,'answer:'||v.revision||':'||v.step,p_agent,'assistant',p_content,p_citations);
  update public.vo_sessions set step=step+1,
    status=case when step+1>=p_total then 'review' when kind in ('team','meeting') then 'handoff' else 'queued' end,
    progress=case when step+1>=p_total then 'اكتمل التسليم؛ راجعه واعتمده' else 'التسليم جاهز؛ بانتظار موافقة مدير التحرير' end,
    input_tokens=input_tokens+greatest(p_input,0),output_tokens=output_tokens+greatest(p_output,0),
    lease_token=null,lease_until=null,updated_at=now() where id=p_id;
  return true;
end $$;

create or replace function public.vo_session_action(p_workspace text,p_id uuid,p_action text,p_request uuid,p_content text default '')
returns public.vo_sessions language plpgsql security invoker set search_path = '' as $$
declare v public.vo_sessions;
begin
  select * into v from public.vo_sessions where id=p_id and workspace_id=p_workspace for update;
  if not found then raise exception using errcode='P0002',message='السجل غير متاح'; end if;
  if exists(select 1 from public.vo_messages where session_id=p_id and message_key=p_request::text) then return v; end if;
  if p_action='reply' then
    if v.status not in ('review','completed','failed') then raise exception using errcode='PT409',message='انتظر انتهاء التنفيذ قبل المتابعة'; end if;
    if char_length(trim(p_content)) not between 3 and 12000 then raise exception using errcode='PT400',message='اكتب رسالة من ٣ إلى ١٢٠٠٠ حرف'; end if;
    update public.vo_sessions set brief=p_content,status='queued',step=0,approved_step=0,revision=revision+1,error_message=null,
      progress='تم استلام المتابعة',updated_at=now() where id=p_id returning * into v;
    insert into public.vo_messages(session_id,message_key,kind,content) values(p_id,p_request::text,'user',p_content);
    return v;
  elsif p_action='approve_handoff' and v.status='handoff' and v.kind in ('team','meeting') then
    if p_content<>v.step::text then raise exception using errcode='PT409',message='تغيرت المرحلة؛ راجع التسليم الحالي قبل الموافقة'; end if;
    if (select count(*) from public.vo_sessions where workspace_id=p_workspace and status in ('queued','running')) >= 20 then
      raise exception using errcode='PT409',message='قائمة الانتظار ممتلئة؛ انتظر قليلًا';
    end if;
    update public.vo_sessions set status='queued',approved_step=step,error_message=null,
      progress='وافق مدير التحرير؛ أُسندت المرحلة التالية',updated_at=now() where id=p_id returning * into v;
  elsif p_action='cancel' and v.status in ('queued','running','handoff') then
    update public.vo_sessions set status='cancelled',progress='أُلغي التكليف',lease_token=null,lease_until=null,updated_at=now() where id=p_id returning * into v;
  elsif p_action='approve' and v.status='review' then
    update public.vo_sessions set status='completed',progress='اعتمدت الإدارة التسليم',updated_at=now() where id=p_id returning * into v;
  elsif p_action='retry' and v.status in ('failed','cancelled') then
    update public.vo_sessions set status=case when kind in ('team','meeting') and step>approved_step then 'handoff' else 'queued' end,
      error_message=null,progress='أُعيد التكليف مع حفظ الموافقات السابقة',updated_at=now() where id=p_id returning * into v;
  else raise exception using errcode='PT409',message='تغيرت حالة المهمة؛ حدّث الصفحة';
  end if;
  insert into public.vo_messages(session_id,message_key,kind,content) values(p_id,p_request::text,'event',v.progress);
  return v;
end $$;
revoke all on function public.vo_claim(text), public.vo_finish_step(uuid,uuid,text,text,jsonb,integer,integer,integer),
  public.vo_session_action(text,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.vo_claim(text), public.vo_finish_step(uuid,uuid,text,text,jsonb,integer,integer,integer),
  public.vo_session_action(text,uuid,text,uuid,text) to service_role;
