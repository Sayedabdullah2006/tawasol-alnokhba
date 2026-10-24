-- Use the existing private delivery address rather than the login identifier.
do $$
declare f oid:='public.wf_meeting_command(uuid,uuid,integer,text,jsonb)'::regprocedure; original text; patched text;
begin
 select prosrc into original from pg_proc where oid=f;
 patched:=replace(original,'select lower(u.email) email from auth.users u where','select lower(coalesce(r.email,u.email)) email from auth.users u left join workforce_private.notification_email_routes r on r.user_id=u.id where');
 if patched=original then raise exception 'Review meeting email resolver before applying';end if;
 execute replace(pg_get_functiondef(f),original,patched);
end $$;
