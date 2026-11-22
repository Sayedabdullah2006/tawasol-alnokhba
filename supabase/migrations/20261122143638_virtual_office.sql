-- Independent office records: host identity is bound by the server adapter.
create table public.vo_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null default 'nukhba',
  created_by uuid not null references public.profiles(id),
  request_id uuid not null,
  agent_id text not null check (agent_id in ('editor','researcher','writer','art','reviewer','publisher')),
  kind text not null check (kind in ('chat','task','team','meeting')),
  title text not null check (char_length(title) between 1 and 100),
  brief text not null check (char_length(brief) between 3 and 12000),
  context jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','running','review','completed','failed','cancelled')),
  step integer not null default 0 check (step between 0 and 7),
  revision integer not null default 0,
  progress text not null default 'بانتظار بدء التنفيذ',
  error_message text,
  lease_token uuid,
  lease_until timestamptz,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by, request_id)
);
create index vo_sessions_queue_idx on public.vo_sessions(workspace_id, status, created_at);
create index vo_sessions_recent_idx on public.vo_sessions(workspace_id, updated_at desc);
create index vo_sessions_created_by_idx on public.vo_sessions(created_by);
create table public.vo_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.vo_sessions(id) on delete cascade,
  message_key text not null,
  agent_id text check (agent_id in ('editor','researcher','writer','art','reviewer','publisher')),
  kind text not null check (kind in ('user','assistant','event')),
  content text not null,
  citations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique(session_id, message_key)
);
create index vo_messages_session_idx on public.vo_messages(session_id, created_at);
create table public.vo_memories (
  workspace_id text not null default 'nukhba',
  agent_id text not null check (agent_id in ('editor','researcher','writer','art','reviewer','publisher')),
  content text not null check (char_length(content) <= 8000),
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  primary key(workspace_id, agent_id)
);
create index vo_memories_updated_by_idx on public.vo_memories(updated_by);
alter table public.vo_sessions enable row level security;
alter table public.vo_messages enable row level security;
alter table public.vo_memories enable row level security;
revoke all on public.vo_sessions, public.vo_messages, public.vo_memories from anon, authenticated;
grant select on public.vo_sessions, public.vo_messages, public.vo_memories to authenticated;
grant all on public.vo_sessions, public.vo_messages, public.vo_memories to service_role;
create policy vo_admin_read_sessions on public.vo_sessions for select to authenticated
  using (exists(select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));
create policy vo_admin_read_messages on public.vo_messages for select to authenticated
  using (exists(select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));
create policy vo_admin_read_memories on public.vo_memories for select to authenticated
  using (exists(select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));

-- Service-only commands. HTTP adapters must independently authorize the host actor.
create function public.vo_submit(p_workspace text, p_actor uuid, p_request uuid, p_agent text, p_kind text, p_brief text, p_context jsonb)
returns public.vo_sessions language plpgsql security invoker set search_path = '' as $$
declare v public.vo_sessions;
begin
  perform pg_advisory_xact_lock(hashtext('vo-submit:' || p_workspace));
  select * into v from public.vo_sessions where created_by=p_actor and request_id=p_request;
  if found then
    if v.agent_id<>p_agent or v.kind<>p_kind or v.brief<>p_brief or v.context<>p_context then
      raise exception using errcode='PT409', message='معرف الطلب مستخدم لطلب مختلف';
    end if;
    return v;
  end if;
  if (select count(*) from public.vo_sessions where workspace_id=p_workspace and status in ('queued','running')) >= 20 then
    raise exception using errcode='PT409', message='قائمة الانتظار ممتلئة؛ انتظر اكتمال بعض المهام';
  end if;
  insert into public.vo_sessions(workspace_id,created_by,request_id,agent_id,kind,title,brief,context)
    values(p_workspace,p_actor,p_request,p_agent,p_kind,left(p_brief,80),p_brief,p_context) returning * into v;
  insert into public.vo_messages(session_id,message_key,kind,content) values(v.id,'initial','user',p_brief);
  return v;
end $$;

create function public.vo_claim(p_workspace text)
returns setof public.vo_sessions language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('vo-worker:' || p_workspace));
  -- One live execution per office. A lease survives refresh and recovers after restart.
  if exists(select 1 from public.vo_sessions where workspace_id=p_workspace and status='running' and lease_until>now()) then return; end if;
  select id into v_id from public.vo_sessions
    where workspace_id=p_workspace and (status='queued' or (status='running' and lease_until<=now()))
    order by case when status='running' then 0 else 1 end, created_at for update skip locked limit 1;
  if v_id is null then return; end if;
  return query update public.vo_sessions set status='running', lease_token=gen_random_uuid(),
    lease_until=now()+interval '150 seconds', updated_at=now(), progress='جاري تجهيز سياق المهمة'
    where id=v_id returning *;
end $$;

create function public.vo_finish_step(p_id uuid,p_lease uuid,p_agent text,p_content text,p_citations jsonb,p_input integer,p_output integer,p_total integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v public.vo_sessions;
begin
  select * into v from public.vo_sessions where id=p_id for update;
  if v.status<>'running' or v.lease_token is distinct from p_lease or v.lease_until<=now() then return false; end if;
  insert into public.vo_messages(session_id,message_key,agent_id,kind,content,citations)
    values(p_id,'answer:'||v.revision||':'||v.step,p_agent,'assistant',p_content,p_citations);
  update public.vo_sessions set step=step+1,
    status=case when step+1>=p_total then 'review' else 'queued' end,
    progress=case when step+1>=p_total then 'اكتمل التسليم؛ راجعه واعتمده' else 'تم تسليم المرحلة؛ بانتظار الدور التالي' end,
    input_tokens=input_tokens+greatest(p_input,0),output_tokens=output_tokens+greatest(p_output,0),
    lease_token=null,lease_until=null,updated_at=now() where id=p_id;
  return true;
end $$;

create function public.vo_session_action(p_workspace text,p_id uuid,p_action text,p_request uuid,p_content text default '')
returns public.vo_sessions language plpgsql security invoker set search_path = '' as $$
declare v public.vo_sessions;
begin
  select * into v from public.vo_sessions where id=p_id and workspace_id=p_workspace for update;
  if not found then raise exception using errcode='P0002',message='السجل غير متاح'; end if;
  if exists(select 1 from public.vo_messages where session_id=p_id and message_key=p_request::text) then return v; end if;
  if p_action='reply' then
    if v.status not in ('review','completed','failed') then raise exception using errcode='PT409',message='انتظر انتهاء التنفيذ قبل المتابعة'; end if;
    if char_length(trim(p_content)) not between 3 and 12000 then raise exception using errcode='PT400',message='اكتب رسالة من ٣ إلى ١٢٠٠٠ حرف'; end if;
    update public.vo_sessions set brief=p_content,status='queued',step=0,revision=revision+1,error_message=null,
      progress='تم استلام المتابعة',updated_at=now() where id=p_id returning * into v;
    insert into public.vo_messages(session_id,message_key,kind,content) values(p_id,p_request::text,'user',p_content);
    return v;
  elsif p_action='cancel' and v.status in ('queued','running') then
    update public.vo_sessions set status='cancelled',progress='أُلغي التكليف',lease_token=null,lease_until=null,updated_at=now() where id=p_id returning * into v;
  elsif p_action='approve' and v.status='review' then
    update public.vo_sessions set status='completed',progress='اعتمدت الإدارة التسليم',updated_at=now() where id=p_id returning * into v;
  elsif p_action='retry' and v.status in ('failed','cancelled') then
    update public.vo_sessions set status='queued',error_message=null,progress='بانتظار إعادة المحاولة',updated_at=now() where id=p_id returning * into v;
  else raise exception using errcode='PT409',message='تغيرت حالة المهمة؛ حدّث الصفحة';
  end if;
  insert into public.vo_messages(session_id,message_key,kind,content) values(p_id,p_request::text,'event',v.progress);
  return v;
end $$;
revoke all on function public.vo_submit(text,uuid,uuid,text,text,text,jsonb), public.vo_claim(text),
 public.vo_finish_step(uuid,uuid,text,text,jsonb,integer,integer,integer), public.vo_session_action(text,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.vo_submit(text,uuid,uuid,text,text,text,jsonb), public.vo_claim(text),
 public.vo_finish_step(uuid,uuid,text,text,jsonb,integer,integer,integer), public.vo_session_action(text,uuid,text,uuid,text) to service_role;
