create or replace function workforce_private.report_attendance_seconds(p_employee uuid,p_from timestamptz,p_until timestamptz)
returns bigint language sql stable security invoker set search_path='' as $$
 with periods as (
  select greatest(a.checked_in,p_from,e.start_date::timestamp at time zone 'Asia/Riyadh') lo,
   least(coalesce(a.checked_out,a.checked_in+interval '24 hours'),p_until,now()) hi
  from public.wf_attendance_sessions a join public.wf_employees e on e.id=a.employee_id
  where a.employee_id=p_employee and a.checked_in<p_until and (a.checked_out>=p_from or a.checked_out is null)
 ), merged as (select range_agg(tstzrange(lo,hi,'[)')) ranges from periods where hi>lo)
 select floor(coalesce(sum(extract(epoch from upper(r)-lower(r))),0))::bigint from merged cross join lateral unnest(ranges) r;
$$;
