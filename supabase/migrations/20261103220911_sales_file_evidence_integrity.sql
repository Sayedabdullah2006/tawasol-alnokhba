-- Serialize evidence validation with file archival on the opportunity row.
-- Recheck at the write itself so concurrent approval cannot revive an archived document.
create function workforce_private.check_sales_file_evidence() returns trigger
language plpgsql security invoker set search_path=public,workforce_private as $$
begin
 if new.evidence_attachment_id is not null and new.status<>'rejected' then
  perform 1 from public.wf_crm_opportunities where id=new.opportunity_id for update;
  if not exists(select 1 from public.wf_crm_files where id=new.evidence_attachment_id and opportunity_id=new.opportunity_id and archived_at is null) then
   raise exception 'مرفق الإثبات غير متاح أو لا يخص الفرصة' using errcode='PT400';
  end if;
 end if;
 return new;
end $$;
revoke all on function workforce_private.check_sales_file_evidence() from public,anon,authenticated;
grant execute on function workforce_private.check_sales_file_evidence() to service_role;
create trigger check_sales_file_evidence before insert or update of evidence_attachment_id,status on public.wf_sales_activities
for each row execute function workforce_private.check_sales_file_evidence();
