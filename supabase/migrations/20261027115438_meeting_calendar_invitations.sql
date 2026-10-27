-- Calendar identity remains stable when an individual occurrence is moved.
alter table public.wf_meetings add column calendar_recurrence_at timestamptz;
update public.wf_meetings set calendar_recurrence_at=starts_at where status<>'draft';
create function workforce_private.keep_meeting_calendar_identity() returns trigger language plpgsql set search_path='' as $$
begin
 if old.calendar_recurrence_at is not null then new.calendar_recurrence_at:=old.calendar_recurrence_at;
 elsif old.status='draft' and new.status='scheduled' then new.calendar_recurrence_at:=new.starts_at;end if;
 return new;
end$$;
revoke all on function workforce_private.keep_meeting_calendar_identity() from public,anon,authenticated;
create trigger wf_meeting_calendar_identity before update on public.wf_meetings for each row execute function workforce_private.keep_meeting_calendar_identity();

-- Private, recipient-scoped immutable data. No list of other invitees is placed
-- in the .ics file or mail snapshot. Only the existing outbox inserts call this.
create function workforce_private.meeting_calendar_snapshot(p_meeting uuid,p_recipient uuid,p_email text,p_full boolean,p_cancel boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.wf_meetings; occurrences jsonb;
begin
 select * into m from public.wf_meetings where id=p_meeting and provider='zoom' and status<>'draft';
 if m.id is null or p_email is null then return null;end if;
 select jsonb_agg(jsonb_build_object('id',x.id,'title',x.title,'description',x.description,'startsAt',x.starts_at,'endsAt',x.ends_at,'recurrenceAt',coalesce(x.calendar_recurrence_at,x.starts_at),'sequence',x.version) order by x.starts_at,x.id) into occurrences
 from public.wf_meetings x where x.provider='zoom' and
 (case when p_full and m.series_id is not null then x.series_id=m.series_id and x.status='scheduled' else x.id=m.id end)
 and (p_recipient is null or p_recipient=any(x.participant_ids))
 and (p_recipient is not null or not p_full or lower(p_email)=any(x.external_attendees));
 if occurrences is null then return null;end if;
 return jsonb_build_object('uid',coalesce(m.series_id,m.id),'recurring',m.series_id is not null,'master',p_full and m.series_id is not null,'cancelled',p_cancel,'external',p_recipient is null,'occurrences',occurrences);
end$$;
revoke all on function workforce_private.meeting_calendar_snapshot(uuid,uuid,text,boolean,boolean) from public,anon,authenticated;

create function workforce_private.attach_staff_meeting_calendar() returns trigger language plpgsql security definer set search_path='' as $$
declare n public.wf_notifications; m public.wf_meetings; calendar jsonb; full_series boolean;
begin
 select * into n from public.wf_notifications where id=new.notification_id;
 if n.kind<>'meeting_event' or n.recipient_id is distinct from new.recipient_id then return new;end if;
 full_series:=n.event_key like 'meeting-series:%';
 select * into m from public.wf_meetings where provider='zoom' and
 (n.event_key='meeting-event:'||id||':'||version or (full_series and n.event_key='meeting-series:'||series_id and status='scheduled')) order by starts_at,id limit 1;
 if m.id is null then return new;end if;
 calendar:=workforce_private.meeting_calendar_snapshot(m.id,new.recipient_id,new.snapshot->>'email',full_series,m.status='cancelled');
 if calendar is not null then new.snapshot:=new.snapshot||jsonb_build_object('meetingCalendar',calendar);end if;
 return new;
end$$;
revoke all on function workforce_private.attach_staff_meeting_calendar() from public,anon,authenticated;
create trigger wf_staff_calendar_snapshot before insert on public.wf_notification_deliveries for each row execute function workforce_private.attach_staff_meeting_calendar();

create function workforce_private.attach_guest_meeting_calendar() returns trigger language plpgsql security definer set search_path='' as $$
declare calendar jsonb;
begin
 calendar:=workforce_private.meeting_calendar_snapshot(new.meeting_id,null,new.email,new.snapshot ? 'seriesId',new.snapshot->>'title' like '%إلغاء%');
 if calendar is not null then new.snapshot:=new.snapshot||jsonb_build_object('meetingCalendar',calendar);end if;
 return new;
end$$;
revoke all on function workforce_private.attach_guest_meeting_calendar() from public,anon,authenticated;
create trigger wf_guest_calendar_snapshot before insert on workforce_private.meeting_guest_deliveries for each row execute function workforce_private.attach_guest_meeting_calendar();
-- Deliberately no resend/backfill of existing outbox messages.
