begin;
create function public.editorial_start_sync() returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid; begin
 perform pg_catalog.pg_advisory_xact_lock(9109,3);
 update public.editorial_sync_runs set status='failed',completed_at=now(),error='انتهت مهلة تشغيل المزامنة السابق' where status='running' and started_at<now()-interval '15 minutes';
 if exists(select 1 from public.editorial_sync_runs where status='running') then return null;end if;
 insert into public.editorial_sync_runs(status) values('running') returning id into result;return result;
end $$;
revoke all on function public.editorial_start_sync() from public,anon,authenticated;
grant execute on function public.editorial_start_sync() to service_role;

create function public.editorial_guard_archive() returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'الأرشيف للقراءة فقط؛ انسخ إلى خطة نشطة بدل تعديل الأصل';end $$;
create trigger editorial_archive_read_only before update or delete on public.editorial_archive_entries for each row execute function public.editorial_guard_archive();
create function public.editorial_guard_item() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.editorial_plans where id=old.plan_id and status='archived') then raise exception 'مواد الخطة المؤرشفة للقراءة فقط';end if;
 if old.status='published' and (new.copy is distinct from old.copy or new.design_urls is distinct from old.design_urls or new.brief is distinct from old.brief or new.source_ids is distinct from old.source_ids or new.day<>old.day or new.slot<>old.slot or new.scheduled_at<>old.scheduled_at) then raise exception 'لا تعدل مادة منشورة؛ انسخها إلى خطة جديدة';end if;
 return new;
end $$;
create trigger editorial_published_content_immutable before update on public.editorial_items for each row execute function public.editorial_guard_item();
revoke all on function public.editorial_guard_archive(),public.editorial_guard_item() from public,anon,authenticated;

create function public.editorial_call_scheduler(p_task text) returns bigint language plpgsql security invoker set search_path='' as $$
declare key_value text; request_id bigint; begin
 if p_task not in ('sync','generate','rollover') then raise exception 'invalid scheduler task';end if;
 select decrypted_secret into key_value from vault.decrypted_secrets where name='workforce_service_role_key';
 if key_value is null then raise exception 'scheduler credential is not configured in Vault';end if;
 select net.http_post(url:='https://nukhba.media/api/cron/publication-plans?task='||p_task,
   headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||key_value),
   body:=jsonb_build_object('task',p_task),timeout_milliseconds:=300000) into request_id;
 return request_id;
end $$;
revoke all on function public.editorial_call_scheduler(text) from public,anon,authenticated;
grant execute on function public.editorial_call_scheduler(text) to service_role;
-- Jobs are enabled only after verifying the new deployment. Retire the free-form morning job.
select cron.alter_job(job_id:=jobid,active:=false) from cron.job where jobname='daily-social-plan';
commit;
