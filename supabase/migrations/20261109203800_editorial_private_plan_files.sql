begin;
-- Keep plan attachments private even if older permissive storage policies allow other buckets.
create policy editorial_private_plan_files on storage.objects as restrictive for all to anon,authenticated
 using(bucket_id<>'editorial-plan-files') with check(bucket_id<>'editorial-plan-files');
create index editorial_notices_unread on public.editorial_notices(created_at desc) where read_at is null;
create index editorial_notices_plan on public.editorial_notices(plan_id,day);
commit;
