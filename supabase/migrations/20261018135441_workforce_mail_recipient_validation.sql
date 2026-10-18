-- Validate the auth email without granting the worker direct access to auth.users.
create function workforce_private.notification_recipient_matches_email(p_id uuid,p_email text) returns boolean
language sql stable security definer set search_path='' as $$
select workforce_private.notification_recipient_active(p_id) and exists(select 1 from auth.users where id=p_id and lower(email)=lower(p_email) and email_confirmed_at is not null);
$$;
revoke all on function workforce_private.notification_recipient_matches_email(uuid,text) from public,anon,authenticated;
grant execute on function workforce_private.notification_recipient_matches_email(uuid,text) to service_role;
create or replace function public.wf_claim_notification_deliveries(p_limit integer default 8) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare batch uuid:=gen_random_uuid(); result jsonb;
begin
 update public.wf_notification_delivery_settings set worker_token=batch,worker_until=now()+interval '3 minutes'
 where id and enabled and (worker_until is null or worker_until<now());
 if not found then return jsonb_build_object('deliveries','[]'::jsonb); end if;
 update public.wf_notification_deliveries set status=case when attempts>=6 then 'failed' else 'pending' end,lease_token=null,lease_until=null
 where status='processing' and lease_until<now();
 update public.wf_notification_deliveries d set status='cancelled',last_error='لم يعد المستلم أو الإشعار متاحًا'
 where d.status='pending' and (not workforce_private.notification_recipient_matches_email(d.recipient_id,d.snapshot->>'email')
 or exists(select 1 from public.wf_notifications n join public.wf_tasks t on t.id=n.task_id join public.wf_task_columns c on c.id=t.column_id
 join public.wf_boards b on b.id=t.board_id where n.id=d.notification_id and n.kind in ('due_24h','due_2h','overdue')
 and (t.archived_at is not null or b.archived_at is not null or c.kind in ('done','review')
 or t.due_at is distinct from (d.snapshot->>'dueAt')::timestamptz
 or (d.snapshot->>'href' like '/employee%' and not exists(select 1 from public.wf_employees e where e.id=t.assignee_id and e.user_id=d.recipient_id)))));
 update public.wf_notification_deliveries set status='failed',last_error='انتهت نافذة إعادة المحاولة الآمنة'
 where status='pending' and first_attempt_at<now()-interval '23 hours';
 with picked as(select id from public.wf_notification_deliveries where status='pending' and available_at<=now() and attempts<6 order by available_at,id for update skip locked limit greatest(1,least(p_limit,8))),
 claimed as(update public.wf_notification_deliveries d set status='processing',attempts=attempts+1,lease_token=batch,
 lease_until=now()+interval '3 minutes',first_attempt_at=coalesce(first_attempt_at,now()) from picked where d.id=picked.id returning d.id,d.snapshot)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'snapshot',snapshot)),'[]'::jsonb) into result from claimed;
 return jsonb_build_object('token',batch,'deliveries',result);
end $$;
