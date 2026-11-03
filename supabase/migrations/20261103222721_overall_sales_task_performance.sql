-- Preserve the task formula; managers configure only the monthly blend.
alter table public.wf_sales_months add column performance_sales_weight numeric not null default 60 check(performance_sales_weight between 0 and 100);

create or replace function public.wf_sales_command(p_actor uuid,p_month date,p_version integer,p_command text,p_payload jsonb,p_key uuid) returns jsonb
language plpgsql set search_path='' as $$
declare emp uuid;adm boolean;manager boolean; m public.wf_sales_months; old jsonb;result jsonb;receipt workforce_private.sales_receipts;
 e uuid;entity_id uuid;acc public.wf_crm_accounts;opp public.wf_crm_opportunities;act public.wf_sales_activities;
 plan public.wf_sales_plans;g jsonb;w jsonb;metric text;day date;reason text:=coalesce(p_payload->>'reason','');
 contract_total numeric;paid numeric;tid uuid;ref text;v text;
begin
 emp:=workforce_private.assert_task_actor(p_actor);adm:=emp is null;manager:=adm or exists(select 1 from public.wf_sales_settings where manager_employee_id=emp);
 if p_month is null or extract(day from p_month)<>1 or p_key is null or jsonb_typeof(p_payload)<>'object' then raise exception 'بيانات غير صحيحة' using errcode='PT400';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text||p_key::text,0));
 select * into receipt from workforce_private.sales_receipts where actor_id=p_actor and key=p_key;
 if found then
  if receipt.payload<>jsonb_build_object('month',p_month,'command',p_command,'payload',p_payload) then raise exception 'مفتاح الطلب مستخدم لعملية أخرى' using errcode='PT409';end if;
  return receipt.response;
 end if;
 if p_command='create_month' then
  if not adm then raise exception 'للإدارة فقط' using errcode='42501';end if;
  insert into public.wf_sales_months(month,closing_employee_id,team_target,note,created_by,performance_sales_weight) values(p_month,(p_payload->>'closing_employee_id')::uuid,coalesce((p_payload->>'team_target')::integer,1),coalesce(p_payload->>'note',''),p_actor,coalesce((p_payload->>'performance_sales_weight')::numeric,60));
  insert into public.wf_sales_settings(id,manager_employee_id) values(true,(p_payload->>'closing_employee_id')::uuid) on conflict(id) do nothing;
 end if;
 select * into m from public.wf_sales_months where month=p_month for update;
 if not found or (not adm and m.status='draft') then raise exception 'خطة الشهر غير متاحة' using errcode='P0002';end if;
 if p_command<>'create_month' and m.version is distinct from p_version then raise exception 'تغيرت بيانات المبيعات؛ حدّث الصفحة ثم أعد الإجراء' using errcode='PT409';end if;
 if m.status='closed' and p_command<>'reopen' then raise exception 'الشهر مغلق؛ يلزم إعادة فتحه من الإدارة' using errcode='PT409';end if;
 old:=to_jsonb(m);
 if p_command in ('create_month','save_plan','settings','publish','close','reopen','review','approve_activity') and not adm then raise exception 'للإدارة فقط' using errcode='42501';end if;
 if p_command in ('save_plan','settings','reopen','review','approve_activity','opportunity_edit','account_edit') and length(btrim(reason))<3 then raise exception 'وضح سبب الإجراء أو التعديل' using errcode='PT400';end if;
 if p_command='save_plan' then
  e:=(p_payload->>'employee_id')::uuid;
  if not exists(select 1 from public.wf_employees where id=e and status='active') then raise exception 'الموظفة غير نشطة' using errcode='PT400';end if;
  if jsonb_typeof(p_payload->'goals')<>'array' or jsonb_array_length(p_payload->'goals') not between 1 and 30 or jsonb_typeof(p_payload->'weekly')<>'array' then raise exception 'الأهداف غير صحيحة' using errcode='PT400';end if;
  if (select count(*)<>count(distinct x->>'key') from jsonb_array_elements(p_payload->'goals') x) then raise exception 'الأهداف مكررة' using errcode='PT400';end if;
  for g in select * from jsonb_array_elements(p_payload->'goals') loop
   if g->>'group' not in ('competition','role') or (g->>'target')::numeric<=0 or (g->>'weight')::numeric not between 0 and 100 or length(g->>'title')<2 then raise exception 'تحقق من الهدف والمستهدف والوزن' using errcode='PT400';end if;
  end loop;
  if exists(select 1 from (values('competition'),('role')) grp(name) where coalesce((select sum((x->>'weight')::numeric) from jsonb_array_elements(p_payload->'goals') x where x->>'group'=grp.name),0)<>100) then raise exception 'مجموع أوزان كل مجموعة يجب أن يساوي 100' using errcode='PT400';end if;
  if exists(select 1 from jsonb_array_elements(p_payload->'weekly') x where date_trunc('month',(x->>'due_on')::date)::date<>p_month) then raise exception 'موعد المهمة خارج الشهر' using errcode='PT400';end if;
  if exists(select 1 from jsonb_array_elements(p_payload->'weekly') x where nullif(x->>'starts_on','') is not null and (date_trunc('month',(x->>'starts_on')::date)::date<>p_month or (x->>'starts_on')::date>(x->>'due_on')::date)) then raise exception 'بداية المهمة يجب أن تكون داخل الشهر وقبل موعد التسليم' using errcode='PT400';end if;
  select to_jsonb(p) into old from public.wf_sales_plans p where month=p_month and employee_id=e;
  insert into public.wf_sales_plans(month,employee_id,competition_weight,goals,weekly) values(p_month,e,(p_payload->>'competition_weight')::numeric,p_payload->'goals',p_payload->'weekly') on conflict(month,employee_id) do update set competition_weight=excluded.competition_weight,goals=excluded.goals,weekly=excluded.weekly returning to_jsonb(wf_sales_plans) into result;
 elsif p_command='settings' then
  if not exists(select 1 from public.wf_employees where id=(p_payload->>'closing_employee_id')::uuid and status='active') then raise exception 'مسؤولة الإغلاق غير نشطة' using errcode='PT400';end if;
  update public.wf_sales_months set closing_employee_id=(p_payload->>'closing_employee_id')::uuid,team_target=(p_payload->>'team_target')::integer,performance_sales_weight=coalesce((p_payload->>'performance_sales_weight')::numeric,performance_sales_weight),note=coalesce(p_payload->>'note','') where month=p_month;
  update public.wf_sales_settings set manager_employee_id=(p_payload->>'manager_employee_id')::uuid where id=true;
 elsif p_command='publish' then
  if not exists(select 1 from public.wf_sales_plans where month=p_month) then raise exception 'أضف خطط الموظفات أولًا' using errcode='PT400';end if;
  update public.wf_sales_months set status='published' where month=p_month;
  for plan in select * from public.wf_sales_plans where month=p_month loop
   for w in select * from jsonb_array_elements(plan.weekly) order by (value->>'due_on')::date loop
    if not exists(select 1 from public.wf_sales_task_links where plan_id=plan.id and week_key=w->>'key') then
     tid:=gen_random_uuid();
     perform public.wf_task_command(p_actor,tid,null,'create',jsonb_build_object('title',w->>'title','description',w->>'details','completion_criteria','توثيق التنفيذ والأدلة داخل CRM؛ احتساب الأهداف من الأنشطة المعتمدة فقط.','assignee_id',plan.employee_id,'starts_at',coalesce(nullif(w->>'starts_on','')::date,greatest(coalesce((select max((x->>'due_on')::date)+1 from jsonb_array_elements(plan.weekly) x where (x->>'due_on')::date<(w->>'due_on')::date),p_month),least((now() at time zone 'Asia/Riyadh')::date,(w->>'due_on')::date)))::text||'T09:00:00+03:00','due_at',(w->>'due_on')||'T18:00:00+03:00','requires_approval',true),gen_random_uuid());
     insert into public.wf_sales_task_links(plan_id,week_key,task_id) values(plan.id,w->>'key',tid);
    end if;
   end loop;
  end loop;
 elsif p_command='close' then
  if exists(select 1 from public.wf_sales_plans p where p.month=p_month and not exists(select 1 from public.wf_sales_reviews r where r.month=p_month and r.employee_id=p.employee_id and r.status='published')) then raise exception 'اعتمد تقييم كل موظفة قبل إغلاق الشهر' using errcode='PT400';end if;
  if exists(select 1 from public.wf_sales_activities where month=p_month and status='pending') then raise exception 'راجع الإنجازات المعلقة قبل إغلاق الشهر' using errcode='PT400';end if;
  update public.wf_sales_months set status='closed' where month=p_month;
 elsif p_command='reopen' then
  update public.wf_sales_months set status='published' where month=p_month;
  update public.wf_sales_reviews set status='draft',snapshot=null where month=p_month;
 elsif p_command='self_review' then
  e:=case when adm then (p_payload->>'employee_id')::uuid else emp end;
  if not exists(select 1 from public.wf_sales_plans where month=p_month and employee_id=e) then raise exception 'الخطة غير متاحة' using errcode='P0002';end if;
  insert into public.wf_sales_reviews(month,employee_id,self_note) values(p_month,e,p_payload->>'self_note') on conflict(month,employee_id) do update set self_note=excluded.self_note,updated_at=now();
 elsif p_command='review' then
  e:=(p_payload->>'employee_id')::uuid;
  if not exists(select 1 from public.wf_sales_plans where month=p_month and employee_id=e) or jsonb_typeof(p_payload->'snapshot')<>'object' then raise exception 'التقييم غير مكتمل' using errcode='PT400';end if;
  insert into public.wf_sales_reviews(month,employee_id,manager_note,development,status,snapshot) values(p_month,e,p_payload->>'manager_note',p_payload->>'development','published',p_payload->'snapshot') on conflict(month,employee_id) do update set manager_note=excluded.manager_note,development=excluded.development,status='published',snapshot=excluded.snapshot,updated_at=now();
 elsif p_command in ('account_create','account_edit') then
  entity_id:=(p_payload->>'id')::uuid;e:=case when manager then coalesce(nullif(p_payload->>'owner_id','')::uuid,emp) else emp end;
  if not exists(select 1 from public.wf_sales_plans where month=p_month and employee_id=e) then raise exception 'الموظفة ليست ضمن خطة الشهر' using errcode='PT400';end if;
  if p_command='account_edit' then
   select * into acc from public.wf_crm_accounts where wf_crm_accounts.id=entity_id for update;
   if not found or (not manager and acc.owner_id<>emp) then raise exception 'السجل غير متاح للتعديل' using errcode='42501';end if;
   old:=to_jsonb(acc);
   update public.wf_crm_accounts set name=p_payload->>'name',name_key=p_payload->>'name_key',contact_name=p_payload->>'contact_name',email=p_payload->>'email',phone=p_payload->>'phone',website=p_payload->>'website',fit_reason=p_payload->>'fit_reason' where wf_crm_accounts.id=entity_id;
  else
   insert into public.wf_crm_accounts(id,name,name_key,contact_name,email,phone,website,fit_reason,owner_id) values(entity_id,p_payload->>'name',p_payload->>'name_key',p_payload->>'contact_name',p_payload->>'email',p_payload->>'phone',p_payload->>'website',p_payload->>'fit_reason',e);
   insert into public.wf_sales_activities(month,employee_id,account_id,metric,occurred_on,summary,created_by) values(p_month,e,entity_id,'prospect',(now() at time zone 'Asia/Riyadh')::date,'إضافة جهة مستهدفة: '||(p_payload->>'name'),p_actor);
  end if;
  result:=jsonb_build_object('id',entity_id);
 elsif p_command in ('opportunity_create','opportunity_edit') then
  entity_id:=(p_payload->>'id')::uuid;
  if p_command='opportunity_create' then
   select * into acc from public.wf_crm_accounts where wf_crm_accounts.id=(p_payload->>'account_id')::uuid for update;
   if not found or (not manager and acc.owner_id<>emp) then raise exception 'أضف الفرصة من حساب الجهة المسؤولة عنها' using errcode='42501';end if;
   e:=acc.owner_id;
   insert into public.wf_crm_opportunities(id,account_id,title,service,source_employee_id,closing_employee_id,followup_employee_id) values(entity_id,acc.id,p_payload->>'title',p_payload->>'service',e,m.closing_employee_id,e);
  end if;
  select * into opp from public.wf_crm_opportunities where wf_crm_opportunities.id=entity_id for update;
  if not found or (not manager and emp<>opp.source_employee_id) then raise exception 'الفرصة غير متاحة للتعديل' using errcode='42501';end if;
  old:=to_jsonb(opp);v:=coalesce(p_payload->>'stage',opp.stage);
  if not manager and emp<>opp.closing_employee_id and v<>opp.stage and (v not in ('target','contacted','qualified','lost','paused') or opp.stage not in ('target','contacted','qualified','lost','paused')) then raise exception 'اللقاءات والعروض والإغلاق لمسؤولة الإغلاق' using errcode='42501';end if;
  if v in ('qualified','meeting','proposal','negotiation','contracting') and (length(btrim(coalesce(p_payload->>'need','')))<3 or length(btrim(coalesce(p_payload->>'decision_maker','')))<2 or length(btrim(coalesce(p_payload->>'purchase_timing','')))<2) then raise exception 'أكمل الاحتياج وصاحب القرار وتوقيت الشراء' using errcode='PT400';end if;
  if opp.stage='won' and v<>'won' then raise exception 'راجع العقد المعتمد قبل تغيير الصفقة المغلقة' using errcode='PT409';end if;
  if v not in ('target','contacted','qualified','meeting','proposal','negotiation','contracting','won','lost','paused') then raise exception 'مرحلة غير صحيحة' using errcode='PT400';end if;
  if v in ('proposal','negotiation','contracting') and v<>opp.stage and not exists(select 1 from public.wf_sales_activities where opportunity_id=entity_id and wf_sales_activities.metric='quote' and status='approved') then raise exception 'هذه المرحلة تحتاج عرض سعر معتمدًا' using errcode='PT400';end if;
  if v='won' and not exists(select 1 from public.wf_sales_activities where opportunity_id=entity_id and wf_sales_activities.metric='contract' and status='approved') then raise exception 'الإغلاق الناجح يحتاج عقدًا موقعًا معتمدًا' using errcode='PT400';end if;
  if v='lost' and length(btrim(coalesce(p_payload->>'loss_reason','')))<3 then raise exception 'وضح سبب خسارة الفرصة' using errcode='PT400';end if;
  update public.wf_crm_opportunities set title=p_payload->>'title',service=p_payload->>'service',value=(p_payload->>'value')::numeric,need=p_payload->>'need',decision_maker=p_payload->>'decision_maker',purchase_timing=p_payload->>'purchase_timing',next_action=p_payload->>'next_action',next_on=nullif(p_payload->>'next_on','')::date,stage=v,loss_reason=coalesce(p_payload->>'loss_reason',''),request_id=nullif(p_payload->>'request_id','')::uuid,followup_employee_id=case when v in ('target','contacted') then opp.source_employee_id when v in ('qualified','meeting','proposal','negotiation','contracting','contract','won') then opp.closing_employee_id else opp.followup_employee_id end where wf_crm_opportunities.id=entity_id;
  if p_month=date_trunc('month',now() at time zone 'Asia/Riyadh')::date and v in ('contacted','qualified') and v is distinct from opp.stage and not exists(select 1 from public.wf_sales_activities a where a.opportunity_id=entity_id and a.month=p_month and a.metric=case when v='contacted' then 'contact' else 'qualified' end and a.status<>'rejected') then
   insert into public.wf_sales_activities(month,employee_id,account_id,opportunity_id,metric,occurred_on,summary,details,created_by) values(p_month,opp.source_employee_id,opp.account_id,entity_id,case when v='contacted' then 'contact' else 'qualified' end,(now() at time zone 'Asia/Riyadh')::date,case when v='contacted' then 'تم التواصل: ' else 'تأهيل وإحالة: ' end||(p_payload->>'title'),coalesce(p_payload->>'need','')||' — '||coalesce(p_payload->>'next_action',''),p_actor);
  end if;
  result:=jsonb_build_object('id',entity_id);
 elsif p_command='activity' then
  e:=case when adm then (p_payload->>'employee_id')::uuid else emp end;metric:=p_payload->>'metric';day:=(p_payload->>'occurred_on')::date;
  if date_trunc('month',day)::date<>p_month or day>(now() at time zone 'Asia/Riyadh')::date then raise exception 'تاريخ النشاط خارج الشهر أو في المستقبل' using errcode='PT400';end if;
  if metric in ('closed','prospect') then raise exception 'هذا المؤشر يحتسب من مصدره تلقائيًا' using errcode='PT400';end if;
  if not exists(select 1 from public.wf_sales_plans where month=p_month and employee_id=e) then raise exception 'لا توجد خطة للموظفة' using errcode='PT400';end if;
  if nullif(p_payload->>'opportunity_id','') is not null then
   select * into opp from public.wf_crm_opportunities where wf_crm_opportunities.id=(p_payload->>'opportunity_id')::uuid for update;
   if not found or (not manager and emp<>opp.source_employee_id) then raise exception 'الفرصة غير متاحة' using errcode='42501';end if;
   if nullif(p_payload->>'account_id','') is not null and (p_payload->>'account_id')::uuid<>opp.account_id then raise exception 'الجهة لا تطابق الفرصة' using errcode='PT400';end if;
  else opp:=null;end if;
  if metric in ('qualified','meeting','quote','contract','collection','technical_study','technical_quote') and opp.id is null then raise exception 'اربط الإنجاز بفرصة' using errcode='PT400';end if;
  if metric in ('meeting','quote','contract','collection') and not adm and e<>opp.closing_employee_id then raise exception 'هذا الإجراء لمسؤولة إغلاق الفرصة' using errcode='42501';end if;
  if opp.id is not null and metric in ('contact','followup','qualified') then e:=opp.source_employee_id;end if;
  if opp.id is not null and metric in ('meeting','quote','contract','collection') then e:=opp.closing_employee_id;end if;
  if metric='qualified' and (length(btrim(opp.need))<3 or length(btrim(opp.decision_maker))<2 or length(btrim(opp.purchase_timing))<2) then raise exception 'أكمل الاحتياج وصاحب القرار وتوقيت الشراء قبل التأهيل' using errcode='PT400';end if;
  if metric in ('contact','followup') and coalesce(opp.account_id,nullif(p_payload->>'account_id','')::uuid) is null then raise exception 'اختر الجهة' using errcode='PT400';end if;
  if opp.id is null and nullif(p_payload->>'account_id','') is not null and not manager and not exists(select 1 from public.wf_crm_accounts where wf_crm_accounts.id=(p_payload->>'account_id')::uuid and owner_id=emp) then raise exception 'الجهة غير متاحة للتسجيل باسمك' using errcode='42501';end if;
  if nullif(p_payload->>'evidence_attachment_id','') is not null and not exists(select 1 from public.wf_crm_files where id=(p_payload->>'evidence_attachment_id')::uuid and opportunity_id=opp.id and archived_at is null) then raise exception 'اختر مرفقًا متاحًا من الفرصة نفسها' using errcode='PT400';end if;
  if metric in ('quote','contract','collection') and (length(btrim(coalesce(p_payload->>'reference','')))<2 or (p_payload->>'amount')::numeric<=0 or (metric in ('contract','collection') and length(btrim(coalesce(p_payload->>'evidence_url','')))<8 and nullif(p_payload->>'evidence_attachment_id','') is null)) then raise exception 'أرفق المرجع والمبلغ ورابطًا أو ملفًا للإثبات' using errcode='PT400';end if;
  if metric='quote' and length(btrim(coalesce(p_payload->>'details','')))<5 then raise exception 'أكمل نطاق العرض وشروطه' using errcode='PT400';end if;
  insert into public.wf_sales_activities(month,employee_id,account_id,opportunity_id,metric,goal_key,occurred_on,summary,evidence_url,reference,amount,details,created_by,evidence_attachment_id)
   values(p_month,e,coalesce(opp.account_id,nullif(p_payload->>'account_id','')::uuid),opp.id,metric,coalesce(p_payload->>'goal_key',''),day,p_payload->>'summary',coalesce(p_payload->>'evidence_url',''),coalesce(p_payload->>'reference',''),coalesce((p_payload->>'amount')::numeric,0),coalesce(p_payload->>'details',''),p_actor,nullif(p_payload->>'evidence_attachment_id','')::uuid) returning to_jsonb(wf_sales_activities) into result;
 elsif p_command='approve_activity' then
  select * into act from public.wf_sales_activities where wf_sales_activities.id=(p_payload->>'id')::uuid and month=p_month for update;
  if not found then raise exception 'النشاط غير متاح' using errcode='P0002';end if;
  if p_payload->>'status' not in ('approved','rejected') then raise exception 'قرار غير صحيح' using errcode='PT400';end if;
  old:=to_jsonb(act);
  if p_payload->>'status'='approved' and act.evidence_attachment_id is not null and not exists(select 1 from public.wf_crm_files where id=act.evidence_attachment_id and opportunity_id=act.opportunity_id and archived_at is null) then raise exception 'مرفق الإثبات غير متاح؛ راجع النشاط' using errcode='PT400';end if;
  if act.metric in ('contract','collection') and p_payload->>'status'='approved' then
   perform 1 from public.wf_crm_opportunities where wf_crm_opportunities.id=act.opportunity_id for update;
   select max(amount) into contract_total from public.wf_sales_activities where opportunity_id=act.opportunity_id and wf_sales_activities.metric='contract' and status='approved' and wf_sales_activities.id<>act.id;
   select coalesce(sum(amount),0) into paid from public.wf_sales_activities where opportunity_id=act.opportunity_id and wf_sales_activities.metric='collection' and status='approved' and wf_sales_activities.id<>act.id;
   if act.metric='collection' and (contract_total is null or paid+act.amount>contract_total) then raise exception 'التحصيل يحتاج عقدًا معتمدًا ولا يتجاوز قيمته' using errcode='PT400';end if;
   if act.metric='contract' and (contract_total is not null or paid>act.amount) then raise exception 'يوجد عقد معتمد للفرصة؛ راجع السجل قبل الاستبدال' using errcode='PT409';end if;
  end if;
  if act.metric='contract' and p_payload->>'status'='rejected' and exists(select 1 from public.wf_sales_activities where opportunity_id=act.opportunity_id and wf_sales_activities.metric='collection' and status='approved') then raise exception 'راجع التحصيلات المعتمدة قبل إلغاء العقد' using errcode='PT409';end if;
  update public.wf_sales_activities set status=p_payload->>'status',decision_note=reason,decided_by=p_actor,decided_at=now() where wf_sales_activities.id=act.id;
  if act.opportunity_id is not null then
   if exists(select 1 from public.wf_sales_activities where opportunity_id=act.opportunity_id and wf_sales_activities.metric='contract' and status='approved') then
    update public.wf_crm_opportunities set stage='won',followup_employee_id=closing_employee_id where wf_crm_opportunities.id=act.opportunity_id;
   elsif exists(select 1 from public.wf_crm_opportunities where wf_crm_opportunities.id=act.opportunity_id and stage in ('won','contract')) then
    update public.wf_crm_opportunities set stage='negotiation' where wf_crm_opportunities.id=act.opportunity_id;
   end if;
   if p_payload->>'status'='approved' and act.metric in ('contact','qualified','meeting','quote') then
    update public.wf_crm_opportunities set stage=case act.metric when 'contact' then 'contacted' when 'qualified' then 'qualified' when 'meeting' then 'meeting' else 'proposal' end,followup_employee_id=case when act.metric='contact' then source_employee_id else closing_employee_id end where wf_crm_opportunities.id=act.opportunity_id and array_position(array['target','contacted','qualified','meeting','proposal','negotiation','contracting','contract','won'],stage)<array_position(array['target','contacted','qualified','meeting','proposal','negotiation','contracting','contract','won'],case act.metric when 'contact' then 'contacted' when 'qualified' then 'qualified' when 'meeting' then 'meeting' else 'proposal' end);
   end if;
   if act.metric='qualified' and p_payload->>'status'='approved' then update public.wf_crm_opportunities set followup_employee_id=closing_employee_id where wf_crm_opportunities.id=act.opportunity_id;end if;
  end if;
 elsif p_command<>'create_month' then raise exception 'الإجراء غير معروف' using errcode='PT400';
 end if;
 -- Any changed evidence or target invalidates the published assessment until reviewed again.
 if p_command not in ('review','close','self_review') then update public.wf_sales_reviews set status='draft',snapshot=null where month=p_month;end if;
 update public.wf_sales_months set version=version+1,updated_at=now() where month=p_month returning to_jsonb(wf_sales_months) into g;
 result:=coalesce(result,'{}')||jsonb_build_object('version',(g->>'version')::integer);
 insert into public.wf_sales_audit(month,actor_id,action,reason,before_data,after_data) values(p_month,p_actor,p_command,reason,old,jsonb_build_object('payload',p_payload,'result',result));
 insert into workforce_private.sales_receipts values(p_actor,p_key,jsonb_build_object('month',p_month,'command',p_command,'payload',p_payload),result);
 return result;
end $$;
revoke all on function public.wf_sales_snapshot(uuid,date),public.wf_sales_command(uuid,date,integer,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.wf_sales_snapshot(uuid,date),public.wf_sales_command(uuid,date,integer,text,jsonb,uuid) to service_role;
