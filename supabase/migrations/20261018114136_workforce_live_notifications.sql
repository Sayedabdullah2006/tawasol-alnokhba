-- Only recipient-private notifications are replicated; RLS still authorizes every event.
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='wf_notifications') then
  alter publication supabase_realtime add table public.wf_notifications;
 end if;
end $$;
