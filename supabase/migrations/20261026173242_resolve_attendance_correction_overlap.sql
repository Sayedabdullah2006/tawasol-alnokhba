-- Resolve only during the manager's approval transaction. Existing requests
-- stay pending and attendance/payroll are never changed by this migration.
create function workforce_private.attendance_correction_target(
 p_employee uuid,p_session uuid,p_start timestamptz,p_end timestamptz
) returns uuid language plpgsql security invoker set search_path='' as $$
declare a public.wf_attendance_sessions; candidate public.wf_attendance_sessions;
 overlap_count integer:=0; details text:=''; target uuid:=p_session; stamp text;
begin
 if p_start is null or p_end is null or p_end<=p_start then
  raise sqlstate 'PT400' using message='حددي بداية ونهاية صحيحتين لفترة التصحيح';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_employee::text,19));
 if target is not null then
  select * into candidate from public.wf_attendance_sessions where id=target and employee_id=p_employee for update;
  if not found then raise sqlstate 'PT400' using message='سجل الحضور المطلوب تصحيحه غير متاح';end if;
  if candidate.credit_request_id is not null or candidate.overtime_request_id is not null then
   raise sqlstate 'PT409' using message='هذا السجل مرتبط بساعات مفقودة أو خارج دوام معتمد؛ راجعي الطلب المرتبط به قبل تصحيحه';
  end if;
 end if;
 for a in select * from public.wf_attendance_sessions
  where employee_id=p_employee and id is distinct from target
  and tstzrange(checked_in,coalesce(checked_out,now()),'[)') && tstzrange(p_start,p_end,'[)')
  order by checked_in,id for update
 loop
  overlap_count:=overlap_count+1;
  candidate:=a;
  if overlap_count<=3 then
   stamp:=to_char(a.checked_in at time zone 'Asia/Riyadh','YYYY-MM-DD HH24:MI:SS')||' — '||
    coalesce(to_char(a.checked_out at time zone 'Asia/Riyadh','HH24:MI:SS'),'حضور مفتوح');
   details:=details||case when details='' then '' else '، ' end||stamp;
  end if;
 end loop;
 if target is not null then
  if overlap_count>0 then raise sqlstate 'PT409' using message='التصحيح يتداخل مع فترة حضور أخرى مسجلة بتوقيت الرياض: '||details||'. عدلي الفترة حتى لا تتكرر الساعات';end if;
  return target;
 end if;
 if overlap_count=0 then return null;end if;
 if overlap_count>1 then
  raise sqlstate 'PT409' using message='الفترة المطلوبة تتداخل مع '||overlap_count||' سجلات حضور بتوقيت الرياض: '||details||'. حددي السجل المطلوب تصحيحه وقدمي التصحيح لكل فترة على حدة';
 end if;
 if candidate.credit_request_id is not null or candidate.overtime_request_id is not null then
  raise sqlstate 'PT409' using message='الفترة تتداخل مع ساعات مفقودة أو خارج دوام معتمد: '||details||'. راجعي الطلب المرتبط بهذا السجل';
 end if;
 if candidate.checked_out is null then
  raise sqlstate 'PT409' using message='يوجد سجل حضور مفتوح يبدأ في '||details||'. أغلقي فترة الحضور أولًا ثم أعيدي محاولة اعتماد التصحيح';
 end if;
 if candidate.business_date<>(p_start at time zone 'Asia/Riyadh')::date then
  raise sqlstate 'PT409' using message='الفترة تتداخل مع سجل من يوم آخر: '||details||'. حددي السجل والفترة المطلوب تصحيحها';
 end if;
 return candidate.id;
end $$;
revoke all on function workforce_private.attendance_correction_target(uuid,uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function workforce_private.attendance_correction_target(uuid,uuid,timestamptz,timestamptz) to service_role;

do $$
declare f oid:='public.wf_decide_employee_request(uuid,uuid,integer,text,text)'::regprocedure; old_body text; body text;
begin
 select prosrc into old_body from pg_proc where oid=f;
 body:=replace(old_body,
 $s$if exists(select 1 from public.wf_attendance_sessions where employee_id=r.employee_id and id is distinct from r.attendance_session_id and tstzrange(checked_in,coalesce(checked_out,now()),'[)') && tstzrange(r.starts_at,r.ends_at,'[)')) then raise exception 'الفترة تتداخل مع سجل حضور آخر' using errcode='PT409';end if;$s$,
 $s$r.attendance_session_id:=workforce_private.attendance_correction_target(r.employee_id,r.attendance_session_id,r.starts_at,r.ends_at);$s$);
 body:=replace(body,'update public.wf_employee_requests set status=p_decision,',
  'update public.wf_employee_requests set attendance_session_id=r.attendance_session_id,status=p_decision,');
 if body=old_body or position('الفترة تتداخل مع سجل حضور آخر' in body)>0 or position('set attendance_session_id=r.attendance_session_id,status=p_decision' in body)=0 then
  raise exception 'Attendance correction approval changed; review the patch';end if;
 execute replace(pg_get_functiondef(f),old_body,body);
end $$;
