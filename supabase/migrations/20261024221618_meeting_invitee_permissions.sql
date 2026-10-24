-- auth.users intentionally remains unreadable to service_role via SQL.
-- Only resolve the validated participants of an authorized meeting.
create function workforce_private.meeting_invitee_emails(p_actor uuid,p_meeting uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.wf_meetings; data jsonb; result jsonb;
begin
 perform workforce_private.assert_task_actor(p_actor);
 if not workforce_private.meeting_manager(p_actor) or not workforce_private.meeting_readable(p_meeting,p_actor) then raise insufficient_privilege;end if;
 select * into m from public.wf_meetings where id=p_meeting;
 if m.id is null or m.status='cancelled' then raise no_data_found;end if;
 data:=coalesce(m.proposed_data,to_jsonb(m));
 select coalesce(jsonb_agg(email order by email),'[]'::jsonb) into result from (
  select lower(coalesce(r.email,u.email)) email from auth.users u
  left join workforce_private.notification_email_routes r on r.user_id=u.id
  where u.id in(select value::uuid from jsonb_array_elements_text(data->'participant_ids'))
   and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
  union select lower(value) from jsonb_array_elements_text(coalesce(data->'external_attendees','[]'))
 ) q;
 return result;
end $$;
revoke all on function workforce_private.meeting_invitee_emails(uuid,uuid) from public,anon,authenticated;
grant execute on function workforce_private.meeting_invitee_emails(uuid,uuid) to service_role;

do $$
declare f oid:='public.wf_meeting_command(uuid,uuid,integer,text,jsonb)'::regprocedure; original text; patched text;
begin
 select prosrc into original from pg_proc where oid=f;
 patched:=regexp_replace(original,'select coalesce\(jsonb_agg\(email\),''\[\]''\) into data from \(.*?\) q;', 'data:=workforce_private.meeting_invitee_emails(p_actor,p_id);','s');
 if patched=original then raise exception 'Review meeting invitee lookup before applying';end if;
 execute replace(pg_get_functiondef(f),original,patched);
end $$;
