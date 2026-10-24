create function workforce_private.work_confirmation_current(p_recipient uuid,p_key text,p_now timestamptz default now())
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.wf_attendance_sessions s join public.wf_employees e on e.id=s.employee_id
 where e.user_id=p_recipient and e.status='active' and s.source='clock' and s.policy_version=1
 and s.checked_out is null and s.break_started_at is null
 and s.business_date=(p_now at time zone 'Asia/Riyadh')::date
 and s.next_confirmation_at<=p_now and p_now<s.next_confirmation_at+interval '5 minutes'
 and s.next_confirmation_at<s.cutoff_at and workforce_private.work_expiry(s,p_now) is null
 and p_key='work-confirmation:'||s.id||':'||extract(epoch from s.next_confirmation_at)::bigint);
$$;
revoke all on function workforce_private.work_confirmation_current(uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function workforce_private.work_confirmation_current(uuid,text,timestamptz) to service_role;

create function public.wf_generate_work_confirmation_reminders(p_now timestamptz default now()) returns integer
language plpgsql security invoker set search_path='' as $$
declare s public.wf_attendance_sessions; recipient uuid; key text; affected integer; added integer:=0;
begin
 if not exists(select 1 from public.wf_notification_delivery_settings where id and enabled) then return 0;end if;
 for s in select a.* from public.wf_attendance_sessions a
 where a.source='clock' and a.policy_version=1 and a.checked_out is null and a.break_started_at is null
 and a.business_date=(p_now at time zone 'Asia/Riyadh')::date
 and a.next_confirmation_at<=p_now and p_now<a.next_confirmation_at+interval '5 minutes'
 and a.next_confirmation_at<a.cutoff_at and workforce_private.work_expiry(a,p_now) is null
 for update skip locked loop
  select e.user_id into recipient from public.wf_employees e where e.id=s.employee_id and e.status='active';
  if recipient is null or not workforce_private.notification_recipient_active(recipient) then continue;end if;
  key:='work-confirmation:'||s.id||':'||extract(epoch from s.next_confirmation_at)::bigint;
  insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
  values(recipient,'attendance_confirmation','حان موعد تأكيد استمرار العمل',
   'افتحي جلسة الدوام واضغطي «أواصل العمل» قبل '||
   to_char((s.next_confirmation_at+interval '5 minutes') at time zone 'Asia/Riyadh','HH24:MI')||
   E' بتوقيت الرياض.\nعدم التأكيد خلال المهلة يؤدي إلى تسجيل انصراف تلقائي.',
   '/employee/attendance/overview',key)
  on conflict(recipient_id,event_key) do nothing;
  get diagnostics affected=row_count;added:=added+affected;
 end loop;
 return added;
end $$;
revoke all on function public.wf_generate_work_confirmation_reminders(timestamptz) from public,anon,authenticated;
grant execute on function public.wf_generate_work_confirmation_reminders(timestamptz) to service_role;

-- Reuse the existing one-minute reminder job; no additional scheduler or send path.
do $$
declare f oid:='public.wf_generate_notification_reminders(timestamptz)'::regprocedure; old_body text; body text;
begin
 select prosrc into old_body from pg_proc where oid=f;
 body:=replace(old_body,$s$return jsonb_build_object('created',added);$s$,$s$added:=added+public.wf_generate_work_confirmation_reminders(p_now);
 return jsonb_build_object('created',added);$s$);
 if body=old_body then raise exception 'Reminder generator changed; review confirmation hook';end if;
 execute replace(pg_get_functiondef(f),old_body,body);
end $$;

-- A delayed queue must not mail an obsolete request after confirmation, break,
-- checkout, disconnection, or expiry of the five-minute response window.
do $$
declare f oid:='public.wf_claim_notification_deliveries(integer)'::regprocedure; old_body text; body text;
begin
 select prosrc into old_body from pg_proc where oid=f;
 body:=regexp_replace(old_body,'\mbegin\M',$s$begin
 update public.wf_notification_deliveries d set status='cancelled',last_error='لم يعد تأكيد الجلسة مطلوبًا'
 from public.wf_notifications n where n.id=d.notification_id and d.status='pending'
 and n.kind='attendance_confirmation'
 and not workforce_private.work_confirmation_current(n.recipient_id,n.event_key,workforce_private.work_now());$s$,'i');
 if body=old_body then raise exception 'Delivery claim changed; review confirmation cancellation';end if;
 execute replace(pg_get_functiondef(f),old_body,body);
end $$;

do $$
declare f oid:='workforce_private.notification_group(text)'::regprocedure; old_body text; body text;
begin
 select prosrc into old_body from pg_proc where oid=f;
 body:=replace(old_body,$s$('due_24h',$s$,$s$('attendance_confirmation','due_24h',$s$);
 if body=old_body then raise exception 'Notification groups changed; review confirmation group';end if;
 execute replace(pg_get_functiondef(f),old_body,body);
end $$;
