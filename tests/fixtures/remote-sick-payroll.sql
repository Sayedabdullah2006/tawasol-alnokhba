create or replace function workforce_private.sick_payroll(p_employee uuid,p_month date,p_through date) returns jsonb language plpgsql stable set search_path='' as $$
declare row record;monthly numeric;loss numeric:=0;details jsonb:='[]';rate numeric;
begin
 p_through:=least(p_through,workforce_private.employment_end(p_employee));
 for row in select * from workforce_private.sick_leave_days(p_employee,least(p_through,(p_month+interval '1 month - 1 day')::date)) where day>=p_month loop
  select c.basic_salary+coalesce((select sum((a->>'amount')::numeric) from jsonb_array_elements(c.allowances) a),0) into monthly from public.wf_compensation_versions c where c.employee_id=p_employee and c.effective_from<=row.day order by c.effective_from desc,c.revision desc limit 1;
  if not found then raise sqlstate 'PT409' using message='أكملي إعداد راتب الموظفة للفترة أولًا';end if;
  rate:=case when workforce_private.paid_holiday(row.day) is not null then 1 else row.pay_rate end;
  loss:=loss+monthly/30*(1-rate);
  details:=details||jsonb_build_array(jsonb_build_object('day',row.day,'request_id',row.request_id,'cycle_start',row.cycle_start,'cycle_end',row.cycle_end,'ordinal',row.ordinal,'pay_rate',rate,'statutory_rate',row.pay_rate,'amount',round(monthly/30*(1-rate),2)::text));
 end loop;
 return jsonb_build_object('amount',round(loss,2)::text,'days',details);
end$$;
