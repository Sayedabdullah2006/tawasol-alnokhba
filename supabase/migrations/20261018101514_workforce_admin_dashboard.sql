-- One read snapshot for all matching work; never aggregate a paginated API page.
-- Invoker permissions + RLS remain active, and non-admins are rejected inside SQL.
create function public.wf_admin_dashboard(p_from date default null,p_to date default null,p_employee uuid default null,p_client text default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
  if not workforce_private.is_admin() then raise exception 'لوحة الأداء للإدارة فقط' using errcode='42501'; end if;
  if p_from is not null and p_to is not null and p_to<p_from then raise exception 'نهاية الفترة تسبق بدايتها' using errcode='PT400'; end if;
  if length(coalesce(p_client,''))>150 then raise exception 'اسم العميل طويل جدًا' using errcode='PT400'; end if;
  with tasks as materialized (
    select t.*,c.kind,exists(select 1 from public.wf_task_submissions s where s.task_id=t.id and s.status='pending') as has_submission
    from public.wf_tasks t join public.wf_task_columns c on c.id=t.column_id join public.wf_boards b on b.id=t.board_id
    where t.archived_at is null and b.archived_at is null
      and (p_from is null or t.due_at >= (p_from::timestamp at time zone 'Asia/Riyadh'))
      and (p_to is null or t.due_at < ((p_to+1)::timestamp at time zone 'Asia/Riyadh'))
      and (p_employee is null or t.assignee_id=p_employee)
      and (nullif(btrim(p_client),'') is null or t.client_name=btrim(p_client))
  ), counts as (
    select assignee_id,grouping(assignee_id)=1 as is_total,
      count(*) as assigned,
      count(*) filter(where kind='done') as completed,
      count(*) filter(where kind<>'done') as open,
      count(*) filter(where kind='in_progress') as in_progress,
      count(*) filter(where kind<>'done' and due_at<now()) as overdue,
      count(*) filter(where kind='review' and has_submission) as pending,
      count(*) filter(where kind<>'done' and blocked_reason<>'') as blocked,
      count(*) filter(where kind='done' and due_at is not null and completed_at is not null) as dated_completed,
      count(*) filter(where kind='done' and due_at is not null and completed_at<=due_at) as on_time
    from tasks group by grouping sets ((assignee_id),())
  ), staff as (
    select e.id,e.full_name,e.job_title,e.status,
      coalesce((select to_jsonb(c)-'assignee_id'-'is_total' from counts c where not c.is_total and c.assignee_id=e.id),
        jsonb_build_object('assigned',0,'completed',0,'open',0,'in_progress',0,'overdue',0,'pending',0,'blocked',0,'dated_completed',0,'on_time',0)) as metrics
    from public.wf_employees e where (p_employee is null or e.id=p_employee)
      and (e.status='active' or e.id=p_employee or exists(select 1 from tasks t where t.assignee_id=e.id))
  )
  select jsonb_build_object(
    'generated_at',now(),
    'totals',(select to_jsonb(c)-'assignee_id'-'is_total' from counts c where c.is_total),
    'unassigned',(select to_jsonb(c)-'assignee_id'-'is_total' from counts c where not c.is_total and c.assignee_id is null),
    'employees',coalesce((select jsonb_agg(to_jsonb(s) order by s.full_name,s.id) from staff s),'[]'::jsonb),
    'clients',coalesce((select jsonb_agg(x.client_name order by x.client_name) from (
      select distinct t.client_name from public.wf_tasks t join public.wf_boards b on b.id=t.board_id
      where t.archived_at is null and b.archived_at is null and t.client_name<>''
    ) x),'[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function public.wf_admin_dashboard(date,date,uuid,text) from public,anon,service_role;
grant execute on function public.wf_admin_dashboard(date,date,uuid,text) to authenticated;
