-- Delegated managers explicitly allowed outside attendance may move visible tasks,
-- without gaining the assignee's delivery or time-recording permissions.
do $patch$
declare f oid:='public.wf_task_command(uuid,uuid,integer,text,jsonb,uuid)'::regprocedure;old_body text;body text;
begin
 select prosrc into old_body from pg_proc where oid=f;
 body:=replace(old_body,'can_write:=employee is null or task.assignee_id=employee','can_write:=employee is null or (p_command=''move'' and workforce_private.task_actions_outside_attendance(p_actor)) or task.assignee_id=employee');
 if body=old_body then raise exception 'Missing delegated task movement permission seam';end if;
 execute replace(pg_get_functiondef(f),old_body,body);
end $patch$;
