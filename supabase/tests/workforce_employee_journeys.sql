begin;
select set_config('workforce.notification_wake','1',true);
set local role service_role;
do $$
#variable_conflict use_variable
declare owner uuid; e record; peer uuid; run uuid; id uuid; request_id uuid; review_id uuid; policy_id uuid; k text; r jsonb; v integer; item jsonb; settings jsonb; before_n bigint; before_d bigint;
begin
 select a.user_id into strict owner from public.wf_task_assignment_admins a join public.profiles p on p.id=a.user_id where p.role='admin' limit 1;
 run:=(public.wf_test_run('start',owner)->>'id')::uuid;
 select count(*) into before_n from public.wf_notifications;select count(*) into before_d from public.wf_notification_deliveries;
 for e in select s.id,s.user_id from public.wf_employees s where s.status='active' and s.user_id is not null loop
  select s.user_id into strict peer from public.wf_employees s where s.status='active' and s.id<>e.id limit 1;
  foreach k in array array['goal','review','advance','asset','onboarding','policy'] loop
   id:=gen_random_uuid();
   r:=public.wf_hr_command(owner,run,id,0,'create',jsonb_build_object('kind',k,'employee_id',e.id,'title','اختبار مسار '||k,'details','تفاصيل اختبار معزول لا يرسل رسائل','target','10','principal','100.01','installment','20','checklist',jsonb_build_array('خطوة أولى','خطوة ثانية')),gen_random_uuid());
   v:=(r->>'version')::int;
   insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
   values(e.user_id,'hr','اختبار حاجز الإرسال','جولة صامتة','/employee','hr:'||id||':probe');
   if exists(select 1 from public.wf_notifications where event_key='hr:'||id||':probe') then raise exception 'HR notification guard failed';end if;
   begin perform public.wf_hr_command(e.user_id,run,gen_random_uuid(),0,'create',jsonb_build_object('kind',k,'employee_id',e.id,'title','غير مسموح'),gen_random_uuid());raise exception 'Employee created admin record';exception when insufficient_privilege then null;end;
   if k<>'policy' then
    begin perform public.wf_hr_command(peer,run,id,v,'submit','{"response":"غير مسموح"}',gen_random_uuid());raise exception 'Peer wrote record';exception when insufficient_privilege then null;end;
   end if;
   if k='goal' then
    r:=public.wf_hr_command(e.user_id,run,id,v,'progress','{"progress":"10","response":"دليل الإنجاز"}',gen_random_uuid());v:=(r->>'version')::int;
    r:=public.wf_hr_command(e.user_id,run,id,v,'submit','{"response":"ملخص الإنجاز"}',gen_random_uuid());v:=(r->>'version')::int;
    begin perform public.wf_hr_command(e.user_id,run,id,v,'approve','{"note":"غير مسموح"}',gen_random_uuid());raise exception 'Self approval';exception when insufficient_privilege then null;end;
    r:=public.wf_hr_command(owner,run,id,v,'return','{"note":"أكمل الدليل"}',gen_random_uuid());v:=(r->>'version')::int;
    r:=public.wf_hr_command(e.user_id,run,id,v,'submit','{"response":"دليل محدث"}',gen_random_uuid());v:=(r->>'version')::int;
    perform public.wf_hr_command(owner,run,id,v,'approve','{"note":"اعتماد الإنجاز"}',gen_random_uuid());
   elsif k='review' then
    review_id:=id;r:=public.wf_hr_command(e.user_id,run,id,v,'self_review','{"self_score":4,"response":"تقييم ذاتي وخطة تطوير"}',gen_random_uuid());v:=(r->>'version')::int;
    perform public.wf_hr_command(owner,run,id,v,'approve','{"score":3,"note":"خطة تطوير معتمدة"}',gen_random_uuid());
   elsif k='advance' then
    begin perform public.wf_hr_command(e.user_id,run,id,v,'repay','{"amount":"1","note":"غير مسموح"}',gen_random_uuid());raise exception 'Employee recorded repayment';exception when insufficient_privilege then null;end;
    begin perform public.wf_hr_command(owner,run,id,v,'repay','{"amount":"101","note":"تجاوز المبلغ"}',gen_random_uuid());raise exception 'Overpayment accepted';exception when sqlstate 'PT400' then null;end;
    r:=public.wf_hr_command(owner,run,id,v,'repay','{"amount":"20.01","note":"مرجع قسط"}',gen_random_uuid());v:=(r->>'version')::int;
    perform public.wf_hr_command(owner,run,id,v,'repay','{"amount":"80","note":"مرجع تسوية"}',gen_random_uuid());
    if not exists(select 1 from public.wf_hr_items x where x.id=id and status='settled' and repaid=100.01) then raise exception 'Advance balance mismatch';end if;
   elsif k='asset' then
    r:=public.wf_hr_command(e.user_id,run,id,v,'acknowledge','{}',gen_random_uuid());v:=(r->>'version')::int;
    r:=public.wf_hr_command(e.user_id,run,id,v,'request_return','{"response":"العهدة سليمة"}',gen_random_uuid());v:=(r->>'version')::int;
    perform public.wf_hr_command(owner,run,id,v,'receive','{"note":"استلام سليم"}',gen_random_uuid());
   elsif k='onboarding' then
    begin perform public.wf_hr_command(e.user_id,run,id,v,'submit','{"response":"قائمة ناقصة"}',gen_random_uuid());raise exception 'Incomplete checklist submitted';exception when sqlstate 'PT409' then null;end;
    for item in select * from jsonb_array_elements((select checklist from public.wf_hr_items x where x.id=id)) loop
     r:=public.wf_hr_command(e.user_id,run,id,v,'check',jsonb_build_object('item_id',item->>'id','done',true),gen_random_uuid());v:=(r->>'version')::int;
    end loop;
    r:=public.wf_hr_command(e.user_id,run,id,v,'submit','{"response":"اكتملت التهيئة"}',gen_random_uuid());v:=(r->>'version')::int;
    perform public.wf_hr_command(owner,run,id,v,'approve','{"note":"اعتماد التهيئة"}',gen_random_uuid());
   elsif k='policy' then
    policy_id:=id;r:=public.wf_hr_command(owner,run,id,v,'publish','{}',gen_random_uuid());v:=(r->>'version')::int;
    perform public.wf_hr_command(e.user_id,run,id,v,'acknowledge','{}',gen_random_uuid());
    select version into v from public.wf_hr_items x where x.id=id;
    perform public.wf_hr_command(peer,run,id,v,'acknowledge','{}',gen_random_uuid());
    if (select count(*) from public.wf_policy_receipts where item_id=id)<>2 then raise exception 'Policy acknowledgements missing';end if;
   end if;
   select version into v from public.wf_hr_items x where x.id=id;
   begin perform public.wf_hr_command(owner,null,id,v,'publish','{}',gen_random_uuid());raise exception 'Live operation changed test record';exception when sqlstate 'PT409' then null;end;
  end loop;
  id:=gen_random_uuid();r:=public.wf_hr_command(e.user_id,run,id,0,'create',jsonb_build_object('kind','appeal','parent_id',review_id,'title','طلب مراجعة','details','دليل المراجعة'),gen_random_uuid());
  perform public.wf_hr_command(owner,run,id,(r->>'version')::int,'approve','{"note":"إعادة فتح التقييم"}',gen_random_uuid());
  if not exists(select 1 from public.wf_hr_items x where x.id=review_id and status='changes') then raise exception 'Appeal did not reopen review';end if;
  settings:='{"tasks":{"inbox":false,"email":false},"requests":{"inbox":true,"email":true},"finance":{"inbox":true,"email":true},"hr":{"inbox":false,"email":false},"reminders":{"inbox":true,"email":true}}';
  perform public.wf_preferences_command(e.user_id,run,0,settings);
  if exists(select 1 from public.wf_notification_preferences where user_id=e.user_id and test_run_id is null) then raise exception 'Test preferences changed real settings';end if;
 end loop;
 begin
  perform public.wf_hr_command(owner,null,gen_random_uuid(),0,'create','{"kind":"policy","title":"WF-TEST: unmarked","details":"اختبار منع الإرسال غير المعزول"}',gen_random_uuid());
  raise exception 'Unmarked test record accepted';
 exception when sqlstate 'PT400' then null;end;
 if (select count(*) from public.wf_notifications)<>before_n or (select count(*) from public.wf_notification_deliveries)<>before_d then raise exception 'Quiet journey emitted notification';end if;
 -- Transaction-only normal controls prove independent inbox/email preferences.
 select user_id into e from public.wf_employees where status='active' limit 1;
 perform public.wf_preferences_command(e.user_id,null,0,settings);
 id:=gen_random_uuid();insert into public.wf_notifications(id,recipient_id,kind,title,body,href,event_key) values(id,e.user_id,'hr','اختبار ملغى','اختبار','/employee/profile/assets','hr:rollback:'||id);
 if exists(select 1 from public.wf_notification_deliveries where notification_id=id) or (select inbox_visible from public.wf_notifications where wf_notifications.id=id) then raise exception 'Disabled channels were delivered';end if;
 settings:=jsonb_set(settings,'{hr,email}','true');perform public.wf_preferences_command(e.user_id,null,1,settings);
 id:=gen_random_uuid();insert into public.wf_notifications(id,recipient_id,kind,title,body,href,event_key) values(id,e.user_id,'hr','اختبار ملغى','اختبار','/employee/profile/assets','hr:rollback:'||id);
 if not exists(select 1 from public.wf_notification_deliveries where notification_id=id) or (select inbox_visible from public.wf_notifications where wf_notifications.id=id) then raise exception 'Independent email channel failed';end if;
 settings:=jsonb_set(settings,'{finance,email}','false');perform public.wf_preferences_command(e.user_id,null,2,settings);
 request_id:=gen_random_uuid();
 insert into public.wf_employee_requests(id,employee_id,kind,title,body,amount,fingerprint) values(request_id,(select s.id from public.wf_employees s where s.user_id=e.user_id),'advance','سلفة تكامل ملغاة','اختبار الربط داخل معاملة ملغاة',100.01,request_id::text);
 perform public.wf_decide_employee_request(request_id,owner,1,'approved','اعتماد اختبار تكامل ملغى');
 id:=gen_random_uuid();perform public.wf_hr_command(owner,null,id,0,'create',jsonb_build_object('kind','advance','employee_id',(select s.id from public.wf_employees s where s.user_id=e.user_id),'title','سلفة تكامل ملغاة','principal','100.01','installment','20','source_request',request_id),gen_random_uuid());
 if not exists(select 1 from public.wf_hr_items x where x.id=id and x.source_request=request_id and principal=100.01) then raise exception 'Approved advance request not linked';end if;
 if not exists(select 1 from public.wf_notifications n where n.event_key='hr:'||id||':1' and n.kind='payroll') then raise exception 'Advance not categorized as financial';end if;
 if exists(select 1 from public.wf_notification_deliveries d join public.wf_notifications n on n.id=d.notification_id where n.event_key='hr:'||id||':1') then raise exception 'Advance ignored financial email preference';end if;
end $$;
rollback;
select 'PASS: all eight journeys, both actors, authorization, immutable test scopes, exact balances, appeal reopening and independent notification channels; all rolled back' result;
