create or replace function public.wf_hr_command(p_actor uuid,p_run uuid,p_id uuid,p_version integer,p_command text,p_payload jsonb,p_key uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare employee uuid; r public.wf_hr_items; parent public.wf_hr_items; previous jsonb; k text; f text; allowed text[];
 value numeric; checks jsonb:='[]'; c jsonb; recipient uuid; destination text; new_status text;
begin
 employee:=workforce_private.assert_task_actor(p_actor);
 if p_run is not null then perform public.wf_test_run('assert',p_actor,p_run);end if;
 previous:=workforce_private.command_retry(p_actor,p_key,'hr:'||p_command,p_id,jsonb_build_object('run',p_run,'data',p_payload));
 if previous is not null then return previous;end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or length(p_payload::text)>20000 then raise sqlstate 'PT400' using message='بيانات الإجراء غير صحيحة';end if;
 allowed:=case p_command when 'create' then array['kind','employee_id','parent_id','title','details','due_on','target','principal','installment','checklist','source_request']
 when 'progress' then array['progress','response'] when 'self_review' then array['self_score','response'] when 'submit' then array['response']
 when 'approve' then array['note','score'] when 'return' then array['note'] when 'reject' then array['note']
 when 'repay' then array['amount','note'] when 'check' then array['item_id','done'] when 'request_return' then array['response']
 when 'receive' then array['note'] when 'acknowledge' then array[]::text[] when 'publish' then array[]::text[] else null end;
 if allowed is null then raise sqlstate 'PT400' using message='إجراء غير صحيح';end if;
 for f in select jsonb_object_keys(p_payload) loop if f<>all(allowed) then raise sqlstate 'PT400' using message='حقل غير مسموح';end if;end loop;
 if p_command='create' then
  k:=p_payload->>'kind';
  if k is null or k<>all(array['goal','review','appeal','advance','asset','onboarding','policy']) then raise sqlstate 'PT400' using message='قسم غير صحيح';end if;
  if employee is not null and k<>'appeal' then raise insufficient_privilege;end if;
  if coalesce(length(btrim(p_payload->>'title')),0) not between 3 and 150 or coalesce(length(p_payload->>'details'),0)>10000 then raise sqlstate 'PT400' using message='أكمل العنوان والتفاصيل';end if;
  if k='policy' and coalesce(length(btrim(p_payload->>'details')),0)<10 then raise sqlstate 'PT400' using message='أضف نص السياسة';end if;
  if k='appeal' then
   select * into parent from public.wf_hr_items where id=(p_payload->>'parent_id')::uuid for update;
   if parent.id is null or parent.kind<>'review' or parent.status<>'published' or parent.test_run_id is distinct from p_run or (employee is not null and parent.employee_id<>employee) then raise insufficient_privilege;end if;
   if coalesce(length(btrim(p_payload->>'details')),0)<3 then raise sqlstate 'PT400' using message='أدخل سبب المراجعة';end if;
  elsif p_payload ? 'parent_id' then raise sqlstate 'PT400' using message='الربط للتقييم فقط';end if;
  if k<>'policy' and not exists(select 1 from public.wf_employees where id=coalesce(parent.employee_id,(p_payload->>'employee_id')::uuid) and status='active') then raise sqlstate 'PT400' using message='اختر الموظفة';end if;
  if k='onboarding' then
   if jsonb_typeof(p_payload->'checklist') is distinct from 'array' or jsonb_array_length(p_payload->'checklist') not between 1 and 50 then raise sqlstate 'PT400' using message='أضف خطوات التهيئة';end if;
   for c in select * from jsonb_array_elements(p_payload->'checklist') loop
    if jsonb_typeof(c) is distinct from 'string' or length(btrim(c#>>'{}')) not between 1 and 300 then raise sqlstate 'PT400' using message='خطوة غير صحيحة';end if;
    checks:=checks||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'title',btrim(c#>>'{}'),'done',false));
   end loop;
  end if;
  if k='advance' and (coalesce(p_payload->>'principal','') !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$' or (p_payload->>'principal')::numeric<=0 or coalesce(p_payload->>'installment','0') !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$') then raise sqlstate 'PT400' using message='أدخل مبلغ السلفة والقسط';end if;
  if k='goal' and (coalesce(p_payload->>'target','') !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$' or (p_payload->>'target')::numeric<=0) then raise sqlstate 'PT400' using message='أدخل المستهدف';end if;
  if p_payload ? 'source_request' then
   if k<>'advance' or not exists(select 1 from public.wf_employee_requests q where q.id=(p_payload->>'source_request')::uuid and q.employee_id=(p_payload->>'employee_id')::uuid and q.kind='advance' and q.status='approved' and q.amount=(p_payload->>'principal')::numeric and q.test_run_id is not distinct from p_run) then raise sqlstate 'PT400' using message='طلب السلفة غير معتمد أو المبلغ مختلف';end if;
  end if;
  insert into public.wf_hr_items(id,kind,employee_id,parent_id,title,details,due_on,target,principal,installment,checklist,status,source_request,created_by,test_run_id)
  values(p_id,k,case when k='policy' then null else coalesce(parent.employee_id,(p_payload->>'employee_id')::uuid) end,parent.id,btrim(p_payload->>'title'),coalesce(p_payload->>'details',''),nullif(p_payload->>'due_on','')::date,
   case when k='goal' then (p_payload->>'target')::numeric else 100 end,case when k='advance' then (p_payload->>'principal')::numeric else 0 end,case when k='advance' then coalesce((p_payload->>'installment')::numeric,0) else 0 end,checks,case when k='appeal' then 'pending' else 'active' end,nullif(p_payload->>'source_request','')::uuid,p_actor,p_run) returning * into r;
 else
  select * into r from public.wf_hr_items where id=p_id for update;
  if r.id is null then raise no_data_found;end if;
  if r.test_run_id is distinct from p_run then raise sqlstate 'PT409' using message='هذا السجل خارج جولة العمل الحالية';end if;
  if employee is not null and r.employee_id is distinct from employee and r.kind<>'policy' then raise insufficient_privilege;end if;
  if p_version is distinct from r.version then raise sqlstate 'PT409' using message='تغير السجل؛ حدّث الصفحة';end if;
  if coalesce(length(p_payload->>'response'),0)>10000 or coalesce(length(p_payload->>'note'),0)>10000 then raise sqlstate 'PT400' using message='النص طويل جدًا';end if;
  if p_command in ('approve','return','reject','receive','repay','publish') and employee is not null then raise insufficient_privilege;end if;
  if p_command='progress' then
   if r.kind<>'goal' or r.status<>all(array['active','changes']) then raise sqlstate 'PT409' using message='الهدف غير قابل للتحديث';end if;
   if coalesce(p_payload->>'progress','') !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$' then raise sqlstate 'PT400' using message='القيمة غير صحيحة';end if;
   update public.wf_hr_items set progress=(p_payload->>'progress')::numeric,response=coalesce(p_payload->>'response','') where id=p_id;
  elsif p_command='self_review' then
   if r.kind<>'review' or r.status<>all(array['active','changes']) then raise sqlstate 'PT409' using message='التقييم مغلق';end if;
   if coalesce(p_payload->>'self_score','') !~ '^[1-5]$' or coalesce(length(btrim(p_payload->>'response')),0)<3 then raise sqlstate 'PT400' using message='أدخل التقييم الذاتي والتعليق';end if;
   update public.wf_hr_items set self_score=(p_payload->>'self_score')::int,response=p_payload->>'response',status='submitted' where id=p_id;
  elsif p_command='check' then
   if r.kind<>'onboarding' or r.status<>all(array['active','changes']) then raise sqlstate 'PT409' using message='القائمة مغلقة';end if;
   if jsonb_typeof(p_payload->'done') is distinct from 'boolean' or not exists(select 1 from jsonb_array_elements(r.checklist) x where x->>'id'=p_payload->>'item_id') then raise sqlstate 'PT400' using message='الخطوة غير صحيحة';end if;
   update public.wf_hr_items set checklist=(select jsonb_agg(case when x->>'id'=p_payload->>'item_id' then jsonb_set(x,'{done}',p_payload->'done') else x end order by n) from jsonb_array_elements(r.checklist) with ordinality a(x,n)) where id=p_id;
  elsif p_command='submit' then
   if r.kind<>all(array['goal','onboarding']) or r.status<>all(array['active','changes']) then raise sqlstate 'PT409' using message='السجل غير قابل للتسليم';end if;
   if r.kind='onboarding' and exists(select 1 from jsonb_array_elements(r.checklist) x where not(x->>'done')::boolean) then raise sqlstate 'PT409' using message='أكمل خطوات القائمة أولًا';end if;
   if coalesce(length(btrim(p_payload->>'response')),0)<3 then raise sqlstate 'PT400' using message='أضف ملخص الإنجاز';end if;
   update public.wf_hr_items set status='submitted',response=p_payload->>'response' where id=p_id;
  elsif p_command in ('approve','return','reject') then
   if (r.kind in ('goal','onboarding','review') and r.status<>'submitted') or (r.kind='appeal' and r.status<>'pending') or r.kind not in ('goal','onboarding','review','appeal') then raise sqlstate 'PT409' using message='السجل غير معلق للمراجعة';end if;
   if coalesce(length(btrim(p_payload->>'note')),0)<3 then raise sqlstate 'PT400' using message='أضف القرار';end if;
   if r.kind='review' and p_command='approve' and coalesce(p_payload->>'score','') !~ '^[1-5]$' then raise sqlstate 'PT400' using message='اختر التقييم النهائي';end if;
   if p_command='reject' and r.kind<>'appeal' then raise sqlstate 'PT400' using message='استخدم إعادة للتعديل';end if;
   if p_command='return' and r.kind='appeal' then raise sqlstate 'PT400' using message='اختر قبول المراجعة أو رفضها';end if;
   new_status:=case p_command when 'return' then 'changes' when 'reject' then 'rejected' else case when r.kind='review' then 'published' else 'approved' end end;
   update public.wf_hr_items set status=new_status,admin_note=p_payload->>'note',score=case when r.kind='review' and p_command='approve' then (p_payload->>'score')::int else score end where id=p_id;
   if r.kind='appeal' and p_command='approve' then
    update public.wf_hr_items set status='changes',admin_note=p_payload->>'note',version=version+1,updated_at=now() where id=r.parent_id and test_run_id is not distinct from p_run;
    insert into public.wf_hr_events(item_id,actor_id,action,note) values(r.parent_id,p_actor,'appeal_accepted',p_payload->>'note');
   end if;
  elsif p_command='repay' then
   if r.kind<>'advance' or r.status<>'active' then raise sqlstate 'PT409' using message='السلفة مغلقة';end if;
   if coalesce(p_payload->>'amount','') !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$' or coalesce(length(btrim(p_payload->>'note')),0)<3 then raise sqlstate 'PT400' using message='أدخل مبلغ السداد ومرجعه';end if;
   value:=(p_payload->>'amount')::numeric;
   if value<=0 or value>r.principal-r.repaid then raise sqlstate 'PT400' using message='مبلغ السداد يتجاوز المتبقي';end if;
   update public.wf_hr_items set repaid=repaid+value,status=case when repaid+value=principal then 'settled' else 'active' end where id=p_id;
  elsif p_command='acknowledge' then
   if employee is null then raise insufficient_privilege;end if;
   if r.kind='policy' and r.status='published' then
    insert into public.wf_policy_receipts(item_id,user_id) values(p_id,p_actor) on conflict do nothing;
   elsif r.kind='asset' and r.status='active' then update public.wf_hr_items set status='approved' where id=p_id;
   else raise sqlstate 'PT409' using message='السجل غير متاح للإقرار';end if;
  elsif p_command='request_return' then
   if r.kind<>'asset' or r.status<>'approved' or coalesce(length(btrim(p_payload->>'response')),0)<3 then raise sqlstate 'PT409' using message='أدخل سبب الإرجاع لعهدة مستلمة';end if;
   update public.wf_hr_items set status='return_requested',response=p_payload->>'response' where id=p_id;
  elsif p_command='receive' then
   if r.kind<>'asset' or r.status<>'return_requested' or coalesce(length(btrim(p_payload->>'note')),0)<3 then raise sqlstate 'PT409' using message='العهدة ليست بانتظار الاستلام';end if;
   update public.wf_hr_items set status='returned',admin_note=p_payload->>'note' where id=p_id;
  elsif p_command='publish' then
   if r.kind<>'policy' or r.status<>'active' then raise sqlstate 'PT409' using message='السياسة منشورة بالفعل';end if;
   update public.wf_hr_items set status='published' where id=p_id;
  else raise insufficient_privilege;end if;
  update public.wf_hr_items set version=version+1,updated_at=now() where id=p_id returning * into r;
 end if;
 insert into public.wf_hr_events(item_id,actor_id,action,amount,note) values(p_id,p_actor,p_command,value,coalesce(p_payload->>'note',p_payload->>'response',''));
 -- Scoped tests never insert an inbox row or wake email delivery.
 if p_run is null and p_command not in ('check','progress','acknowledge') then
  destination:=case r.kind when 'goal' then 'performance/goals' when 'review' then 'performance/reviews' when 'appeal' then 'requests/performance-review' when 'advance' then 'finance/advances' when 'asset' then 'profile/assets' when 'onboarding' then 'profile/onboarding' else 'profile/policies' end;
  if employee is null then
   for recipient in select user_id from public.wf_employees where status='active' and (id=r.employee_id or r.kind='policy' and r.status='published') loop
    insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key) values(recipient,case when r.kind='advance' then 'payroll' else 'hr' end,r.title,'تم تحديث السجل','/employee/'||destination,'hr:'||r.id||':'||r.version);
   end loop;
  else
   insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key) select id,'hr',r.title,'بانتظار مراجعة الإدارة','/admin/workforce/people?section='||r.kind,'hr:'||r.id||':'||r.version from public.profiles where role='admin';
  end if;
 end if;
 return workforce_private.save_command(p_actor,p_key,'hr:'||p_command,p_id,jsonb_build_object('run',p_run,'data',p_payload),jsonb_build_object('id',r.id,'version',r.version));
end $$;
