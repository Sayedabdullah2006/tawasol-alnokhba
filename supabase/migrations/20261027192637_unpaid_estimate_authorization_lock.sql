-- The actor guard takes a SHARE lock; PostgREST must allow it on POST.
-- This function still performs no INSERT/UPDATE/DELETE or delivery writes.
alter function public.wf_unpaid_leave_estimate(uuid,date,date,uuid) volatile;
notify pgrst,'reload schema';
