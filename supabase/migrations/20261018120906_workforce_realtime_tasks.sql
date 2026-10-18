-- Task visibility follows the existing team RLS; finance tables are never replicated.
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='wf_tasks') then
  alter publication supabase_realtime add table public.wf_tasks;
 end if;
end $$;
