begin;

alter view public.email_reminder_stats set (security_invoker = true);

revoke all privileges on table public.email_reminder_stats from anon, authenticated;
grant select on table public.email_reminder_stats to service_role;

-- Trigger functions should not be exposed as public RPC endpoints.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;

-- This maintenance routine is intended for trusted server/database execution.
revoke execute on function public.fix_stuck_approved_requests() from public, anon, authenticated;
grant execute on function public.fix_stuck_approved_requests() to service_role;

commit;
