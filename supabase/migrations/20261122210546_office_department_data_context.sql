-- Read-only host adapters. Service role is transport, never the user's authority.
-- Permissions are checked again on every call; no arbitrary SQL, files or secrets.
create function public.vo_host_department_context(p_actor uuid,p_workspace text,p_department text,p_agent text,p_from date,p_until date) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
 emp uuid; adm boolean; sales_manager boolean; tick timestamptz:=workforce_private.work_now();
 start_at timestamptz; end_at timestamptz; sections jsonb:='[]'; facts jsonb; rows jsonb; total bigint; pattern text;
 executive boolean:=p_department='leadership'; prefix text;
begin
 emp:=workforce_private.assert_task_actor(p_actor);adm:=emp is null;
 if p_department is null or p_department not in ('leadership','finance','people','marketing','sales','operations','technology','content')
  or p_agent is null or p_agent not in ('editor','researcher','writer','art','reviewer','publisher')
  or p_workspace is null or length(p_workspace) not between 1 and 180
  or p_from is null or p_until is null or p_from>=p_until or p_from<'2000-01-01' or p_until>'2101-01-01' then
  raise exception 'تخصص أو فترة قراءة غير صحيحة' using errcode='PT400';
 end if;
 prefix:=case when adm then '/admin/workforce/' else '/employee/' end;
 start_at:=p_from::timestamp at time zone 'Asia/Riyadh';end_at:=p_until::timestamp at time zone 'Asia/Riyadh';

 if p_department in ('finance','leadership') then
  if not adm then
   sections:=sections||jsonb_build_array(jsonb_build_object('source','الفواتير والاستردادات والملخص المالي','href','/employee/finance/overview','status','forbidden','reason','حساب الموظف لا يملك صلاحية مالية عامة؛ المسمى الافتراضي لا يوسعها.'));
  else
   select coalesce(jsonb_agg(to_jsonb(q)),'[]') into facts from (
    select currency,status,count(*) records,sum(amount)::text document_amount,
     count(*) filter(where paid_at is not null) payment_dated_documents,
     sum(amount) filter(where paid_at is not null)::text payment_dated_amount,max(updated_at) latest_update
    from public.service_invoices where issued_at>=start_at and issued_at<end_at group by currency,status order by currency,status
   )q;
   select count(*) into total from public.service_invoices where issued_at>=start_at and issued_at<end_at;
   select coalesce(jsonb_agg(to_jsonb(q)),'[]') into rows from (
    select invoice_number,status,amount::text,currency,issued_at,paid_at,updated_at
    from public.service_invoices where issued_at>=start_at and issued_at<end_at and not executive order by issued_at desc,id limit 30
   )q;
   sections:=sections||jsonb_build_array(jsonb_build_object('source','سجل فواتير الخدمات','table','service_invoices','href','/admin/requests','status','available','totals',facts,'recordCount',total,'records',rows,'limit',case when executive then 0 else 30 end,
    'meaning','المبلغ قيمة وثيقة الفاتورة بحسب تاريخ الإصدار، وليس دفتر إيرادات أو رصيد بنك. وجود paid_at معلومة محفوظة لا تحققًا جديدًا من بوابة الدفع.'));
   select coalesce(jsonb_agg(to_jsonb(q)),'[]') into facts from (
    select status,count(*) records,sum(amount)::text amount_sar,max(coalesce(processed_at,requested_at)) latest_update
    from public.payment_refunds where coalesce(processed_at,requested_at)>=start_at and coalesce(processed_at,requested_at)<end_at group by status order by status
   )q;
   sections:=sections||jsonb_build_array(jsonb_build_object('source','سجل الاستردادات','table','payment_refunds','href','/admin/requests','status','available','totals',facts,'meaning','المكتمل فقط استرداد مسجل؛ لا تخصم طلبات الاسترداد المعلقة ولا تجمعها مع الفواتير تلقائيًا. العملة ريال سعودي.'));
   select coalesce(jsonb_agg(to_jsonb(q)),'[]') into facts from (
    select status,count(*) records,sum(amount)::text amount_sar,max(occurred_on) latest_date from public.wf_sales_activities
    where metric='collection' and occurred_on>=p_from and occurred_on<p_until group by status order by status
   )q;
   sections:=sections||jsonb_build_array(jsonb_build_object('source','التحصيل المسجل في المبيعات','table','wf_sales_activities','href','/admin/workforce/sales','status','available','totals',facts,'meaning','approved تحصيل معتمد داخل النظام فقط؛ pending وrejected منفصلان. قد تتداخل مع الفواتير فلا تجمع المصدرين. العملة ريال سعودي.'));
  end if;
 end if;
 if adm and ((p_department='finance' and p_agent<>'writer') or executive or (p_department='people' and p_agent in ('editor','publisher'))) then
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into facts from (
   select month,status,count(*) employees,sum(total_amount)::text total_amount_sar,sum(paid_amount)::text paid_amount_sar,max(updated_at) latest_update
   from public.wf_monthly_payroll where month>=date_trunc('month',p_from)::date and month<p_until group by month,status order by month desc,status
  )q;
  sections:=sections||jsonb_build_array(jsonb_build_object('source','ملخص كشوف الرواتب الشهرية','table','wf_monthly_payroll','href','/admin/workforce/payroll','status','available','totals',facts,'meaning','إجماليات كشوف الأشهر المتقاطعة مع الفترة، مفصولة حسب حالة الكشف. ليست كل مصروفات الشركة. دون رواتب فردية أو بيانات بنكية.'));
 end if;

 if p_department in ('sales','leadership') then
  sales_manager:=adm or exists(select 1 from public.wf_sales_settings where manager_employee_id=emp);
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into facts from (
   select stage,count(*) records,sum(value)::text opportunity_value_sar from public.wf_crm_opportunities
   where (sales_manager or source_employee_id=emp) and created_at>=start_at and created_at<end_at group by stage order by stage
  )q;
  select count(*) into total from public.wf_crm_opportunities where (sales_manager or source_employee_id=emp) and created_at>=start_at and created_at<end_at;
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into rows from (
   select o.id,o.title,o.service,o.stage,o.value::text value_sar,left(o.next_action,400) next_action,o.next_on,o.created_at,
    (select a.name from public.wf_crm_accounts a where a.id=o.account_id and (sales_manager or a.owner_id=emp)) account_name
   from public.wf_crm_opportunities o where (sales_manager or o.source_employee_id=emp) and o.created_at>=start_at and o.created_at<end_at and not executive
   order by o.next_on nulls last,o.created_at desc,o.id limit 30
  )q;
  sections:=sections||jsonb_build_array(jsonb_build_object('source','مسار الفرص في إدارة المبيعات','table','wf_crm_opportunities','href',case when adm then '/admin/workforce/sales' else '/employee/crm' end,'status','available',
   'scope',case when sales_manager then 'السجلات المسموحة لمدير المبيعات' else 'الفرص التي تملك صلاحية مصدرها وفق نظام المبيعات' end,'totals',facts,'records',rows,'recordCount',total,'limit',case when executive then 0 else 30 end,'meaning','الفرص المنشأة خلال الفترة بحالتها الحالية. قيمة الفرصة ليست تحصيلًا. حالة won لا تثبت الدفع. لا بيانات اتصال أو ملفات عملاء.'));
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into facts from (
   select a.metric,a.status,count(*) records,sum(a.amount)::text recorded_amount_sar,max(a.occurred_on) latest_date
   from public.wf_sales_activities a join public.wf_sales_months m on m.month=a.month
   where (adm or m.status<>'draft') and (sales_manager or a.employee_id=emp or exists(select 1 from public.wf_crm_opportunities o where o.id=a.opportunity_id and o.source_employee_id=emp))
    and a.occurred_on>=p_from and a.occurred_on<p_until group by a.metric,a.status order by a.metric,a.status
  )q;
  sections:=sections||jsonb_build_array(jsonb_build_object('source','أنشطة المبيعات والتحصيل','table','wf_sales_activities','href',case when adm then '/admin/workforce/sales' else '/employee/crm' end,'status','available','totals',facts,'meaning','بحسب تاريخ النشاط، والموافقات مفصولة. التحصيل المعتمد metric=collection وstatus=approved فقط. ليست جميع الأنشطة إيرادات.'));
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into rows from (
   select m.month,m.status,m.team_target,p.employee_id,p.goals from public.wf_sales_months m left join public.wf_sales_plans p on p.month=m.month and (sales_manager or p.employee_id=emp)
   where (adm or m.status<>'draft') and m.month>=date_trunc('month',p_from)::date and m.month<p_until order by m.month desc,p.employee_id limit 30
  )q;
  sections:=sections||jsonb_build_array(jsonb_build_object('source','خطط وأهداف المبيعات','table','wf_sales_plans','href',case when adm then '/admin/workforce/sales' else '/employee/crm' end,'status','available','records',rows,'limit',30,'meaning','خطط الأشهر المتقاطعة مع الفترة؛ المستهدفات أهداف وليست نتائج محققة.'));
 end if;

 if p_department in ('marketing','content','leadership') then
  if not adm then
   sections:=sections||jsonb_build_array(jsonb_build_object('source','النشر وقياسات القنوات','href','/employee/virtual-office','status','forbidden','reason','مصادر مركز النشر وقياسات القنوات متاحة للإدارة فقط حاليًا.'));
  else
   select coalesce(jsonb_agg(to_jsonb(q)),'[]') into facts from (
    select status,count(*) records,max(created_at) latest_created from public.social_schedule where batch_date>=p_from and batch_date<p_until group by status order by status
   )q;
   select count(*) into total from public.social_schedule where batch_date>=p_from and batch_date<p_until;
   select coalesce(jsonb_agg(to_jsonb(q)),'[]') into rows from (
    select post_title,category,status,batch_date,created_at,(design_image_url is not null) has_design
    from public.social_schedule where batch_date>=p_from and batch_date<p_until and not executive order by batch_date desc,created_at desc,id limit 30
   )q;
   sections:=sections||jsonb_build_array(jsonb_build_object('source','خطة المحتوى الاجتماعي','table','social_schedule','href','/admin/social','status','available','totals',facts,'records',rows,'recordCount',total,'limit',case when executive then 0 else 30 end,'meaning','بحسب يوم الدفعة؛ المقترح والمجدول ليسا منشورين.'));
   select coalesce(jsonb_agg(to_jsonb(q)),'[]') into facts from (
    select status,count(*) records,max(updated_at) latest_update from public.postpulse_posts where coalesce(scheduled_for,created_at)>=start_at and coalesce(scheduled_for,created_at)<end_at group by status order by status
   )q;
   select count(*) into total from public.postpulse_posts where coalesce(scheduled_for,created_at)>=start_at and coalesce(scheduled_for,created_at)<end_at;
   select coalesce(jsonb_agg(to_jsonb(q)),'[]') into rows from (
    select id,status,scheduled_for,created_at,updated_at,left(content,240) content_excerpt from public.postpulse_posts
    where coalesce(scheduled_for,created_at)>=start_at and coalesce(scheduled_for,created_at)<end_at and not executive order by coalesce(scheduled_for,created_at) desc,id limit 30
   )q;
   sections:=sections||jsonb_build_array(jsonb_build_object('source','سجل جدولة القنوات','table','postpulse_posts','href','/admin/social/calendar','status','available','totals',facts,'records',rows,'recordCount',total,'limit',case when executive then 0 else 30 end,
    'meaning','بحسب الموعد المجدول أو تاريخ الإنشاء عند غيابه؛ الحالة هي حالة السجل الحالية ولا تثبت نجاح كل قناة. in_progress وscheduled ليسا منشورين، وpartially_completed جزئي.'));
   select coalesce(jsonb_agg(to_jsonb(q)),'[]') into facts from (
    select status,schedule_state,count(*) records,max(updated_at) latest_update from public.editorial_items where day>=p_from and day<p_until group by status,schedule_state order by status,schedule_state
   )q;
   sections:=sections||jsonb_build_array(jsonb_build_object('source','الخطة التحريرية المعتمدة','table','editorial_items','href','/admin/social','status','available','totals',facts,'meaning','عناصر الخطة بحسب يومها، وحالة الاعتماد منفصلة عن الجدولة والنشر. قد تظهر المادة نفسها في سجل القنوات فلا تجمع المصدرين.'));
   if executive or p_agent in ('editor','researcher','reviewer','publisher') then
    with latest as (select distinct on(x_post_id) x_post_id,captured_at,public_metrics from public.x_post_metric_snapshots where captured_at>=start_at and captured_at<end_at order by x_post_id,captured_at desc,id desc)
    select count(*),coalesce(jsonb_agg(to_jsonb(q)),'[]') into total,facts from (
     select x_post_id,captured_at,
      case when public_metrics->>'impression_count' ~ '^[0-9]+$' then (public_metrics->>'impression_count')::numeric else null end impressions,
      case when public_metrics->>'like_count' ~ '^[0-9]+$' then (public_metrics->>'like_count')::numeric else null end likes,
      case when public_metrics->>'retweet_count' ~ '^[0-9]+$' then (public_metrics->>'retweet_count')::numeric else null end reposts,
      case when public_metrics->>'reply_count' ~ '^[0-9]+$' then (public_metrics->>'reply_count')::numeric else null end replies
     from latest order by captured_at desc,x_post_id
    )q;
    select coalesce(jsonb_agg(v),'[]') into rows from (select v from jsonb_array_elements(facts) v limit 30)q;
    sections:=sections||jsonb_build_array(jsonb_build_object('source','لقطات قياسات X المحفوظة','table','x_post_metric_snapshots','href','/admin/x-insights','status','available','recordCount',total,'records',case when executive then '[]'::jsonb else rows end,'limit',case when executive then 0 else 30 end,
     'totals',jsonb_build_object('impressions',(select sum((v->>'impressions')::numeric)::text from jsonb_array_elements(facts)v),'likes',(select sum((v->>'likes')::numeric)::text from jsonb_array_elements(facts)v),'reposts',(select sum((v->>'reposts')::numeric)::text from jsonb_array_elements(facts)v),'replies',(select sum((v->>'replies')::numeric)::text from jsonb_array_elements(facts)v),'postsWithImpressions',(select count(*) from jsonb_array_elements(facts)v where v->>'impressions' is not null),'latestCapturedAt',(select max(v->>'captured_at') from jsonb_array_elements(facts)v)),
     'meaning','آخر لقطة محفوظة لكل منشور ضمن فترة التقاط القياس، وليست بالضرورة منشورات الفترة. عدادات تراكمية وليست زيادات الفترة؛ لا تعني استدعاء X الآن. لا إنفاق إعلاني أو قياس تحويلات متاح.'));
   end if;
   if not executive and p_agent in ('editor','art') then
    select coalesce(jsonb_agg(jsonb_build_object('first1saudiLogoUrl',first1saudi_logo_url,'updatedAt',updated_at)),'[]') into rows from public.brand_settings;
    sections:=sections||jsonb_build_array(jsonb_build_object('source','إعدادات الهوية المحفوظة','table','brand_settings','href','/admin/brand','status','available','records',rows,'meaning','الإعدادات الحالية بغض النظر عن الفترة؛ شعار أول سعودي لا يطبق على مشروع آخر.'));
   end if;
  end if;
 end if;

 pattern:=case p_department
  when 'finance' then 'مال|حاسب|فاتور|فواتير|ميزاني|تحصيل|رواتب|سداد|finance|invoice'
  when 'people' then 'موظف|توظيف|حضور|دوام|إجاز|اجاز|رواتب|hr|recruit'
  when 'marketing' then 'تسويق|حمل[ةا]|إعلان|اعلان|marketing|campaign'
  when 'sales' then 'مبيعات|عميل|عملاء|فرص|عروض|منصة|sales|crm'
  when 'technology' then 'تقني|برمج|تطوير|نظام|موقع|technology|software|bug'
  when 'content' then 'نشر|محتوى|قصة|كاتب|تصميم|content|publish' else '' end;
 with visible as (
  select t.*,c.kind,b.title board_title from public.wf_tasks t join public.wf_task_columns c on c.id=t.column_id join public.wf_boards b on b.id=t.board_id
  where workforce_private.vo_task_visible(p_actor,t.id) and t.archived_at is null and t.test_run_id is null and b.archived_at is null
   and (pattern='' or concat_ws(' ',t.title,b.title,array_to_string(t.labels,' ')) ~* pattern)
 ) select count(*),jsonb_build_object('open',count(*) filter(where kind<>'done'),'dueInPeriod',count(*) filter(where kind<>'done' and due_at>=start_at and due_at<end_at),'doneInPeriod',count(*) filter(where kind='done' and completed_at>=start_at and completed_at<end_at),
  'review',count(*) filter(where kind='review'),'blocked',count(*) filter(where kind<>'done' and length(btrim(coalesce(blocked_reason,'')))>0),'overdue',count(*) filter(where kind<>'done' and due_at<tick),'latestUpdate',max(updated_at)) into total,facts from visible;
 select coalesce(jsonb_agg(to_jsonb(q)),'[]') into rows from (
  select t.id,t.title,b.title board,c.kind state,t.priority,t.due_at,t.updated_at,t.completed_at,left(t.blocked_reason,300) blocked_reason,
   e.full_name assignee,t.requires_approval
  from public.wf_tasks t join public.wf_task_columns c on c.id=t.column_id join public.wf_boards b on b.id=t.board_id left join public.wf_employees e on e.id=t.assignee_id
  where workforce_private.vo_task_visible(p_actor,t.id) and t.archived_at is null and t.test_run_id is null and b.archived_at is null
   and (pattern='' or concat_ws(' ',t.title,b.title,array_to_string(t.labels,' ')) ~* pattern)
   and (c.kind<>'done' or t.completed_at>=start_at and t.completed_at<end_at)
  order by (c.kind='done'),t.due_at nulls last,t.updated_at desc,t.id limit 30
 )q;
 sections:=sections||jsonb_build_array(jsonb_build_object('source','لوحات المهام المسموحة للتخصص','table','wf_tasks','href',case when adm then '/admin/workforce/tasks' else '/employee/work/tasks' end,'status','available','totals',facts,'recordCount',total,'records',rows,'limit',30,
  'meaning','المفتوح والمراجعة والمتأخر حالة حالية عبر جميع المواعيد؛ المنجز فقط خلال الفترة. التخصص مرشح من عنوان المهمة واللوحة والوسوم، وليس تغييرًا لإدارتها أو لصلاحيتها. القوائم محدودة والإجماليات مستقلة. المحذوف والمؤرشف والاختبار مستبعد.'));
 return jsonb_build_object('checkedAt',tick,'readOnly',true,'department',p_department,'agent',p_agent,'period',jsonb_build_object('from',p_from,'untilExclusive',p_until,'timezone','Asia/Riyadh'),
  'sections',sections,'unavailable',jsonb_build_array('دفتر القيود والأرصدة البنكية والموازنات والربح غير موصولة بهذا المحول','تكاليف الإعلانات والتحويلات ليست ضمن قياسات X العامة','لا إرسال أو صرف أو اعتماد أو تحديث بيانات من هذه القراءة'));
end $$;
revoke all on function public.vo_host_department_context(uuid,text,text,text,date,date) from public,anon,authenticated;
grant execute on function public.vo_host_department_context(uuid,text,text,text,date,date) to service_role;

-- Several sources can be cited in one stage. Keep cancellation fencing intact.
create or replace function public.vo_record_host_context(p_id uuid,p_lease uuid,p_agent text,p_content text) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.vo_sessions where id=p_id and lease_token=p_lease and status='running' for update;
 if not found then return false;end if;
 if p_content is null or length(p_content)>4000 then raise sqlstate 'PT400' using message='سجل المصدر طويل';end if;
 insert into public.vo_messages(session_id,message_key,agent_id,kind,content,citations)
 values(p_id,'host-context:'||p_lease::text,p_agent,'event',p_content,'[]') on conflict(session_id,message_key) do nothing;
 return true;
end $$;
revoke all on function public.vo_record_host_context(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.vo_record_host_context(uuid,uuid,text,text) to service_role;
