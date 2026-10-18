-- Monthly estimates are explicit snapshots, separate from employment terms.
create table public.wf_monthly_payroll (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.wf_employees(id),
  month date not null check(extract(day from month)=1),
  basic_amount numeric(13,2) not null check(basic_amount between 0 and 999999999.99),
  allowances_amount numeric(13,2) not null check(allowances_amount between 0 and 999999999.99),
  items jsonb not null default '[]' check(jsonb_typeof(items)='array' and jsonb_array_length(items)<=100),
  total_amount numeric(15,2) not null check(total_amount>=0),
  paid_amount numeric(15,2) not null default 0 check(paid_amount>=0 and paid_amount<=total_amount),
  status text not null default 'draft' check(status in ('draft','approved','paid')),
  notes text not null default '' check(length(notes)<=2000),
  version integer not null default 1 check(version>0),
  approved_by uuid references public.profiles(id),approved_at timestamptz,
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(employee_id,month),
  check((status='draft' and approved_at is null and approved_by is null and paid_amount=0) or (status<>'draft' and approved_at is not null and approved_by is not null)),
  check(status<>'paid' or paid_amount=total_amount)
);
create table public.wf_payroll_payments (
  id uuid primary key default gen_random_uuid(),payroll_id uuid not null references public.wf_monthly_payroll(id),
  amount numeric(15,2) not null check(amount>0),reference text not null check(length(btrim(reference)) between 3 and 500),
  recorded_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),unique(payroll_id,reference)
);
create index wf_payroll_payments_statement_idx on public.wf_payroll_payments(payroll_id,created_at);
create table public.wf_payroll_events (
  id uuid primary key default gen_random_uuid(),payroll_id uuid not null references public.wf_monthly_payroll(id),
  action text not null,reason text not null check(length(btrim(reason)) between 3 and 2000),
  snapshot jsonb not null,actor_id uuid not null references public.profiles(id),created_at timestamptz not null default now()
);
create index wf_payroll_events_statement_idx on public.wf_payroll_events(payroll_id,created_at);
alter table public.wf_monthly_payroll enable row level security;
alter table public.wf_payroll_payments enable row level security;
alter table public.wf_payroll_events enable row level security;
revoke all on public.wf_monthly_payroll,public.wf_payroll_payments,public.wf_payroll_events from public,anon,authenticated,service_role;
grant select on public.wf_monthly_payroll,public.wf_payroll_payments,public.wf_payroll_events to authenticated;
grant select,insert,update on public.wf_monthly_payroll to service_role;
grant select,insert on public.wf_payroll_payments,public.wf_payroll_events to service_role;
create policy wf_monthly_payroll_read on public.wf_monthly_payroll for select to authenticated
using((select workforce_private.is_admin()) or employee_id=(select workforce_private.employee_id()));
create policy wf_payroll_payments_read on public.wf_payroll_payments for select to authenticated
using(exists(select 1 from public.wf_monthly_payroll p where p.id=payroll_id));
create policy wf_payroll_events_read on public.wf_payroll_events for select to authenticated
using(exists(select 1 from public.wf_monthly_payroll p where p.id=payroll_id));

create function public.wf_payroll_command(p_actor uuid,p_id uuid,p_employee uuid,p_month date,p_version integer,p_command text,p_payload jsonb,p_key uuid) returns jsonb
language plpgsql set search_path='' as $$
declare previous jsonb; record public.wf_monthly_payroll; item jsonb; normalized jsonb:='[]';
  basic numeric; allowances numeric; amount numeric; base numeric; rate numeric; total numeric; recipient uuid; employee_start date; reason text; field text;
  receipt_payload jsonb:=jsonb_build_object('employee_id',p_employee,'month',p_month,'payload',p_payload);
begin
  if workforce_private.assert_task_actor(p_actor) is not null then raise exception 'المستحقات الشهرية للإدارة فقط' using errcode='42501'; end if;
  previous:=workforce_private.command_retry(p_actor,p_key,'payroll:'||p_command,p_id,receipt_payload);
  if previous is not null then return previous; end if;
  if p_month is null or extract(day from p_month)<>1 then raise exception 'الشهر غير صحيح' using errcode='PT400'; end if;
  reason:=btrim(p_payload->>'reason');
  if reason is null or length(reason) not between 3 and 2000 then raise exception 'سبب الإجراء مطلوب' using errcode='PT400'; end if;
  for field in select jsonb_object_keys(p_payload) loop
    if (p_command='save' and field<>all(array['basic_amount','allowances_amount','items','notes','reason'])) or
      (p_command in ('approve','reopen') and field<>'reason') or
      (p_command='pay' and field<>all(array['amount','reference','reason'])) then raise exception 'حقل غير مسموح' using errcode='PT400'; end if;
  end loop;
  select user_id,start_date into recipient,employee_start from public.wf_employees where id=p_employee for update;
  if not found then raise exception 'الموظفة غير متاحة' using errcode='P0002'; end if;
  if p_month<date_trunc('month',employee_start)::date then raise exception 'الشهر يسبق شهر انضمام الموظفة' using errcode='PT400'; end if;
  select * into record from public.wf_monthly_payroll where employee_id=p_employee and month=p_month for update;
  if record.id is not null and (record.id<>p_id or p_version is distinct from record.version) then raise exception 'تغير كشف الشهر؛ حدّث البيانات' using errcode='PT409'; end if;
  if record.id is null and (p_command<>'save' or p_version is distinct from 0) then raise exception 'أنشئ تقدير الشهر أولًا' using errcode='PT409'; end if;
  if p_command='save' then
    if record.id is not null and record.status<>'draft' then raise exception 'الكشف معتمد؛ أعد فتحه قبل التعديل' using errcode='PT409'; end if;
    foreach field in array array['basic_amount','allowances_amount'] loop
      if jsonb_typeof(p_payload->field) is distinct from 'string' or coalesce(p_payload->>field,'') !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' then raise exception 'المبلغ غير صحيح' using errcode='PT400'; end if;
    end loop;
    basic:=(p_payload->>'basic_amount')::numeric; allowances:=(p_payload->>'allowances_amount')::numeric;
    if jsonb_typeof(p_payload->'items') is distinct from 'array' or jsonb_array_length(p_payload->'items')>100 then raise exception 'بنود الحوافز غير صحيحة' using errcode='PT400'; end if;
    total:=basic+allowances;
    for item in select value from jsonb_array_elements(p_payload->'items') loop
      if jsonb_typeof(item) is distinct from 'object' or coalesce(length(btrim(item->>'title')),0) not between 3 and 150 or coalesce(item->>'mode','') not in ('fixed','percent') then raise exception 'اسم الحافز أو طريقة احتسابه غير صحيحة' using errcode='PT400'; end if;
      for field in select jsonb_object_keys(item) loop
        if field<>all(array['title','mode','value','basis_amount','task_id','reference']) then raise exception 'حقل حافز غير مسموح' using errcode='PT400'; end if;
      end loop;
      if coalesce(length(item->>'reference'),0)>500 or ((nullif(item->>'task_id','') is null) and coalesce(length(btrim(item->>'reference')),0)<3) then raise exception 'اربط الحافز بمهمة أو اكتب مرجع الصفقة' using errcode='PT400'; end if;
      if nullif(item->>'task_id','') is not null and not exists(select 1 from public.wf_tasks where id=(item->>'task_id')::uuid and assignee_id=p_employee) then raise exception 'المهمة لا تخص الموظفة المحددة' using errcode='PT400'; end if;
      if jsonb_typeof(item->'value') is distinct from 'string' or (item->>'value') !~ (case when item->>'mode'='percent' then '^[0-9]{1,3}(\.[0-9]{1,4})?$' else '^[0-9]{1,9}(\.[0-9]{1,2})?$' end) then raise exception 'قيمة الحافز غير صحيحة' using errcode='PT400'; end if;
      if item->>'mode'='percent' then
        if jsonb_typeof(item->'basis_amount') is distinct from 'string' or (item->>'basis_amount') !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' then raise exception 'حدد مبلغ أساس النسبة' using errcode='PT400'; end if;
        rate:=(item->>'value')::numeric; base:=(item->>'basis_amount')::numeric;
        if rate>100 or base<=0 then raise exception 'النسبة من 0 إلى100 والأساس أكبر من صفر' using errcode='PT400'; end if;
        amount:=round(base*rate/100,2);
      else amount:=(item->>'value')::numeric; base:=null; end if;
      normalized:=normalized||jsonb_build_array(jsonb_build_object('title',btrim(item->>'title'),'mode',item->>'mode','value',item->>'value','basis_amount',base::text,'amount',amount::text,'task_id',nullif(item->>'task_id',''),'reference',coalesce(item->>'reference','')));
      total:=total+amount;
    end loop;
    if coalesce(length(p_payload->>'notes'),0)>2000 then raise exception 'الملاحظات طويلة جدًا' using errcode='PT400'; end if;
    if record.id is null then
      insert into public.wf_monthly_payroll(id,employee_id,month,basic_amount,allowances_amount,items,total_amount,notes,updated_by)
      values(p_id,p_employee,p_month,basic,allowances,normalized,total,coalesce(p_payload->>'notes',''),p_actor) returning * into record;
    else
      update public.wf_monthly_payroll set basic_amount=basic,allowances_amount=allowances,items=normalized,total_amount=total,notes=coalesce(p_payload->>'notes',''),version=version+1,updated_at=now(),updated_by=p_actor where id=p_id returning * into record;
    end if;
  elsif p_command='approve' then
    if record.status<>'draft' then raise exception 'الكشف معتمد بالفعل' using errcode='PT409'; end if;
    update public.wf_monthly_payroll set status='approved',approved_by=p_actor,approved_at=now(),version=version+1,updated_at=now(),updated_by=p_actor where id=p_id returning * into record;
  elsif p_command='reopen' then
    if record.status<>'approved' or record.paid_amount<>0 then raise exception 'لا يُعاد فتح كشف بعد تسجيل صرف عليه' using errcode='PT409'; end if;
    update public.wf_monthly_payroll set status='draft',approved_by=null,approved_at=null,version=version+1,updated_at=now(),updated_by=p_actor where id=p_id returning * into record;
  elsif p_command='pay' then
    if record.status<>'approved' then raise exception 'اعتمد الكشف قبل توثيق الصرف' using errcode='PT409'; end if;
    if jsonb_typeof(p_payload->'amount') is distinct from 'string' or coalesce(p_payload->>'amount','') !~ '^[0-9]{1,12}(\.[0-9]{1,2})?$' or coalesce(length(btrim(p_payload->>'reference')),0) not between 3 and 500 then raise exception 'مبلغ الصرف ومرجعه مطلوبان' using errcode='PT400'; end if;
    amount:=(p_payload->>'amount')::numeric;
    if amount<=0 or amount>record.total_amount-record.paid_amount then raise exception 'المبلغ يتجاوز المستحق المتبقي أو يساوي صفرًا' using errcode='PT400'; end if;
    insert into public.wf_payroll_payments(payroll_id,amount,reference,recorded_by) values(p_id,amount,btrim(p_payload->>'reference'),p_actor);
    update public.wf_monthly_payroll set paid_amount=paid_amount+amount,status=case when paid_amount+amount=total_amount then 'paid' else 'approved' end,version=version+1,updated_at=now(),updated_by=p_actor where id=p_id returning * into record;
  else raise exception 'إجراء غير صحيح' using errcode='PT400'; end if;
  insert into public.wf_payroll_events(payroll_id,action,reason,snapshot,actor_id) values(p_id,p_command,reason,to_jsonb(record),p_actor);
  insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
  values(recipient,'payroll',case p_command when 'approve' then 'اعتماد مستحقات الشهر' when 'pay' then 'تسجيل صرف من مستحقاتك' when 'reopen' then 'إعادة فتح كشف الشهر للمراجعة' else 'تحديث مستحقاتك المتوقعة' end,
    'الشهر: '||to_char(p_month,'YYYY-MM')||'، الإجمالي: '||record.total_amount||' ر.س، المصروف المسجل: '||record.paid_amount||' ر.س',
    '/employee/finance/overview','payroll:'||record.id||':'||record.version);
  return workforce_private.save_command(p_actor,p_key,'payroll:'||p_command,p_id,receipt_payload,jsonb_build_object('id',record.id,'version',record.version));
end $$;
revoke all on function public.wf_payroll_command(uuid,uuid,uuid,date,integer,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.wf_payroll_command(uuid,uuid,uuid,date,integer,text,jsonb,uuid) to service_role;
