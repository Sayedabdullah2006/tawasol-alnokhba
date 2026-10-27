-- Recurrences count Sunday–Thursday appointments, not skipped weekend dates.
create or replace function public.wf_meeting_series(p_actor uuid,p_id uuid,p_payload jsonb,p_frequency text,p_count integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare request jsonb; existing workforce_private.meeting_series_requests; first_start timestamp; duration interval; occurrence timestamp; mid uuid; result jsonb; i integer; accepted integer:=0;
begin
 perform workforce_private.assert_task_actor(p_actor);
 if not workforce_private.meeting_manager(p_actor) then raise insufficient_privilege;end if;
 perform workforce_private.assert_work_action(p_actor);
 if p_frequency is null or p_frequency not in ('daily','weekly','monthly') or p_count is null or p_count<2 or p_count>24 then raise sqlstate 'PT400' using message='اختاري التكرار وعدد المواعيد من 2 إلى 24';end if;
 request:=jsonb_build_object('data',p_payload,'frequency',p_frequency,'count',p_count);
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,71));
 select * into existing from workforce_private.meeting_series_requests where id=p_id;
 if existing.id is not null then
  if existing.created_by<>p_actor then raise insufficient_privilege;end if;
  if existing.payload<>request then raise sqlstate 'PT409' using message='السلسلة محفوظة؛ حدّثي قائمة الاجتماعات';end if;
 else
  if exists(select 1 from public.wf_meetings where id=p_id) then raise sqlstate 'PT409' using message='معرف الاجتماع مستخدم';end if;
  first_start:=(p_payload->>'starts_at')::timestamptz at time zone 'Asia/Riyadh';
  if extract(isodow from first_start) in (5,6) then raise sqlstate 'PT400' using message='اختاري بداية التكرار من الأحد إلى الخميس؛ الجمعة والسبت مستبعدان';end if;
  duration:=(p_payload->>'ends_at')::timestamptz-(p_payload->>'starts_at')::timestamptz;
  insert into workforce_private.meeting_series_requests values(p_id,p_actor,request);
  for i in 0..167 loop
   occurrence:=first_start+case p_frequency when 'monthly' then make_interval(months=>i) when 'weekly' then make_interval(days=>7*i) else make_interval(days=>i) end;
   if extract(isodow from occurrence) in (5,6) then continue;end if;
   mid:=case when i=0 then p_id else gen_random_uuid() end;
   result:=public.wf_meeting_command(p_actor,mid,0,'save',p_payload||jsonb_build_object('starts_at',occurrence at time zone 'Asia/Riyadh','ends_at',(occurrence at time zone 'Asia/Riyadh')+duration));
   update public.wf_meetings set series_id=p_id,series_frequency=p_frequency where id=mid;
   accepted:=accepted+1;exit when accepted=p_count;
  end loop;
  if accepted<>p_count then raise exception 'تعذر إكمال عدد المواعيد';end if;
 end if;
 return (select jsonb_agg(to_jsonb(m) order by starts_at,id) from public.wf_meetings m where series_id=p_id);
end $$;

create unique index meeting_guest_series_recipient on workforce_private.meeting_guest_deliveries((snapshot->>'seriesId'),email) where snapshot ? 'seriesId';

-- Announce a fully published series once, even if its publication is retried.
-- No notification is emitted for drafts or a partially failed publication.
create function workforce_private.announce_meeting_series(p_series uuid) returns void
language plpgsql security definer set search_path='' as $$
declare m public.wf_meetings; target record; details text; anchor uuid; guest text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_series::text,72));
 if exists(select 1 from public.wf_meetings where series_id=p_series and (status='draft' or sync_state<>'idle' or proposed_data is not null)) then return;end if;
 select * into m from public.wf_meetings where series_id=p_series and provider='zoom' and status='scheduled' order by starts_at,id limit 1;
 if m.id is null then return;end if;
 for target in select distinct u.id,u.role from public.wf_meetings x cross join lateral unnest(x.participant_ids) a(id) join public.profiles u on u.id=a.id
  where x.series_id=p_series and x.status='scheduled' and workforce_private.notification_recipient_active(u.id) loop
  select string_agg(to_char(x.starts_at at time zone 'Asia/Riyadh','YYYY-MM-DD HH24:MI')||' — '||to_char(x.ends_at at time zone 'Asia/Riyadh','HH24:MI'),E'\n' order by x.starts_at,x.id),
   (array_agg(x.id order by x.starts_at,x.id))[1] into details,anchor from public.wf_meetings x where x.series_id=p_series and x.status='scheduled' and target.id=any(x.participant_ids);
  insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key) values(target.id,'meeting_event','اجتماع متكرر: '||left(m.title,260),m.title||E'\nالمواعيد — بتوقيت الرياض:\n'||details,
   case when target.role='admin' then '/admin/workforce/meetings?meeting=' else '/employee/meetings?meeting=' end||anchor,'meeting-series:'||p_series)
  on conflict(recipient_id,event_key) do nothing;
 end loop;
 if not exists(select 1 from public.wf_notification_delivery_settings where id and enabled) then return;end if;
 for guest in select distinct lower(a.email) from public.wf_meetings x cross join lateral unnest(x.external_attendees) a(email) where x.series_id=p_series and x.status='scheduled'
  and not exists(select 1 from auth.users u left join workforce_private.notification_email_routes r on r.user_id=u.id where u.id=any(x.participant_ids) and lower(a.email)=lower(coalesce(r.email,u.email))) loop
  select string_agg(to_char(x.starts_at at time zone 'Asia/Riyadh','YYYY-MM-DD HH24:MI')||' — '||to_char(x.ends_at at time zone 'Asia/Riyadh','HH24:MI')||E'\n'||regexp_replace(x.meet_url,'/j/([0-9]+)','/wc/\1/join')||case when position('?' in x.meet_url)>0 then '&prefer=1' else '?prefer=1' end,E'\n' order by x.starts_at,x.id),
   (array_agg(x.id order by x.starts_at,x.id))[1] into details,anchor from public.wf_meetings x where x.series_id=p_series and x.status='scheduled' and guest=any(x.external_attendees);
  insert into workforce_private.meeting_guest_deliveries(meeting_id,version,email,snapshot)
  select x.id,x.version,guest,jsonb_build_object('seriesId',p_series,'email',guest,'name','ضيفنا الكريم','kind','meeting_guest','title','اجتماع متكرر: '||m.title,'body',m.title||E'\nالمواعيد — بتوقيت الرياض:\n'||details,'href',x.meet_url,'createdAt',now()) from public.wf_meetings x where x.id=anchor
  on conflict do nothing;
 end loop;
end$$;
revoke all on function workforce_private.announce_meeting_series(uuid) from public,anon,authenticated;
grant execute on function workforce_private.announce_meeting_series(uuid) to service_role;

do $$declare f oid; original text; body text;
begin
 f:='public.wf_meeting_command(uuid,uuid,integer,text,jsonb)'::regprocedure;
 select prosrc into original from pg_proc where oid=f;
 body:=replace(original,$s$insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
   select distinct u,'meeting_event'$s$,$s$if not (m.provider='zoom' and m.series_id is not null and m.version=1 and m.status='scheduled') then
   insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
   select distinct u,'meeting_event'$s$);
 if body=original then raise exception 'Review meeting announcement insertion';end if;
 body:=replace(body,$s$on conflict(recipient_id,event_key) do nothing;
  end if;
 elsif p_command='cancel_draft'$s$,$s$on conflict(recipient_id,event_key) do nothing;
   else perform workforce_private.announce_meeting_series(m.series_id);end if;
  end if;
 elsif p_command='cancel_draft'$s$);
 if position('else perform workforce_private.announce_meeting_series' in body)=0 then raise exception 'Review meeting announcement block';end if;
 execute replace(pg_get_functiondef(f),original,body);
 f:='workforce_private.queue_meeting_guests()'::regprocedure;
 select prosrc into original from pg_proc where oid=f;
 body:=replace(original,'declare guest text;','declare guest text;');
 body:=regexp_replace(body,'\mbegin\M',$s$begin
 if new.series_id is not null and new.version=1 and new.status='scheduled' then return new;end if;$s$,'i');
 execute replace(pg_get_functiondef(f),original,body);
 f:='workforce_private.queue_notification_email()'::regprocedure;
 select prosrc into original from pg_proc where oid=f;
 body:=replace(original,$s$and new.event_key='meeting-event:'||m.id||':'||m.version$s$,$s$and (new.event_key='meeting-event:'||m.id||':'||m.version or new.event_key='meeting-series:'||m.series_id)$s$);
 if body=original then raise exception 'Review series email eligibility';end if;
 execute replace(pg_get_functiondef(f),original,body);
 f:='public.wf_claim_notification_deliveries(integer)'::regprocedure;
 select prosrc into original from pg_proc where oid=f;
 body:=replace(original,$s$and n.event_key='meeting-event:'||m.id||':'||m.version$s$,$s$and (n.event_key='meeting-event:'||m.id||':'||m.version or (n.event_key='meeting-series:'||m.series_id and m.status='scheduled'))$s$);
 if body=original then raise exception 'Review series email freshness';end if;
 execute replace(pg_get_functiondef(f),original,body);
end$$;
