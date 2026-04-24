-- Step A: Enable pg_cron extension (run once)
create extension if not exists pg_cron;
grant usage on schema cron to postgres;

-- Step B: Create the function that fixes stuck requests
create or replace function fix_stuck_approved_requests()
returns void
language plpgsql
security definer
as $$
declare
  stuck_request record;
  one_hour_ago timestamptz := now() - interval '1 hour';
begin

  for stuck_request in
    select id, moyasar_payment_id, request_number
    from publish_requests
    where status = 'approved'
      and moyasar_payment_id is not null
      and updated_at < one_hour_ago
  loop

    update publish_requests
    set
      status = 'in_progress',
      payment_status = 'paid',
      admin_notes = 'تم الإصلاح التلقائي عبر pg_cron - الدفع مؤكد',
      updated_at = now()
    where id = stuck_request.id
      and status = 'approved'; -- safety guard: only if still approved

    raise notice '[pg_cron] Fixed request: % | payment: %',
      stuck_request.request_number,
      stuck_request.moyasar_payment_id;

  end loop;

end;
$$;

-- Step C: Schedule the function to run every hour
select cron.schedule(
  'fix-stuck-approved-requests',  -- unique job name
  '0 * * * *',                    -- every hour at minute 0
  $$select fix_stuck_approved_requests()$$
);

-- ─── Management queries (run anytime in SQL Editor) ───────────────────────

-- View all scheduled jobs:
-- select * from cron.job;

-- View recent run history:
-- select * from cron.job_run_details order by start_time desc limit 20;

-- Run manually right now (for testing):
-- select fix_stuck_approved_requests();

-- Pause the job:
-- select cron.unschedule('fix-stuck-approved-requests');

-- Resume the job:
-- select cron.schedule(
--   'fix-stuck-approved-requests',
--   '0 * * * *',
--   $$select fix_stuck_approved_requests()$$
-- );