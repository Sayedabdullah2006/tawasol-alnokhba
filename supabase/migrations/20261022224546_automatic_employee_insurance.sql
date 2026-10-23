-- Company-approved employee contribution. No employer contribution is deducted.
alter table public.wf_monthly_payroll add column insurance_details jsonb;
create table public.wf_employee_insurance_settings (
 employee_id uuid primary key references public.wf_employees(id),rate numeric(7,4) not null check(rate between 0 and 100),
 effective_from date not null,updated_at timestamptz not null default clock_timestamp()
);
alter table public.wf_employee_insurance_settings enable row level security;
revoke all on public.wf_employee_insurance_settings from public,anon,authenticated;
grant select on public.wf_employee_insurance_settings to authenticated;
grant select,insert,update on public.wf_employee_insurance_settings to service_role;
create policy wf_employee_insurance_settings_read on public.wf_employee_insurance_settings for select to authenticated
 using((select workforce_private.is_admin()) or employee_id=(select workforce_private.employee_id()));
insert into public.wf_employee_insurance_settings(employee_id,rate,effective_from)
 select id,10.75,start_date from public.wf_employees where id in ('a4e79fa0-d078-4a7e-8650-196342a0dec3','20941f23-a84c-44a9-a316-94a436e0d3cb');

create function workforce_private.insurance_payroll(p_employee uuid,p_month date) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare policy public.wf_employee_insurance_settings; joined date; d date; first_day date; last_day date:=(p_month+interval '1 month - 1 day')::date;
 basis numeric; total_basis numeric:=0; denominator numeric; term record;
begin
 select * into policy from public.wf_employee_insurance_settings where employee_id=p_employee;
 if not found or policy.effective_from>last_day then return null;end if;
 select start_date into joined from public.wf_employees where id=p_employee;
 first_day:=greatest(joined,policy.effective_from,p_month);
 denominator:=case when first_day>p_month then 30 else extract(day from last_day) end;
 for d in select generate_series(first_day::timestamp,last_day::timestamp,interval '1 day')::date loop
  select c.basic_salary+coalesce((select sum((a->>'amount')::numeric) from jsonb_array_elements(c.allowances) a where coalesce(a->>'name','') ~* '(سكن|housing)'),0) insurance_basis
   into term from public.wf_compensation_versions c where c.employee_id=p_employee and c.effective_from<=d order by c.effective_from desc,c.revision desc limit 1;
  if not found then raise sqlstate 'PT409' using message='أكملي إعداد الراتب الأساسي وبدل السكن أولًا';end if;
  basis:=term.insurance_basis;total_basis:=total_basis+basis;
 end loop;
 return jsonb_build_object('amount',round(total_basis/denominator*policy.rate/100,2)::text,'rate',policy.rate::text,'basis_amount',round(total_basis/denominator,2)::text,
  'reference','auto:gosi:'||to_char(p_month,'YYYY-MM'));
end $$;
revoke all on function workforce_private.insurance_payroll(uuid,date) from public,anon,authenticated;
grant execute on function workforce_private.insurance_payroll(uuid,date) to service_role;

create function workforce_private.apply_insurance_payroll() returns trigger language plpgsql security invoker set search_path='' as $$
declare detail jsonb; manual jsonb;
begin
 if TG_OP='UPDATE' and old.status='paid' then return new;end if;
 detail:=workforce_private.insurance_payroll(new.employee_id,new.month);if detail is null then return new;end if;
 new.insurance_details:=detail;
 select coalesce(jsonb_agg(x),'[]') into manual from jsonb_array_elements(new.deductions) x where x->>'kind'<>'insurance';
 if jsonb_array_length(manual)>99 then raise sqlstate 'PT400' using message='الحد الأقصى 99 استقطاعًا إضافيًا مع التأمينات الآلية';end if;
 new.deductions:=manual||jsonb_build_array(jsonb_build_object('title','التأمينات الاجتماعية','kind','insurance','amount',detail->>'amount','reference',detail->>'reference'));
 return new;
end $$;
revoke all on function workforce_private.apply_insurance_payroll() from public,anon,authenticated;
grant execute on function workforce_private.apply_insurance_payroll() to service_role;
-- PostgreSQL runs same-kind triggers in name order: insurance must precede net balance calculation.
create trigger wf_00_insurance_payroll before insert or update on public.wf_monthly_payroll for each row execute function workforce_private.apply_insurance_payroll();

create or replace function workforce_private.refresh_attendance_payroll(p_employee uuid,p_month date) returns void language plpgsql security invoker set search_path='' as $$
declare r public.wf_monthly_payroll; detail jsonb; insurance jsonb; actual jsonb;
begin
 select * into r from public.wf_monthly_payroll where employee_id=p_employee and month=p_month for update;
 if not found or r.status='paid' then return;end if;
 detail:=workforce_private.attendance_payroll(p_employee,p_month);insurance:=workforce_private.insurance_payroll(p_employee,p_month);
 select x into actual from jsonb_array_elements(r.deductions) x where x->>'kind'='insurance' limit 1;
 if (r.attendance_details-'applied_amount'-'unapplied_amount') is distinct from detail
  or insurance is not null and (r.insurance_details is distinct from insurance or actual is null or actual->>'reference' is distinct from insurance->>'reference' or (actual->>'amount')::numeric is distinct from (insurance->>'amount')::numeric) then
  update public.wf_monthly_payroll set version=version+1,updated_at=clock_timestamp() where id=r.id;
 end if;
end $$;

create or replace function workforce_private.audit_attendance_payroll() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if (TG_OP='INSERT' and (new.attendance_amount<>0 or new.insurance_details is not null)) or (TG_OP='UPDATE' and (old.attendance_amount,old.attendance_details,old.insurance_details) is distinct from (new.attendance_amount,new.attendance_details,new.insurance_details)) then
  insert into public.wf_payroll_attendance_audit(payroll_id,previous_amount,current_amount,details)
   values(new.id,case when TG_OP='UPDATE' then old.attendance_amount else 0 end,new.attendance_amount,
    new.attendance_details||jsonb_build_object('insurance',new.insurance_details,'deductions',new.deductions,'net_amount',new.total_amount));
 end if;return new;
end $$;
