-- M02 task data model. All client writes are denied; mutations use checked server RPCs.
create table public.wf_boards (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 2 and 150),
  description text not null default '' check (length(description)<=10000),
  allow_self_tasks boolean not null default true,
  custom_field_definitions jsonb not null default '[]' check (jsonb_typeof(custom_field_definitions)='array' and octet_length(custom_field_definitions::text)<=16000),
  archived_at timestamptz,
  version integer not null default 1 check(version>0),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.wf_board_members (
  board_id uuid not null references public.wf_boards(id) on delete restrict,
  employee_id uuid not null references public.wf_employees(id) on delete restrict,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key(board_id,employee_id)
);
create index wf_board_members_employee_idx on public.wf_board_members(employee_id,board_id);
create table public.wf_task_columns (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.wf_boards(id) on delete restrict,
  title text not null check(length(btrim(title)) between 1 and 100),
  kind text not null check(kind in ('new','in_progress','review','changes','done')),
  position integer not null default 0,
  archived_at timestamptz,
  unique(id,board_id)
);
create index wf_task_columns_board_idx on public.wf_task_columns(board_id,position,id);
create table public.wf_tasks (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.wf_boards(id) on delete restrict,
  column_id uuid not null,
  title text not null check(length(btrim(title)) between 2 and 250),
  description text not null default '' check(length(description)<=30000),
  completion_criteria text not null default '' check(length(completion_criteria)<=10000),
  assignee_id uuid references public.wf_employees(id) on delete restrict,
  created_by uuid not null references public.profiles(id),
  assignment_origin text not null check(assignment_origin in ('admin','self')),
  shared_with_board boolean not null default false,
  priority text not null default 'normal' check(priority in ('low','normal','high','urgent')),
  starts_at timestamptz,
  due_at timestamptz,
  estimate_minutes integer check(estimate_minutes between 0 and 525600),
  labels text[] not null default '{}',
  custom_fields jsonb not null default '{}' check(jsonb_typeof(custom_fields)='object' and octet_length(custom_fields::text)<=32000),
  requires_approval boolean not null default true,
  blocked_reason text not null default '' check(length(blocked_reason)<=2000),
  parent_id uuid,
  position bigint not null default 0,
  archived_at timestamptz,
  completed_at timestamptz,
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id),
  unique(id,board_id),
  foreign key(column_id,board_id) references public.wf_task_columns(id,board_id) on delete restrict,
  foreign key(parent_id,board_id) references public.wf_tasks(id,board_id) on delete restrict,
  check(parent_id is null or parent_id<>id),
  check(starts_at is null or due_at is null or due_at>=starts_at),
  check(cardinality(labels)<=20)
);
create index wf_tasks_board_column_idx on public.wf_tasks(board_id,column_id,position,id);
create index wf_tasks_assignee_due_idx on public.wf_tasks(assignee_id,due_at,id) where archived_at is null;
create index wf_tasks_creator_idx on public.wf_tasks(created_by,created_at desc);
create index wf_tasks_parent_idx on public.wf_tasks(parent_id);
create table public.wf_task_members (
  task_id uuid not null references public.wf_tasks(id) on delete restrict,
  employee_id uuid not null references public.wf_employees(id) on delete restrict,
  participation text not null check(participation in ('participant','watcher')),
  created_at timestamptz not null default now(),
  primary key(task_id,employee_id)
);
create index wf_task_members_employee_idx on public.wf_task_members(employee_id,task_id);
create table public.wf_task_checklist (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.wf_tasks(id) on delete restrict,
  title text not null check(length(btrim(title)) between 1 and 500),
  required boolean not null default true,
  completed boolean not null default false,
  position integer not null default 0,
  completed_by uuid references public.profiles(id),
  completed_at timestamptz,
  check(completed=(completed_at is not null) and completed=(completed_by is not null))
);
create index wf_task_checklist_task_idx on public.wf_task_checklist(task_id,position,id);
create table public.wf_task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.wf_tasks(id) on delete restrict,
  author_id uuid not null references public.profiles(id),
  body text not null check(length(btrim(body)) between 1 and 10000),
  mentioned_employee_ids uuid[] not null default '{}' check(cardinality(mentioned_employee_ids)<=30),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  archived_at timestamptz
);
create index wf_task_comments_task_idx on public.wf_task_comments(task_id,created_at desc,id);
create table public.wf_task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.wf_tasks(id) on delete restrict,
  title text not null check(length(btrim(title)) between 1 and 150),
  filename text not null check(length(filename)<=255),
  object_path text not null unique,
  mime_type text not null check(mime_type in ('application/pdf','image/png','image/jpeg')),
  size_bytes integer not null check(size_bytes between 1 and 10485760),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create index wf_task_attachments_task_idx on public.wf_task_attachments(task_id,created_at desc,id);
create table public.wf_task_dependencies (
  task_id uuid not null references public.wf_tasks(id) on delete restrict,
  depends_on_id uuid not null references public.wf_tasks(id) on delete restrict,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key(task_id,depends_on_id),
  check(task_id<>depends_on_id)
);
create index wf_task_dependencies_target_idx on public.wf_task_dependencies(depends_on_id,task_id);
create table public.wf_task_submissions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.wf_tasks(id) on delete restrict,
  submitted_by uuid not null references public.profiles(id),
  summary text not null check(length(btrim(summary)) between 3 and 10000),
  status text not null default 'pending' check(status in ('pending','approved','changes')),
  decision_reason text,
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check((status='pending' and decided_by is null and decided_at is null) or (status<>'pending' and decided_by is not null and decided_at is not null)),
  check(status<>'changes' or coalesce(length(btrim(decision_reason)),0)>=3)
);
create unique index wf_task_one_pending_submission_idx on public.wf_task_submissions(task_id) where status='pending';
create index wf_task_submissions_task_idx on public.wf_task_submissions(task_id,created_at desc,id);
create table public.wf_task_time_entries (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.wf_tasks(id) on delete restrict,
  employee_id uuid not null references public.wf_employees(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz,
  note text not null default '' check(length(note)<=2000),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check(ends_at is null or (ends_at>starts_at and ends_at<=starts_at+interval '24 hours'))
);
create unique index wf_one_running_employee_timer_idx on public.wf_task_time_entries(employee_id) where ends_at is null;
create index wf_task_time_task_idx on public.wf_task_time_entries(task_id,starts_at desc,id);
create table public.wf_task_events (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.wf_tasks(id) on delete restrict,
  actor_id uuid not null references public.profiles(id),
  action text not null check(length(action) between 1 and 80),
  summary text not null default '' check(length(summary)<=2000),
  changed_fields text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index wf_task_events_task_idx on public.wf_task_events(task_id,created_at desc,id);
create table public.wf_task_templates (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.wf_boards(id) on delete restrict,
  title text not null check(length(btrim(title)) between 2 and 150),
  payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=60000),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  version integer not null default 1
);
create index wf_task_templates_board_idx on public.wf_task_templates(board_id,created_at desc);
create table public.wf_task_recurrences (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.wf_task_templates(id) on delete restrict,
  frequency text not null check(frequency in ('daily','weekly','monthly')),
  interval_count integer not null default 1 check(interval_count between 1 and 365),
  next_due_at timestamptz not null,
  ends_at timestamptz,
  enabled boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  last_error text,
  check(ends_at is null or ends_at>=next_due_at)
);
create index wf_task_recurrences_due_idx on public.wf_task_recurrences(next_due_at) where enabled;
create table public.wf_task_occurrences (
  recurrence_id uuid not null references public.wf_task_recurrences(id) on delete restrict,
  scheduled_for timestamptz not null,
  task_id uuid not null unique references public.wf_tasks(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key(recurrence_id,scheduled_for)
);

-- Private helpers intentionally bypass recursive membership policies, but are bound
-- to the current authenticated identity and the current active employee record.
create function workforce_private.employee_id() returns uuid
language sql stable security definer set search_path='' as $$
  select e.id from public.wf_employees e join public.profiles p on p.id=e.user_id join auth.users u on u.id=p.id
  where auth.uid() is not null and e.user_id=auth.uid() and e.status='active' and p.role='employee'
    and (u.banned_until is null or u.banned_until<now());
$$;
create function workforce_private.can_read_task(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and (workforce_private.is_admin() or exists (
    select 1 from public.wf_tasks t where t.id=p_id and workforce_private.employee_id() is not null and (
      t.assignee_id=workforce_private.employee_id() or t.created_by=auth.uid()
      or exists(select 1 from public.wf_task_members m where m.task_id=t.id and m.employee_id=workforce_private.employee_id())
      or (t.shared_with_board and exists(select 1 from public.wf_board_members m where m.board_id=t.board_id and m.employee_id=workforce_private.employee_id()))
    )
  ));
$$;
create function workforce_private.can_read_board(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and (workforce_private.is_admin() or (
    workforce_private.employee_id() is not null and (
      exists(select 1 from public.wf_board_members m where m.board_id=p_id and m.employee_id=workforce_private.employee_id())
      or exists(select 1 from public.wf_tasks t where t.board_id=p_id and workforce_private.can_read_task(t.id))
    )
  ));
$$;
revoke all on function workforce_private.employee_id(), workforce_private.can_read_task(uuid), workforce_private.can_read_board(uuid) from public,anon;
grant execute on function workforce_private.employee_id(), workforce_private.can_read_task(uuid), workforce_private.can_read_board(uuid) to authenticated,service_role;

do $$ declare tbl text; begin
  foreach tbl in array array['wf_boards','wf_board_members','wf_task_columns','wf_tasks','wf_task_members','wf_task_checklist','wf_task_comments','wf_task_attachments','wf_task_dependencies','wf_task_submissions','wf_task_time_entries','wf_task_events','wf_task_templates','wf_task_recurrences','wf_task_occurrences'] loop
    execute format('alter table public.%I enable row level security',tbl);
    execute format('revoke all on public.%I from anon,authenticated',tbl);
    execute format('grant select on public.%I to authenticated',tbl);
    execute format('grant all on public.%I to service_role',tbl);
  end loop;
end $$;
grant usage,select on sequence public.wf_task_events_id_seq to service_role;
create policy wf_boards_read on public.wf_boards for select to authenticated using(workforce_private.can_read_board(id));
create policy wf_board_members_read on public.wf_board_members for select to authenticated using((select workforce_private.is_admin()) or employee_id=(select workforce_private.employee_id()));
create policy wf_task_columns_read on public.wf_task_columns for select to authenticated using(workforce_private.can_read_board(board_id));
create policy wf_tasks_read on public.wf_tasks for select to authenticated using(workforce_private.can_read_task(id));
create policy wf_task_members_read on public.wf_task_members for select to authenticated using(workforce_private.can_read_task(task_id));
create policy wf_task_checklist_read on public.wf_task_checklist for select to authenticated using(workforce_private.can_read_task(task_id));
create policy wf_task_comments_read on public.wf_task_comments for select to authenticated using(workforce_private.can_read_task(task_id));
create policy wf_task_attachments_read on public.wf_task_attachments for select to authenticated using(workforce_private.can_read_task(task_id));
-- A dependency never reveals an otherwise inaccessible task's identity.
create policy wf_task_dependencies_read on public.wf_task_dependencies for select to authenticated using(workforce_private.can_read_task(task_id) and workforce_private.can_read_task(depends_on_id));
create policy wf_task_submissions_read on public.wf_task_submissions for select to authenticated using(workforce_private.can_read_task(task_id));
create policy wf_task_time_read on public.wf_task_time_entries for select to authenticated using((select workforce_private.is_admin()) or (employee_id=(select workforce_private.employee_id()) and workforce_private.can_read_task(task_id)));
create policy wf_task_events_read on public.wf_task_events for select to authenticated using(workforce_private.can_read_task(task_id));
create policy wf_task_templates_read on public.wf_task_templates for select to authenticated using((select workforce_private.is_admin()));
create policy wf_task_recurrences_read on public.wf_task_recurrences for select to authenticated using((select workforce_private.is_admin()));
create policy wf_task_occurrences_read on public.wf_task_occurrences for select to authenticated using((select workforce_private.is_admin()));

-- Serialize graph edits so concurrent inserts cannot create a dependency cycle.
create function workforce_private.guard_task_dependency() returns trigger
language plpgsql set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(74122,1);
  if exists (
    with recursive reachable(id) as (
      select new.depends_on_id
      union
      select d.depends_on_id from public.wf_task_dependencies d join reachable r on d.task_id=r.id
    ) select 1 from reachable where id=new.task_id
  ) then raise exception 'لا يمكن إنشاء اعتماد دائري بين المهام' using errcode='PT409'; end if;
  return new;
end $$;
create trigger wf_task_dependency_guard before insert or update on public.wf_task_dependencies
for each row execute function workforce_private.guard_task_dependency();

create function workforce_private.guard_task_record() returns trigger
language plpgsql set search_path='' as $$
declare target_kind text;
begin
  if TG_OP='UPDATE' then
    if new.id<>old.id or new.board_id<>old.board_id or new.created_by<>old.created_by or new.assignment_origin<>old.assignment_origin then
      raise exception 'هوية المهمة ومصدر التكليف غير قابلين للتغيير' using errcode='42501';
    end if;
    new.version:=old.version+1;
    new.updated_at:=now();
  end if;
  -- Parent tasks stay in the same board by FK; serialize hierarchy edits per board.
  if new.parent_id is not null then
    perform 1 from public.wf_boards where id=new.board_id for update;
    if exists (
      with recursive ancestors(id,parent_id) as (
        select t.id,t.parent_id from public.wf_tasks t where t.id=new.parent_id
        union
        select t.id,t.parent_id from public.wf_tasks t join ancestors a on t.id=a.parent_id
      ) select 1 from ancestors where id=new.id
    ) then raise exception 'لا يمكن إنشاء تسلسل دائري للمهام الفرعية' using errcode='PT409'; end if;
  end if;
  select c.kind into target_kind from public.wf_task_columns c where c.id=new.column_id and c.board_id=new.board_id;
  if target_kind='done' then
    if exists(select 1 from public.wf_task_checklist where task_id=new.id and required and not completed) then
      raise exception 'أكمل عناصر التحقق المطلوبة أولًا' using errcode='PT409';
    end if;
    if new.blocked_reason<>'' then raise exception 'المهمة متوقفة؛ عالج سبب التوقف أولًا' using errcode='PT409'; end if;
    if exists(select 1 from public.wf_task_dependencies d join public.wf_tasks t on t.id=d.depends_on_id join public.wf_task_columns c on c.id=t.column_id where d.task_id=new.id and c.kind<>'done') then
      raise exception 'توجد مهام تعتمد عليها لم تكتمل' using errcode='PT409';
    end if;
    if exists(select 1 from public.wf_tasks t join public.wf_task_columns c on c.id=t.column_id where t.parent_id=new.id and t.archived_at is null and c.kind<>'done') then
      raise exception 'توجد مهام فرعية لم تكتمل' using errcode='PT409';
    end if;
    if new.requires_approval and coalesce((select s.status from public.wf_task_submissions s where s.task_id=new.id order by s.created_at desc,s.id desc limit 1),'')<>'approved' then
      raise exception 'المهمة تتطلب اعتماد التسليم' using errcode='PT409';
    end if;
    new.completed_at:=coalesce(new.completed_at,now());
  else new.completed_at:=null;
  end if;
  return new;
end $$;
create trigger wf_task_record_guard before insert or update on public.wf_tasks
for each row execute function workforce_private.guard_task_record();

create function workforce_private.audit_task_record() returns trigger
language plpgsql set search_path='' as $$
declare fields text[];
begin
  if TG_OP='INSERT' then fields:=array['title','assignee_id','column_id'];
  else select coalesce(array_agg(n.key),'{}') into fields from jsonb_each(to_jsonb(new)) n where n.key not in ('version','updated_at','updated_by') and n.value is distinct from to_jsonb(old)->n.key;
  end if;
  insert into public.wf_task_events(task_id,actor_id,action,changed_fields) values(new.id,new.updated_by,TG_OP,fields);
  return new;
end $$;
create trigger wf_task_record_audit after insert or update on public.wf_tasks
for each row execute function workforce_private.audit_task_record();
revoke all on function workforce_private.guard_task_dependency(), workforce_private.guard_task_record(), workforce_private.audit_task_record() from public,anon,authenticated;
