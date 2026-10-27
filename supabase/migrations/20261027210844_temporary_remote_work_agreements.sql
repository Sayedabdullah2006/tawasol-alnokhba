-- A prospective, employee-signed agreement. Original salary/settings are never overwritten.
alter table public.wf_employee_requests add column remote_details jsonb;
create table public.wf_remote_company (
 id boolean primary key default true check(id),legal_name text not null,unified_number text not null,
 address text not null,representative text not null,email text not null,phone text not null,source text not null
);
create table public.wf_remote_contracts (
 employee_id uuid primary key references public.wf_employees(id),contract_number text not null check(length(btrim(contract_number)) between 1 and 100),source text not null
);
alter table public.wf_remote_company enable row level security;
alter table public.wf_remote_contracts enable row level security;
revoke all on public.wf_remote_company,public.wf_remote_contracts from public,anon,authenticated;
grant select on public.wf_remote_company,public.wf_remote_contracts to authenticated;
grant select,insert,update on public.wf_remote_company,public.wf_remote_contracts to service_role;
create policy wf_remote_company_read on public.wf_remote_company for select to authenticated using((select workforce_private.is_admin()) or exists(select 1 from public.wf_employees where user_id=(select auth.uid()) and status='active'));
create policy wf_remote_contract_read on public.wf_remote_contracts for select to authenticated using((select workforce_private.is_admin()) or exists(select 1 from public.wf_employees where id=employee_id and user_id=(select auth.uid()) and status='active'));

create function workforce_private.remote_quote(p_employee uuid,p_payload jsonb,p_ignore uuid default null) returns jsonb
language plpgsql stable set search_path='' as $$
declare e public.wf_employees;company jsonb;contract text;lo date;hi date;d date;t record;basic numeric;housing numeric;eligible numeric;fixed numeric;reduction numeric;denom numeric;total numeric:=0;original numeric:=0;days jsonb:='[]';missing jsonb:='[]';q jsonb;workdays integer[];daily int;required int;clock time;reason text;location text;duties text;return_on date;
begin
 select * into e from public.wf_employees where id=p_employee;
 if not found or e.status<>'active' then raise sqlstate 'PT403' using message='الملف الوظيفي غير متاح';end if;
 lo:=(p_payload->>'starts_on')::date;hi:=(p_payload->>'ends_on')::date;clock:=(p_payload->>'starts_time')::time;
 reason:=btrim(coalesce(p_payload->>'reason',''));location:=btrim(coalesce(p_payload->>'location',''));duties:=btrim(coalesce(p_payload->>'duties',''));
 if lo is null or hi is null or clock is null or lo>hi or hi-lo>365 or lo<(workforce_private.work_now() at time zone 'Asia/Riyadh')::date or lo<e.start_date or hi>least(e.contract_end,e.employment_ends_on) or length(reason) not between 3 and 5000 or length(location) not between 3 and 500 or length(duties) not between 3 and 5000 then raise sqlstate 'PT400' using message='حدد فترة مستقبلية ومكان العمل وسبب الطلب ضمن مدة العقد';end if;
 if lo=(workforce_private.work_now() at time zone 'Asia/Riyadh')::date and clock<=(workforce_private.work_now() at time zone 'Asia/Riyadh')::time or exists(select 1 from public.wf_attendance_sessions a where a.employee_id=p_employee and a.checked_in<=workforce_private.work_now() and (a.checked_in at time zone 'Asia/Riyadh')::date between lo and hi) then raise sqlstate 'PT409' using message='لا يطبق الاتفاق على وقت مضى أو فترة سُجل فيها حضور؛ اختر بداية لاحقة';end if;
 if exists(select 1 from public.wf_employee_requests r where r.employee_id=p_employee and r.id is distinct from p_ignore and r.test_run_id is null and r.status in ('pending','approved') and (r.kind='remote-work' or r.kind='leave' and r.leave_type='unpaid') and (r.starts_at at time zone 'Asia/Riyadh')::date<=hi and (r.ends_at at time zone 'Asia/Riyadh')::date>=lo) then raise sqlstate 'PT409' using message='الفترة تتداخل مع طلب عمل عن بُعد أو إجازة غير مدفوعة قائم';end if;
 if exists(select 1 from public.wf_monthly_payroll p where p.employee_id=p_employee and p.status in ('approved','paid') and p.month<=hi and (p.month+interval '1 month - 1 day')::date>=lo) then raise sqlstate 'PT409' using message='الفترة ضمن كشف معتمد؛ راجعه قبل إنشاء اتفاق جديد';end if;
 select to_jsonb(c)-'id' into company from public.wf_remote_company c where id;
 select contract_number into contract from public.wf_remote_contracts where employee_id=p_employee;
 if company is null then missing:=missing||'"بيانات المنشأة القانونية"'::jsonb;end if;
 if contract is null then missing:=missing||'"رقم عقد العمل الموثق"'::jsonb;end if;
 if coalesce(e.national_id,'')='' or coalesce(e.national_address,'')='' or coalesce(e.phone,'')='' or coalesce(e.email,'')='' or coalesce(e.job_title,'')='' then missing:=missing||'"بيانات الموظفة الوظيفية والهوية والعنوان ووسائل التواصل"'::jsonb;end if;
 select s.workdays,s.daily_minutes into workdays,daily from public.wf_attendance_settings s where s.employee_id=p_employee;
 workdays:=coalesce(workdays,array[0,1,2,3,4,6]);daily:=coalesce(daily,480);
 for d in select generate_series(lo::timestamp,hi::timestamp,interval '1 day')::date loop
  select c.* into t from public.wf_compensation_versions c where c.employee_id=p_employee and effective_from<=d order by effective_from desc,revision desc limit 1;
  if not found then raise sqlstate 'PT409' using message='أكمل إعداد الراتب للفترة';end if;
  basic:=t.basic_salary;select coalesce(sum((a->>'amount')::numeric) filter(where coalesce(a->>'name','')~*'(سكن|housing)'),0),coalesce(sum((a->>'amount')::numeric) filter(where a->>'name' in ('بدل النقل','بدل مهام إضافية ثابت')),0),basic+coalesce(sum((a->>'amount')::numeric),0) into housing,eligible,fixed from jsonb_array_elements(t.allowances) a;
  if basic+housing<4000 then raise sqlstate 'PT409' using message='لا يمكن إصدار الاتفاق: الأساسي وبدل السكن أقل من 4,000 ريال';end if;
  if eligible<=0 then raise sqlstate 'PT409' using message='لا توجد بدلات نقل أو مهام إضافية ثابتة يمكن إيقافها؛ لا يتغير الراتب أو ساعات العمل';end if;
  required:=ceil(daily*(fixed-eligible)/fixed);reduction:=eligible/fixed;
  if extract(epoch from clock)+required*60>86400 or (e.flexible_workday_from is null or d<e.flexible_workday_from) and clock+required*interval '1 minute'>workforce_private.employee_work_end(p_employee,d) then raise sqlstate 'PT400' using message='وقت البداية لا يتيح استكمال ساعات الاتفاق قبل نهاية الدوام';end if;
  denom:=case when e.start_date>date_trunc('month',d)::date or e.employment_ends_on<(date_trunc('month',d)+interval '1 month - 1 day')::date then 30 else extract(day from (date_trunc('month',d)+interval '1 month - 1 day')) end;
  original:=original+fixed/denom;total:=total+eligible/denom;
  days:=days||jsonb_build_array(jsonb_build_object('day',d,'amount',round(eligible/denom,8)::text,'original',round(fixed/denom,8)::text,'basic',basic::text,'housing',housing::text,'stopped_allowances',eligible::text,'transport_allowance',coalesce((select sum((a->>'amount')::numeric) from jsonb_array_elements(t.allowances) a where a->>'name'='بدل النقل'),0)::text,'extra_allowance',coalesce((select sum((a->>'amount')::numeric) from jsonb_array_elements(t.allowances) a where a->>'name'='بدل مهام إضافية ثابت'),0)::text,'original_monthly',fixed::text,'agreed_monthly',(fixed-eligible)::text,'required_minutes',required,'starts_time',clock::text,'ends_time',(clock+required*interval '1 minute')::text,'regular_minutes',daily,'workday',extract(dow from d)::int=any(workdays),'salary_revision',t.revision,'salary_effective',t.effective_from));
 end loop;
 if (select count(distinct jsonb_build_array(v->'basic',v->'housing',v->'stopped_allowances',v->'original_monthly',v->'required_minutes')) from jsonb_array_elements(days) v)>1 then raise sqlstate 'PT409' using message='تتغير شروط الراتب أو الساعات خلال الفترة؛ قسّمها إلى اتفاقات مستقلة';end if;
 return_on:=hi+1;
 q:=jsonb_build_object('version','remote-v1-stop-two-allowances','employee_id',e.id,'employee',jsonb_build_object('full_name',e.full_name,'national_id',e.national_id,'job_title',e.job_title,'phone',e.phone,'email',e.email,'address',e.national_address,'city',e.city,'start_date',e.start_date,'contract_end',e.contract_end),'contract_number',contract,'company',company,'missing',missing,'ready',jsonb_array_length(missing)=0,'starts_on',lo,'ends_on',hi,'returns_on',return_on,'starts_time',clock,'reason',reason,'location',location,'duties',duties,'calendar_days',hi-lo+1,'allowance_stop_percent',100,'wage_reduction_percent',round(total/original*100,6),'original_amount',round(original,2)::text,'adjustment_amount',round(total,2)::text,'agreed_amount',round(original-total,2)::text,'days',days);
 return q||jsonb_build_object('hash',md5(q::text));
end $$;
create function public.wf_remote_work_quote(p_actor uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare employee uuid;begin employee:=workforce_private.assert_task_actor(p_actor);if employee is null then raise sqlstate '42501' using message='التقدير للموظفة صاحبة الطلب فقط';end if;return workforce_private.remote_quote(employee,p_payload);end$$;

create function public.wf_submit_remote_work(p_actor uuid,p_id uuid,p_payload jsonb,p_hash text,p_signature jsonb,p_ack boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare employee uuid;q jsonb;old public.wf_employee_requests;pt jsonb;stroke jsonb;points int:=0;
begin
 employee:=workforce_private.assert_task_actor(p_actor);if employee is null then raise sqlstate '42501' using message='التقديم للموظفة فقط';end if;
 perform 1 from public.wf_employees where id=employee for update;
 select * into old from public.wf_employee_requests where id=p_id;
 if found then
  if old.employee_id=employee and old.kind='remote-work' and old.remote_details->'snapshot'->>'hash'=p_hash and old.remote_details->'signature'=p_signature then return p_id;end if;
  raise sqlstate 'PT409' using message='مفتاح الطلب مستخدم لبيانات أخرى';
 end if;
 q:=workforce_private.remote_quote(employee,p_payload);
 if p_ack is not true or not (q->>'ready')::boolean or q->>'hash' is distinct from p_hash then raise sqlstate 'PT409' using message='استكمل بيانات الاتفاق وراجع النسخة المحدّثة ووافق عليها قبل التوقيع والإرسال';end if;
 if jsonb_typeof(p_signature)<>'array' or jsonb_array_length(p_signature) not between 1 and 50 then raise sqlstate 'PT400' using message='التوقيع مطلوب';end if;
 for stroke in select * from jsonb_array_elements(p_signature) loop
  if jsonb_typeof(stroke)<>'array' or jsonb_array_length(stroke) not between 2 and 1000 then raise sqlstate 'PT400' using message='التوقيع غير صحيح';end if;
  for pt in select * from jsonb_array_elements(stroke) loop
   if jsonb_typeof(pt)<>'array' or jsonb_array_length(pt)<>2 or jsonb_typeof(pt->0)<>'number' or jsonb_typeof(pt->1)<>'number' or (pt->>0)::numeric not between 0 and 1000 or (pt->>1)::numeric not between 0 and 300 then raise sqlstate 'PT400' using message='نقاط التوقيع غير صحيحة';end if;points:=points+1;
  end loop;
 end loop;
 if points not between 10 and 3000 then raise sqlstate 'PT400' using message='أكملي رسم توقيع واضح';end if;
 insert into public.wf_employee_requests(id,employee_id,kind,title,body,starts_at,ends_at,amount,fingerprint,remote_details,status)
 values(p_id,employee,'remote-work','اتفاق مؤقت للعمل عن بُعد',q->>'reason',(q->>'starts_on')::date::timestamp at time zone 'Asia/Riyadh',((q->>'ends_on')::date+time '23:59:59') at time zone 'Asia/Riyadh',null,p_hash,jsonb_build_object('snapshot',q,'signature',p_signature,'signed_at',workforce_private.work_now(),'signed_by',p_actor),'pending');
 return p_id;
end$$;

create function workforce_private.guard_remote_agreement() returns trigger language plpgsql set search_path='' as $$
declare q jsonb;expected jsonb;begin
 if TG_OP='UPDATE' and old.remote_details is not null and (new.remote_details,new.employee_id,new.kind,new.starts_at,new.ends_at,new.body,new.test_run_id) is distinct from (old.remote_details,old.employee_id,old.kind,old.starts_at,old.ends_at,old.body,old.test_run_id) then raise sqlstate 'PT409' using message='الاتفاق الموقّع لا يقبل التعديل؛ قدّم اتفاقًا جديدًا';end if;
 if new.kind='remote-work' and (TG_OP='INSERT' or new.status='approved' and old.status is distinct from new.status) then
  if new.remote_details is null then raise sqlstate 'PT400' using message='طلب العمل عن بُعد يتطلب الاتفاق الموقّع';end if;
  perform 1 from public.wf_employees where id=new.employee_id for update;
  q:=new.remote_details->'snapshot';expected:=workforce_private.remote_quote(new.employee_id,jsonb_build_object('starts_on',q->>'starts_on','ends_on',q->>'ends_on','starts_time',q->>'starts_time','reason',q->>'reason','location',q->>'location','duties',q->>'duties'),new.id);
  if not (expected->>'ready')::boolean or q->>'hash'<>expected->>'hash' then raise sqlstate 'PT409' using message='تغيرت بيانات الاتفاق أو الراتب؛ يلزم طلب جديد وموافقة الموظفة';end if;
 elsif new.kind='leave' and new.leave_type='unpaid' and new.status in ('pending','approved') then
  perform 1 from public.wf_employees where id=new.employee_id for update;
  if exists(select 1 from public.wf_employee_requests r where r.employee_id=new.employee_id and r.kind='remote-work' and r.remote_details is not null and r.status in ('pending','approved') and r.test_run_id is null and (new.starts_at at time zone 'Asia/Riyadh')::date<=(r.ends_at at time zone 'Asia/Riyadh')::date and (new.ends_at at time zone 'Asia/Riyadh')::date>=(r.starts_at at time zone 'Asia/Riyadh')::date) then raise sqlstate 'PT409' using message='الإجازة تتداخل مع اتفاق عمل عن بُعد؛ راجع الفترة أولًا';end if;
 end if;return new;
end$$;
create trigger wf_remote_agreement_guard before insert or update on public.wf_employee_requests for each row execute function workforce_private.guard_remote_agreement();

create function workforce_private.remote_day(p_employee uuid,p_day date) returns jsonb language sql stable set search_path='' as $$
 select v from public.wf_employee_requests r cross join lateral jsonb_array_elements(r.remote_details->'snapshot'->'days') v where r.employee_id=p_employee and r.kind='remote-work' and r.status='approved' and r.test_run_id is null and v->>'day'=p_day::text limit 1
$$;
create function workforce_private.effective_daily_minutes(p_employee uuid,p_day date) returns int language sql stable set search_path='' as $$
 select coalesce((workforce_private.remote_day(p_employee,p_day)->>'required_minutes')::int,(select daily_minutes from public.wf_attendance_settings where employee_id=p_employee),480)
$$;
do $$declare f oid;begin
 f:='workforce_private.employee_work_start(uuid,date)'::regprocedure;execute replace(pg_get_functiondef(f),'FUNCTION workforce_private.employee_work_start(', 'FUNCTION workforce_private.employee_work_start_before_remote(');
 f:='workforce_private.employee_work_end(uuid,date)'::regprocedure;execute replace(pg_get_functiondef(f),'FUNCTION workforce_private.employee_work_end(', 'FUNCTION workforce_private.employee_work_end_before_remote(');
end$$;
create or replace function workforce_private.employee_work_start(p_employee uuid,p_day date) returns time language sql stable security definer set search_path='' as $$select coalesce((workforce_private.remote_day(p_employee,p_day)->>'starts_time')::time,workforce_private.employee_work_start_before_remote(p_employee,p_day))$$;
create or replace function workforce_private.employee_work_end(p_employee uuid,p_day date) returns time language sql stable security definer set search_path='' as $$select coalesce((workforce_private.remote_day(p_employee,p_day)->>'ends_time')::time,workforce_private.employee_work_end_before_remote(p_employee,p_day))$$;
create function workforce_private.remote_work_payroll(p_employee uuid,p_month date,p_through date) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('amount',round(coalesce(sum((v->>'amount')::numeric),0),2)::text,'days',coalesce(jsonb_agg(jsonb_build_object('day',v->>'day','amount',v->>'amount','required_minutes',v->'required_minutes') order by v->>'day'),'[]'::jsonb))
 from public.wf_employee_requests r cross join lateral jsonb_array_elements(r.remote_details->'snapshot'->'days') v where r.employee_id=p_employee and r.kind='remote-work' and r.status='approved' and r.test_run_id is null and (v->>'day')::date between p_month and least(p_through,(p_month+interval '1 month - 1 day')::date,workforce_private.employment_end(p_employee))
$$;

-- Patch the existing daily target seams, keeping all sick leave, missing-hours,
-- October waivers, weekly bank and employment-end logic intact.
do $patch$ declare f record;b text;previous text;begin
 for f in select oid,proname,prosrc from pg_proc where oid in ('workforce_private.weekly_hours(uuid,date)'::regprocedure,'workforce_private.attendance_payroll_before_unpaid(uuid,date)'::regprocedure,'workforce_private.daily_payroll_accrual_before_unpaid(public.wf_monthly_payroll)'::regprocedure) loop
  b:=f.prosrc;
  if f.proname='daily_payroll_accrual_before_unpaid' then b:=replace(b,'daily:=coalesce(daily,480);','daily:=workforce_private.effective_daily_minutes(p.employee_id,today);');
  else b:=replace(b,'interval ''1 day'')::date loop','interval ''1 day'')::date loop'||E'\n daily:=workforce_private.effective_daily_minutes(p_employee,d);');end if;
  if b=f.prosrc then raise exception 'Missing remote daily target seam: %',f.proname;end if;
  if f.proname='attendance_payroll_before_unpaid' then
   previous:=b;b:=replace(b,'fixed:=term.monthly;day_rate:=fixed/30/8;','fixed:=term.monthly;day_rate:=fixed/30/8; if workforce_private.remote_day(p_employee,d) is not null then day_rate:=(workforce_private.remote_day(p_employee,d)->>''agreed_monthly'')::numeric/30/(daily::numeric/60);end if;');
   if b=previous then raise exception 'Missing remote attendance hourly wage seam';end if;
  elsif f.proname='daily_payroll_accrual_before_unpaid' then
   previous:=b;b:=replace(b,'hourly:=term.hourly;','hourly:=term.hourly; if workforce_private.remote_day(p.employee_id,today) is not null then hourly:=(workforce_private.remote_day(p.employee_id,today)->>''agreed_monthly'')::numeric/30/(daily::numeric/60);end if;');
   if b=previous then raise exception 'Missing remote daily hourly wage seam';end if;
  end if;
  if f.proname='weekly_hours' then
   b:=replace(b,'''enabled'',first_day<=last_day','''remote_days'',(select coalesce(jsonb_agg(jsonb_build_object(''day'',v->>''day'',''required_minutes'',v->''required_minutes'')),''[]''::jsonb) from public.wf_employee_requests r cross join lateral jsonb_array_elements(r.remote_details->''snapshot''->''days'') v where r.employee_id=p_employee and r.kind=''remote-work'' and r.status=''approved'' and r.test_run_id is null and (v->>''day'')::date between p_month and least((p_month+interval ''1 month - 1 day'')::date,workforce_private.employment_end(p_employee))),''enabled'',first_day<=last_day');
   previous:=b;b:=replace(b,'count(*)*daily*60','coalesce(sum(workforce_private.effective_daily_minutes(p_employee,x::date)*60),0)');
   if b=previous then raise exception 'Missing remote weekly target seam';end if;
   b:=replace(b,'greatest(0,actual-daily*60)','case when workforce_private.remote_day(p_employee,d) is not null then 0 else greatest(0,actual-daily*60) end');
  end if;
  execute replace(pg_get_functiondef(f.oid),f.prosrc,b);
 end loop;
end$patch$;
do $$declare f oid;begin
 f:='workforce_private.attendance_payroll(uuid,date)'::regprocedure;execute replace(pg_get_functiondef(f),'FUNCTION workforce_private.attendance_payroll(', 'FUNCTION workforce_private.attendance_payroll_before_remote(');
 f:='workforce_private.daily_payroll_accrual(public.wf_monthly_payroll)'::regprocedure;execute replace(pg_get_functiondef(f),'FUNCTION workforce_private.daily_payroll_accrual(', 'FUNCTION workforce_private.daily_payroll_accrual_before_remote(');
end$$;
create or replace function workforce_private.attendance_payroll(p_employee uuid,p_month date) returns jsonb language plpgsql stable set search_path='' as $$
declare result jsonb;remote jsonb;medical jsonb;v jsonb;rebate numeric:=0;part numeric;medical_days jsonb:='[]';begin
 result:=workforce_private.attendance_payroll_before_remote(p_employee,p_month);
 if exists(select 1 from public.wf_monthly_payroll where employee_id=p_employee and month=p_month and status='paid') then return result;end if;
 remote:=workforce_private.remote_work_payroll(p_employee,p_month,(result->>'through')::date);
 medical:=result->'sick_leave';
 for v in select * from jsonb_array_elements(coalesce(medical->'days','[]'::jsonb)) loop
  part:=coalesce((workforce_private.remote_day(p_employee,(v->>'day')::date)->>'stopped_allowances')::numeric,0)/30*(1-(v->>'pay_rate')::numeric);rebate:=rebate+part;medical_days:=medical_days||jsonb_build_array(v||jsonb_build_object('amount',round(greatest(0,(v->>'amount')::numeric-part),2)::text));
 end loop;
 if rebate>0 then result:=result||jsonb_build_object('sick_leave',medical||jsonb_build_object('days',medical_days,'amount',round(greatest(0,(medical->>'amount')::numeric-rebate),2)::text));end if;
 return result||jsonb_build_object('remote_work',remote,'calculated_amount',round(greatest(0,(result->>'calculated_amount')::numeric-round(rebate,2))+(remote->>'amount')::numeric,2)::text);
end$$;
create or replace function workforce_private.daily_payroll_accrual(p public.wf_monthly_payroll) returns jsonb language plpgsql stable set search_path='' as $$
declare result jsonb;remote jsonb;detail jsonb;extra numeric;adjustment numeric;available numeric;begin
 result:=workforce_private.daily_payroll_accrual_before_remote(p);
 if p.status='paid' or (result->>'closed')::boolean then return result;end if;
 remote:=workforce_private.remote_work_payroll(p.employee_id,p.month,(workforce_private.work_now() at time zone 'Asia/Riyadh')::date);detail:=workforce_private.attendance_payroll(p.employee_id,p.month);
 extra:=greatest(0,(remote->>'amount')::numeric-coalesce((detail->'remote_work'->>'amount')::numeric,0));available:=greatest(0,(result->>'gross_amount')::numeric-(result->>'insurance_amount')::numeric-(result->>'other_amount')::numeric);
 adjustment:=least(available,(result->>'attendance_amount')::numeric+extra);
 return result||jsonb_build_object('attendance_amount',round(adjustment,2)::text,'total_amount',round(greatest(0,available-adjustment),2)::text,'remote_work_amount',remote->>'amount');
end$$;
revoke all on function workforce_private.remote_quote(uuid,jsonb,uuid),workforce_private.remote_day(uuid,date),workforce_private.effective_daily_minutes(uuid,date),workforce_private.remote_work_payroll(uuid,date,date),workforce_private.guard_remote_agreement(),workforce_private.attendance_payroll_before_remote(uuid,date),workforce_private.daily_payroll_accrual_before_remote(public.wf_monthly_payroll),public.wf_remote_work_quote(uuid,jsonb),public.wf_submit_remote_work(uuid,uuid,jsonb,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function workforce_private.remote_quote(uuid,jsonb,uuid),workforce_private.remote_day(uuid,date),workforce_private.effective_daily_minutes(uuid,date),workforce_private.remote_work_payroll(uuid,date,date),workforce_private.attendance_payroll_before_remote(uuid,date),workforce_private.daily_payroll_accrual_before_remote(public.wf_monthly_payroll),public.wf_remote_work_quote(uuid,jsonb),public.wf_submit_remote_work(uuid,uuid,jsonb,text,jsonb,boolean) to service_role;

create function public.wf_remote_metadata(p_actor uuid,p_company jsonb,p_contracts jsonb) returns void language plpgsql security definer set search_path='' as $$
declare c record;v jsonb;begin
 if workforce_private.assert_task_actor(p_actor) is not null then raise sqlstate '42501' using message='بيانات الاتفاقات للإدارة فقط';end if;
 if jsonb_typeof(p_contracts)<>'array' or jsonb_array_length(p_contracts)>100 or length(coalesce(p_company->>'legal_name','')) not between 3 and 200 or coalesce(p_company->>'unified_number','')!~'^\d{10}$' or length(coalesce(p_company->>'address','')) not between 3 and 500 or length(coalesce(p_company->>'representative','')) not between 3 and 200 or coalesce(p_company->>'email','')!~'^\S+@\S+\.\S+$' or length(coalesce(p_company->>'phone','')) not between 3 and 200 or length(coalesce(p_company->>'source','')) not between 3 and 200 then raise sqlstate 'PT400' using message='بيانات المنشأة والعقود غير مكتملة';end if;
 insert into public.wf_remote_company values(true,p_company->>'legal_name',p_company->>'unified_number',p_company->>'address',p_company->>'representative',p_company->>'email',p_company->>'phone',p_company->>'source') on conflict(id) do update set legal_name=excluded.legal_name,unified_number=excluded.unified_number,address=excluded.address,representative=excluded.representative,email=excluded.email,phone=excluded.phone,source=excluded.source;
 for v in select * from jsonb_array_elements(p_contracts) loop
  if length(btrim(coalesce(v->>'contract_number',''))) not between 1 and 100 or length(btrim(coalesce(v->>'source',''))) not between 3 and 200 then raise sqlstate 'PT400' using message='رقم العقد ومرجعه مطلوبان';end if;
  insert into public.wf_remote_contracts values((v->>'employee_id')::uuid,btrim(v->>'contract_number'),btrim(v->>'source')) on conflict(employee_id) do update set contract_number=excluded.contract_number,source=excluded.source;
 end loop;
end$$;
revoke all on function public.wf_remote_metadata(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.wf_remote_metadata(uuid,jsonb,jsonb) to service_role;
revoke all on function workforce_private.employee_work_start_before_remote(uuid,date),workforce_private.employee_work_end_before_remote(uuid,date) from public,anon,authenticated;
grant execute on function workforce_private.employee_work_start_before_remote(uuid,date),workforce_private.employee_work_end_before_remote(uuid,date) to service_role;
create function workforce_private.refresh_remote_payroll() returns trigger language plpgsql set search_path='' as $$declare m date;begin
 if new.kind='remote-work' and new.remote_details is not null and new.status='approved' and old.status is distinct from new.status then
  for m in select month from public.wf_monthly_payroll where employee_id=new.employee_id and month<=(new.ends_at at time zone 'Asia/Riyadh')::date and (month+interval '1 month - 1 day')::date>=(new.starts_at at time zone 'Asia/Riyadh')::date loop perform workforce_private.refresh_attendance_payroll(new.employee_id,m);end loop;
 end if;return new;
end$$;
revoke all on function workforce_private.refresh_remote_payroll() from public,anon,authenticated;
create trigger wf_remote_payroll_refresh after update on public.wf_employee_requests for each row execute function workforce_private.refresh_remote_payroll();

-- Publish the same effective window to the session banner and clock-in controls.
do $$declare f oid;begin f:='public.wf_work_snapshot(uuid,uuid)'::regprocedure;execute replace(pg_get_functiondef(f),'FUNCTION public.wf_work_snapshot(', 'FUNCTION workforce_private.work_snapshot_before_remote(');end$$;
create or replace function public.wf_work_snapshot(p_actor uuid,p_employee uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;v jsonb;day date;employee uuid;begin
 employee:=coalesce(p_employee,(select id from public.wf_employees where user_id=p_actor and status='active'));
 result:=workforce_private.work_snapshot_before_remote(p_actor,p_employee);day:=((result->>'now')::timestamptz at time zone 'Asia/Riyadh')::date;v:=workforce_private.remote_day(employee,day);
 if v is not null then result:=result||jsonb_build_object('attendancePolicy',coalesce(result->'attendancePolicy','{}'::jsonb)||jsonb_build_object('flexibleDay',false,'remote',true,'requiredMinutes',(v->>'required_minutes')::int,'startsAt',v->>'starts_time','endsAt',v->>'ends_time'));end if;
 return result;
end$$;
revoke all on function workforce_private.work_snapshot_before_remote(uuid,uuid),public.wf_work_snapshot(uuid,uuid) from public,anon,authenticated;
grant execute on function workforce_private.work_snapshot_before_remote(uuid,uuid),public.wf_work_snapshot(uuid,uuid) to service_role;

create function workforce_private.protect_remote_salary_source() returns trigger language plpgsql set search_path='' as $$
declare employee uuid;effective date;begin
 employee:=case when TG_OP='DELETE' then old.employee_id else new.employee_id end;
 effective:=case when TG_OP='DELETE' then old.effective_from else new.effective_from end;
 if exists(select 1 from public.wf_employee_requests r where r.employee_id=employee and r.kind='remote-work' and r.status='approved' and r.remote_details is not null and r.test_run_id is null and (r.ends_at at time zone 'Asia/Riyadh')::date>=(workforce_private.work_now() at time zone 'Asia/Riyadh')::date and effective<=(r.ends_at at time zone 'Asia/Riyadh')::date and exists(select 1 from jsonb_array_elements(r.remote_details->'snapshot'->'days') v where effective>=(v->>'salary_effective')::date)) then raise sqlstate 'PT409' using message='الراتب مرتبط باتفاق عمل عن بُعد معتمد؛ لا تعدّل أساس الاتفاق خلال سريانه';end if;
 if TG_OP='DELETE' then return old;else return new;end if;
end$$;
revoke all on function workforce_private.protect_remote_salary_source() from public,anon,authenticated;
create trigger wf_remote_salary_source before insert or update or delete on public.wf_compensation_versions for each row execute function workforce_private.protect_remote_salary_source();
