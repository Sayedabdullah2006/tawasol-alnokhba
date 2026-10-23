-- Preserve subsecond boundaries when allocating approved whole-minute credit.
create or replace function workforce_private.post_missing_hours() returns trigger
language plpgsql security invoker set search_path='' as $$
declare remaining numeric;room tstzmultirange;gap tstzrange;seconds numeric;finish timestamptz;
begin
 if new.kind<>'missing-hours' or new.status<>'approved' or old.status<>'pending' or new.test_run_id is not null then return new;end if;
 remaining:=new.missing_minutes*60;
 room:=tstzmultirange(tstzrange((new.work_day+time '09:00') at time zone 'Asia/Riyadh',(new.work_day+time '17:00') at time zone 'Asia/Riyadh','[)'))-workforce_private.missing_hours_gaps(new.employee_id,new.work_day);
 for gap in select unnest(room) order by 1 loop
  exit when remaining=0;
  seconds:=least(remaining,extract(epoch from upper(gap)-lower(gap)));finish:=lower(gap)+seconds*interval '1 second';
  insert into public.wf_attendance_sessions(id,employee_id,business_date,checked_in,checked_out,source,note,updated_by,credit_request_id)
   values(gen_random_uuid(),new.employee_id,new.work_day,lower(gap),finish,'missing-hours','ساعات مفقودة معتمدة',new.decided_by,new.id);
  remaining:=remaining-seconds;
 end loop;
 if remaining<>0 then raise sqlstate 'PT409' using message='لا توجد مدة كافية دون تداخل؛ راجعي سجل الحضور';end if;
 perform workforce_private.refresh_attendance_payroll(new.employee_id,date_trunc('month',new.work_day)::date);
 return new;
end $$;
