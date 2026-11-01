-- An explicit server-owned permission. Other employee actions retain their attendance gate.
alter table public.wf_employees add column can_manage_tasks_off_duty boolean not null default false;
create function workforce_private.task_actions_outside_attendance(p_actor uuid) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from public.wf_employees e join public.profiles p on p.id=e.user_id where e.user_id=p_actor and e.status='active' and p.role='employee' and e.can_manage_tasks and e.can_manage_tasks_off_duty)
$$;
create function workforce_private.assert_task_management_action(p_actor uuid) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if workforce_private.task_actions_outside_attendance(p_actor) then
  perform workforce_private.assert_task_actor(p_actor);return;
 end if;
 perform workforce_private.assert_work_action(p_actor);
end $$;
revoke all on function workforce_private.task_actions_outside_attendance(uuid),workforce_private.assert_task_management_action(uuid) from public,anon,authenticated;
grant execute on function workforce_private.task_actions_outside_attendance(uuid),workforce_private.assert_task_management_action(uuid) to service_role;
do $patch$
declare f record;body text;
begin
 for f in select oid,prosrc,proname from pg_proc where pronamespace='public'::regnamespace and proname=any(array['wf_task_command','wf_evaluated_task_command','wf_checklist_command','wf_comments_command','wf_columns_command','wf_members_command','wf_board_command','wf_attachment_command','wf_performance_command']) loop
  body:=replace(f.prosrc,'workforce_private.assert_work_action(p_actor)','workforce_private.assert_task_management_action(p_actor)');
  if body=f.prosrc then raise exception 'Missing task attendance seam: %',f.proname;end if;
  execute replace(pg_get_functiondef(f.oid),f.prosrc,body);
 end loop;
end $patch$;

-- A permission flag alone is not an employment-profile change or a notification event.
do $quiet$
declare f oid:=to_regprocedure('workforce_private.notify_workforce_changes()');old_body text;body text;
begin
 if f is null then return;end if;
 select prosrc into old_body from pg_proc where oid=f;
 body:=replace(old_body,$s$array['can_view_team_summaries','version','updated_at']$s$,$s$array['can_view_team_summaries','can_manage_tasks_off_duty','version','updated_at']$s$);
 if body=old_body then raise exception 'Missing employment permission notification seam';end if;
 execute replace(pg_get_functiondef(f),old_body,body);
end $quiet$;
