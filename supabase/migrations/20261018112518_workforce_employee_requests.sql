-- Private employee requests. Client roles can read only; checked server commands write.
create table public.wf_employee_requests (
 id uuid primary key,
 employee_id uuid not null references public.wf_employees(id) on delete restrict,
 kind text not null check(kind in ('leave','permission','remote-work','expenses','advance','letter','payroll-review','attendance-correction','general')),
 title text not null check(length(btrim(title)) between 3 and 150),
 body text not null check(length(btrim(body)) between 3 and 10000),
 starts_at timestamptz, ends_at timestamptz,
 amount numeric(14,2) check(amount>0 and amount<=100000000),
 attachments jsonb not null default '[]' check(jsonb_typeof(attachments)='array' and jsonb_array_length(attachments)<=5),
 fingerprint text not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled')),
 decision_reason text, decided_by uuid references public.profiles(id), decided_at timestamptz,
 version integer not null default 1,
 created_at timestamptz not null default now(),
 check(ends_at is null or (starts_at is not null and ends_at>=starts_at)),
 check(kind not in ('leave','permission','remote-work','attendance-correction') or (starts_at is not null and ends_at is not null)),
 check(kind not in ('expenses','advance') or amount is not null)
);
create index wf_employee_requests_owner_idx on public.wf_employee_requests(employee_id,created_at desc,id);
create index wf_employee_requests_status_idx on public.wf_employee_requests(status,created_at desc,id);
alter table public.wf_employee_requests enable row level security;
revoke all on public.wf_employee_requests from public,anon,authenticated;
grant select on public.wf_employee_requests to authenticated;
grant select,insert,update on public.wf_employee_requests to service_role;
create policy wf_employee_requests_read on public.wf_employee_requests for select to authenticated using (
 (select workforce_private.is_admin()) or employee_id=(select workforce_private.employee_id())
);
create function public.wf_decide_employee_request(p_id uuid,p_actor uuid,p_version integer,p_decision text,p_reason text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare r public.wf_employee_requests; admin_actor boolean;
begin
 select * into r from public.wf_employee_requests where id=p_id for update;
 if not found then raise exception 'الطلب غير متاح' using errcode='P0002'; end if;
 select exists(select 1 from public.profiles p join auth.users u on u.id=p.id where p.id=p_actor and p.role='admin' and (u.banned_until is null or u.banned_until<now())) into admin_actor;
 if p_decision='cancelled' then
  if not exists(select 1 from public.wf_employees e join public.profiles p on p.id=e.user_id where e.id=r.employee_id and e.user_id=p_actor and e.status='active' and p.role='employee') then raise insufficient_privilege; end if;
 elsif not admin_actor or p_decision not in ('approved','rejected') then raise insufficient_privilege;
 end if;
 if r.version<>p_version or r.status<>'pending' then raise exception 'تمت معالجة الطلب؛ حدّث القائمة' using errcode='PT409'; end if;
 if p_decision<>'cancelled' and length(btrim(coalesce(p_reason,''))) not between 3 and 2000 then raise exception 'أدخل سبب القرار' using errcode='PT400'; end if;
 update public.wf_employee_requests set status=p_decision,decision_reason=left(p_reason,2000),decided_by=p_actor,decided_at=now(),version=version+1 where id=p_id;
 insert into public.wf_audit_events(entity_table,entity_id,action,actor_id,changed_fields) values('wf_employee_requests',p_id::text,p_decision,p_actor,array['status','decision_reason']);
 return p_id;
end $$;
revoke all on function public.wf_decide_employee_request(uuid,uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.wf_decide_employee_request(uuid,uuid,integer,text,text) to service_role;
create function workforce_private.notify_employee_request() returns trigger language plpgsql set search_path='' as $$
declare recipient uuid;
begin
 if TG_OP='INSERT' then
  insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
  select id,'employee_request','طلب موظفة جديد',new.title,'/admin/workforce/approvals?request='||new.id,'employee-request:'||new.id from public.profiles where role='admin';
 elsif new.status is distinct from old.status then
  if new.status='cancelled' then
   insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
   select id,'employee_request','ألغت الموظفة طلبها',new.title,'/admin/workforce/approvals?request='||new.id,'employee-request:'||new.id||':cancelled' from public.profiles where role='admin';
  else
   select user_id into recipient from public.wf_employees where id=new.employee_id and status='active';
   if recipient is not null then
    insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
    values(recipient,'employee_request',case when new.status='approved' then 'تمت الموافقة على طلبك' else 'تم رفض طلبك' end,new.title,'/employee/requests/history?request='||new.id,'employee-request:'||new.id||':'||new.status);
   end if;
  end if;
 end if;
 return new;
end $$;
create trigger wf_employee_request_notifications after insert or update on public.wf_employee_requests for each row execute function workforce_private.notify_employee_request();
