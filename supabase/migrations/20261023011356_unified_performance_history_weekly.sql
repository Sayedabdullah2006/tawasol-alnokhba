-- A single immutable-in-mail evidence shape drives both dashboard and weekly renderer.
create function workforce_private.performance_evidence(p_employee uuid,p_asof timestamptz) returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
 'task_id',t.id,'title',t.title,'employee_id',e.id,'employee_start',e.start_date,'created_at',t.created_at,
 'starts_at',t.starts_at,'due_at',t.due_at,'state',c.kind,'shared',(cardinality(array_remove(array[t.assignee_id]||t.co_assignee_ids,null))+case when t.assignee_admin_id is not null then 1 else 0 end)>1,'participant_count',(cardinality(array_remove(array[t.assignee_id]||t.co_assignee_ids,null))+case when t.assignee_admin_id is not null then 1 else 0 end),'archived',t.archived_at is not null,
 'config',(select jsonb_build_object('participant_count',a.participant_count,'starts_at',a.starts_at,'weight_due_at',a.weight_due_at,'due_at',a.due_at,'configured_at',a.configured_at,'responsibility',a.responsibility,'withdrawn',a.withdrawn) from public.wf_performance_assignments a where a.task_id=t.id and a.employee_id=e.id),
 'deliveries',coalesce((select jsonb_agg(to_jsonb(d)-'task_id'-'employee_id'-'summary' order by d.round) from public.wf_performance_deliveries d where d.task_id=t.id and d.employee_id=e.id and d.delivered_at<=p_asof),'[]'::jsonb),
 'exceptions',coalesce((select jsonb_agg(jsonb_build_object('created_at',x.created_at,'previous_due_at',x.previous_due_at,'new_due_at',x.new_due_at,'reason',x.reason) order by x.created_at,x.id) from public.wf_performance_exceptions x where x.task_id=t.id and x.employee_id=e.id),'[]'::jsonb),
 'history',coalesce((select jsonb_agg(jsonb_build_object('command',r.command,'at',r.created_at,'payload',(select coalesce(jsonb_object_agg(k,v),'{}'::jsonb) from jsonb_each(r.payload) x(k,v) where k in ('starts_at','due_at','assignee_id','co_assignee_ids'))) order by r.created_at,r.request_id) from workforce_private.command_receipts r where r.entity_id=t.id and r.command in ('task:create','task:edit') and r.created_at<=p_asof),'[]'::jsonb),
 'submissions',coalesce((select jsonb_agg(jsonb_build_object('round',s.round,'at',s.created_at,'status',s.status,'decided_at',s.decided_at,'own',s.submitted_by=e.user_id) order by s.round) from(select s.*,row_number() over(order by s.submission_number) round from public.wf_task_submissions s where s.task_id=t.id and s.created_at<=p_asof) s),'[]'::jsonb)
 ) order by t.created_at,t.id),'[]'::jsonb)
 from public.wf_employees e join public.wf_tasks t on (t.assignee_id=e.id or e.id=any(t.co_assignee_ids)) join public.wf_task_columns c on c.id=t.column_id
 where e.id=p_employee and t.deleted_at is null and t.test_run_id is null and t.created_at<=p_asof;
$$;
revoke all on function workforce_private.performance_evidence(uuid,timestamptz) from public,anon,authenticated;
grant execute on function workforce_private.performance_evidence(uuid,timestamptz) to service_role;
create function public.wf_performance_evidence(p_actor uuid,p_employee uuid,p_asof timestamptz default now()) returns jsonb language plpgsql set search_path='' as $$
declare employee uuid;
begin
 employee:=workforce_private.assert_task_actor(p_actor);
 if employee is not null and employee<>p_employee then raise exception 'التقييم غير متاح' using errcode='42501';end if;
 return workforce_private.performance_evidence(p_employee,least(p_asof,now()));
end $$;
revoke all on function public.wf_performance_evidence(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.wf_performance_evidence(uuid,uuid,timestamptz) to service_role;

-- Preserve scheduling, CC, paid leave targets, duplicate guards and queue semantics.
alter function public.wf_weekly_report_data(date) rename to wf_weekly_report_data_before_performance;
revoke all on function public.wf_weekly_report_data_before_performance(date) from public,anon,authenticated;
grant execute on function public.wf_weekly_report_data_before_performance(date) to service_role;
create function public.wf_weekly_report_data(p_week_end date) returns setof jsonb language plpgsql stable set search_path='' as $$
declare report jsonb;evidence jsonb;
begin
 for report in select * from public.wf_weekly_report_data_before_performance(p_week_end) loop
  evidence:=workforce_private.performance_evidence((report->>'employeeId')::uuid,(report#>>'{snapshot,weeklyReport,asOf}')::timestamptz);
  return next jsonb_set(report,'{snapshot,weeklyReport,performanceEvidence}',evidence);
 end loop;
end $$;
revoke all on function public.wf_weekly_report_data(date) from public,anon,authenticated;
grant execute on function public.wf_weekly_report_data(date) to service_role;
