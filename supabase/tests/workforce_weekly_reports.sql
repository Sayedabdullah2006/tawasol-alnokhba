begin isolation level repeatable read;
-- Both transport wakeups and every generated row remain inside this rolled-back transaction.
select set_config('workforce.notification_wake','1',true);
do $$
declare definition text; first_result jsonb; second_result jsonb; before_count integer; before_net integer;
 expected integer; week_end date; owner_id uuid; run_id uuid;
begin
 week_end:=(now() at time zone 'Asia/Riyadh')::date+((6-extract(dow from now() at time zone 'Asia/Riyadh')::integer+7)%7);
 select count(*) into before_count from public.wf_notifications where kind='weekly_report';
 select count(*) into before_net from net.http_request_queue;
 definition:=pg_get_functiondef('public.wf_generate_weekly_reports()'::regprocedure);
 definition:=replace(definition,'public.wf_generate_weekly_reports()','pg_temp.wf_weekly_reports_test()');
 definition:=replace(definition,'local_now timestamp:=now() at time zone ''Asia/Riyadh''',
  'local_now timestamp:=(now() at time zone ''Asia/Riyadh'')::date+((6-extract(dow from now() at time zone ''Asia/Riyadh'')::integer+7)%7)+time ''09:00''');
 if definition not like '%pg_temp.wf_weekly_reports_test%' or definition not like '%time ''09:00''%' then raise exception 'Test clock replacement failed';end if;
 execute definition;
 select p.id into strict owner_id from public.profiles p join auth.users u on u.id=p.id
  where p.role='admin' and lower(u.email)='admin@ksa-influencers.com';
 perform set_config('role','service_role',true);
 run_id:=(public.wf_test_run('start',owner_id)->>'id')::uuid;
 perform set_config('role','none',true);
 if pg_temp.wf_weekly_reports_test()->>'created'<>'0' then raise exception 'Silent test mode must suppress weekly reports';end if;
 perform set_config('role','service_role',true);
 perform public.wf_test_run('finish',owner_id,run_id);
 perform set_config('role','none',true);
 select count(*) into expected from public.wf_weekly_report_data(week_end) r where not exists(
  select 1 from public.wf_notifications n where n.recipient_id=(r->>'recipientId')::uuid
   and n.event_key='weekly-report:'||(r->>'employeeId')||':'||week_end);
 first_result:=pg_temp.wf_weekly_reports_test();second_result:=pg_temp.wf_weekly_reports_test();
 if (first_result->>'created')::integer<>expected or second_result->>'created'<>'0' then raise exception 'Weekly dedup failed';end if;
 if (select count(*) from public.wf_notifications where kind='weekly_report')<>before_count+expected then raise exception 'Unexpected notification count';end if;
 if exists(select 1 from public.wf_notification_deliveries d join public.wf_notifications n on n.id=d.notification_id
  where n.kind='weekly_report' and (d.snapshot->'cc'<>'["elitecnnct@gmail.com"]'::jsonb or d.snapshot->'weeklyReport' is null)) then raise exception 'Snapshot/CC missing';end if;
 if (select count(*) from net.http_request_queue)<>before_net then raise exception 'Worker was woken';end if;
 if has_function_privilege('authenticated','public.wf_weekly_report_data(date)','execute') or has_function_privilege('anon','public.wf_generate_weekly_reports()','execute') then raise exception 'Unexpected public access';end if;
 if workforce_private.notification_group('weekly_report')<>'weekly_reports' then raise exception 'Weekly reports depend on task muting';end if;
end $$;
rollback;
