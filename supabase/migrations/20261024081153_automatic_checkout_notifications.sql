-- Future checkout transitions only. Existing closed sessions are not replayed.
create or replace function workforce_private.notify_admin_attendance_event() returns trigger
language plpgsql security invoker set search_path='' as $$
declare name text; employee_user uuid; heading text; category text; tick timestamptz; key text;
 reason text; automatic boolean:=false; stamp text; next_step text;
begin
 if new.source<>'clock' then return new;end if;
 if TG_OP='INSERT' then category:='attendance_in';heading:='تسجيل حضور موظفة';tick:=new.checked_in;
 elsif old.checked_out is null and new.checked_out is not null then
  category:='attendance_out';tick:=new.checked_out;
  automatic:=new.close_reason in ('connection_lost','confirmation_missed','day_end');
  reason:=case new.close_reason
   when 'connection_lost' then 'انقطاع الاتصال بجلسة العمل'
   when 'confirmation_missed' then 'عدم تأكيد استمرار العمل'
   when 'day_end' then 'بلوغ نهاية الدوام'
   else 'انصراف يدوي' end;
  heading:=case when automatic then 'انصراف تلقائي لموظفة' else 'تسجيل انصراف موظفة' end;
 else return new;end if;
 select full_name,case when status='active' then user_id end into name,employee_user from public.wf_employees where id=new.employee_id;
 key:='clock:'||new.id||':'||category;
 stamp:=to_char(tick at time zone 'Asia/Riyadh','YYYY-MM-DD HH24:MI');
 insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
 select r.user_id,category,heading,coalesce(name,'الموظفة')||E'\n'||
  case when category='attendance_out' then 'السبب: '||reason||E'\n' else '' end||
  case when category='attendance_out' then 'وقت الانصراف' else 'وقت الحضور' end||' بتوقيت الرياض: '||stamp,
  '/admin/workforce/attendance?employee_id='||new.employee_id,key
 from workforce_private.notification_email_routes r join public.profiles p on p.id=r.user_id and p.role='admin'
 where workforce_private.notification_recipient_active(p.id)
 on conflict(recipient_id,event_key) do nothing;
 if automatic and employee_user is not null and workforce_private.notification_recipient_active(employee_user) then
  next_step:=case when new.close_reason='day_end' then 'سجّلي حضورك مجددًا في بداية دوامك القادم.'
   else 'عند العودة للعمل، سجّلي حضورك مجددًا خلال وقت الدوام المتاح.' end;
  insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
  values(employee_user,'attendance_out','تسجيل انصرافك تلقائيًا',
   'السبب: '||reason||E'\nوقت الانصراف بتوقيت الرياض: '||stamp||E'\n'||next_step,
   '/employee/attendance/overview',key)
  on conflict(recipient_id,event_key) do nothing;
 end if;
 return new;
end $$;
revoke all on function workforce_private.notify_admin_attendance_event() from public,anon,authenticated;
grant execute on function workforce_private.notify_admin_attendance_event() to service_role;
