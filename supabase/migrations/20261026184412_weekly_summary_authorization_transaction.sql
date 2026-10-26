-- PostgREST chooses READ ONLY for STABLE RPCs. The existing authorization
-- helper takes FOR SHARE locks to protect actor/employee state. Allow those
-- authorization locks without changing any grants or permitting client writes.
alter function public.wf_weekly_hours_snapshot(uuid,uuid,date) volatile;
