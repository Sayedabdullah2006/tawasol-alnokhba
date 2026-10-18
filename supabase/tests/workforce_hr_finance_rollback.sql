-- Production-safe domain tests. No rows or worker wakes survive this transaction.
-- Real accounts are actors; no passwords, identities or actual payments change.
begin;
select set_config('workforce.notification_wake','1',true);
set local role service_role;
do $$
#variable_conflict use_variable
declare owner uuid; e record; payroll uuid; clock_id uuid; request_id uuid; change_id uuid; document_id uuid;
 v integer; revision integer; result jsonb; payload jsonb; kind text; month date:=date '2099-01-01';
begin
 select user_id into strict owner from public.wf_task_assignment_admins a join public.profiles p on p.id=a.user_id where p.role='admin' limit 1;
 for e in select id,user_id from public.wf_employees where status='active' and user_id is not null loop
  -- Isolate clock behavior even if a real open attendance record exists.
  -- This nested exception rolls back everything in the block, including the
  -- temporary close of an existing record, before any other session can see it.
  begin
   update public.wf_attendance_sessions set checked_out=checked_in+interval '1 second' where employee_id=e.id and checked_out is null;
   clock_id:=gen_random_uuid();
   result:=public.wf_clock_attendance(e.user_id,'in',clock_id);
   if result->>'employee_id'<>e.id::text or abs(extract(epoch from ((result->>'checked_in')::timestamptz-clock_timestamp())))>10 then raise exception 'Clock identity/time mismatch'; end if;
   if public.wf_clock_attendance(e.user_id,'in',clock_id) is distinct from result then raise exception 'Clock retry mismatch'; end if;
   begin perform public.wf_clock_attendance(e.user_id,'in',gen_random_uuid());raise exception 'Double check-in accepted';exception when sqlstate 'PT409' then null;end;
   result:=public.wf_clock_attendance(e.user_id,'out',gen_random_uuid());
   if result->>'checked_out' is null then raise exception 'Checkout missing'; end if;
   begin perform public.wf_clock_attendance(e.user_id,'out',gen_random_uuid());raise exception 'Double checkout accepted';exception when sqlstate 'PT409' then null;end;
   raise sqlstate 'ZX001' using message='rollback attendance block';
  exception when sqlstate 'ZX001' then null;end;

  perform public.wf_save_attendance_settings(owner,e.id,array[0,1,2,3,4,6],'09:00','17:00',2099,10,'اختبار داخل معاملة ملغاة','flexible',480);
  begin perform public.wf_save_attendance_settings(e.user_id,e.id,array[0],'09:00','17:00',2099,10,'غير مسموح','flexible',480);raise exception 'Employee changed schedule';exception when insufficient_privilege then null;end;
  -- All nine request kinds; only leave/corrections have an automatic HR effect.
  foreach kind in array array['general','leave','permission','remote-work','expenses','advance','letter','payroll-review','attendance-correction'] loop
   request_id:=gen_random_uuid();
   insert into public.wf_employee_requests(id,employee_id,kind,title,body,starts_at,ends_at,amount,fingerprint)
   values(request_id,e.id,kind,'اختبار معاملة ملغاة','اختبار طلب دون حفظ أو إرسال',
    case when kind='attendance-correction' then '2000-01-02T09:00:00+03:00'::timestamptz when kind in ('leave','permission','remote-work') then '2099-01-04T09:00:00+03:00'::timestamptz end,
    case when kind='attendance-correction' then '2000-01-02T17:00:00+03:00'::timestamptz when kind in ('leave','permission','remote-work') then '2099-01-05T17:00:00+03:00'::timestamptz end,
    case when kind in ('expenses','advance') then 100 end,request_id::text);
   begin perform public.wf_decide_employee_request(request_id,e.user_id,1,'approved','قرار غير مسموح');raise exception 'Employee self approval';exception when insufficient_privilege then null;end;
   perform public.wf_decide_employee_request(request_id,owner,1,'approved','اعتماد اختبار معاملة ملغاة');
   begin perform public.wf_decide_employee_request(request_id,owner,1,'approved','قرار مكرر');raise exception 'Stale request approval';exception when sqlstate 'PT409' then null;end;
   if kind='leave' then
    if not exists(select 1 from public.wf_leave_movements m where m.request_id=request_id and m.days>0) then raise exception 'Leave balance not deducted';end if;
   end if;
   if kind='attendance-correction' and not exists(select 1 from public.wf_attendance_sessions where employee_id=e.id and business_date='2000-01-02' and source='correction') then raise exception 'Correction not applied';end if;
  end loop;

  payroll:=gen_random_uuid();
  if exists(select 1 from public.wf_monthly_payroll p where p.employee_id=e.id and p.month=month) then raise exception 'Reserved test month occupied';end if;
  payload:='{"basic_amount":"5000.01","allowances_amount":"500.02","items":[{"title":"حافز ثابت","mode":"fixed","value":"250.10","reference":"مرجع اختبار"},{"title":"حافز نسبي","mode":"percent","value":"7.125","basis_amount":"1000.01","reference":"مرجع اختبار نسبة"}],"deductions":[{"title":"حسم التأمينات","kind":"insurance","amount":"100.00","reference":"اختبار فقط"}],"reason":"اختبار معاملة ملغاة"}';
  begin perform public.wf_payroll_command(e.user_id,payroll,e.id,month,0,'save',payload,gen_random_uuid());raise exception 'Employee saved salary';exception when insufficient_privilege then null;end;
  result:=public.wf_payroll_command(owner,payroll,e.id,month,0,'save',payload,gen_random_uuid());
  if not exists(select 1 from public.wf_monthly_payroll where id=payroll and gross_amount=5821.38 and deductions_amount=100 and total_amount=5721.38) then raise exception 'Payroll decimal/deduction mismatch';end if;
  v:=(result->>'version')::int;
  result:=public.wf_payroll_command(owner,payroll,e.id,month,v,'approve','{"reason":"اعتماد اختبار"}',gen_random_uuid());
  v:=(result->>'version')::int;
  begin perform public.wf_payroll_command(owner,payroll,e.id,month,v,'save',payload,gen_random_uuid());raise exception 'Approved salary edited';exception when sqlstate 'PT409' then null;end;
  result:=public.wf_payroll_command(owner,payroll,e.id,month,v,'pay','{"amount":"100.00","reference":"اختبار سجل فقط لا دفع حقيقي","reason":"اختبار معاملة ملغاة"}',gen_random_uuid());
  v:=(result->>'version')::int;
  begin perform public.wf_payroll_command(owner,payroll,e.id,month,v,'pay','{"amount":"99999","reference":"تجاوز تجريبي","reason":"اختبار حد المبلغ"}',gen_random_uuid());raise exception 'Overpayment accepted';exception when sqlstate 'PT400' then null;end;
  begin perform public.wf_payroll_command(owner,payroll,e.id,month,v,'reopen','{"reason":"اختبار إعادة الفتح"}',gen_random_uuid());raise exception 'Paid salary reopened';exception when sqlstate 'PT409' then null;end;
  perform public.wf_payroll_command(owner,payroll,e.id,month,v,'pay','{"amount":"5621.38","reference":"تكملة اختبار سجل فقط","reason":"اختبار معاملة ملغاة"}',gen_random_uuid());
  if not exists(select 1 from public.wf_monthly_payroll where id=payroll and status='paid' and paid_amount=total_amount) then raise exception 'Final payment mismatch';end if;

  select coalesce(max(c.revision),0) into revision from public.wf_compensation_versions c where employee_id=e.id;
  perform public.wf_save_compensation(owner,e.id,revision,'{"basic_salary":"5000","effective_from":"2099-01-01","allowances":[],"commissions":[{"name":"عمولة اختبار","mode":"percent","value":"30","basis":"profit","conditions":"اختبار فقط"}],"reason":"اختبار معاملة ملغاة"}',gen_random_uuid());
  begin perform public.wf_save_compensation(e.user_id,e.id,revision,'{}',gen_random_uuid());raise exception 'Employee changed terms';exception when insufficient_privilege then null;end;

  change_id:=gen_random_uuid();
  insert into public.wf_profile_change_requests(id,employee_id,field,proposed_value,reason,request_key) values(change_id,e.id,'bank_name','بنك اختبار','اختبار ملغى',gen_random_uuid());
  begin perform public.wf_decide_profile_change(change_id,e.user_id,'approved','غير مسموح');raise exception 'Employee approved profile';exception when insufficient_privilege then null;end;
  perform public.wf_decide_profile_change(change_id,owner,'approved','اعتماد اختبار ملغى');
  if not exists(select 1 from public.wf_employee_bank_details where employee_id=e.id and bank_name='بنك اختبار') then raise exception 'Profile decision not applied';end if;
  document_id:=gen_random_uuid();
  insert into public.wf_employee_documents(id,employee_id,title,object_path,filename,mime_type,size_bytes,created_by) values(document_id,e.id,'مستند اختبار ملغى','rollback/'||document_id,'check.png','image/png',4,e.user_id);
  perform public.wf_archive_document(document_id,owner,true);
  perform public.wf_archive_document(document_id,owner,false);
  if not exists(select 1 from public.wf_employee_documents where id=document_id and archived_at is null) then raise exception 'Document restoration failed';end if;
 end loop;
end $$;
rollback;
select 'PASS: both real actors: clock/retry/conflicts, schedule, nine request kinds, leave/correction effects, payroll/incentives/insurance/payments/authorization, compensation, profile decisions and document archive/restore; ALL ROLLED BACK, no worker wake' result;
