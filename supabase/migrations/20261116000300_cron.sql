-- Scheduled jobs (docs/architecture/10_functions_and_jobs.csv). Times are IST; pg_cron runs in UTC.
-- Edge-function jobs (notify, tts-cache, embed-recipes) are scheduled when those functions ship.

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron not available; skipping job scheduling (local test database)';
    return;
  end if;

  create extension if not exists pg_cron;

  -- 02:30 IST = 21:00 UTC
  perform cron.schedule('decay-inventory-confidence', '0 21 * * *',
    'select private.decay_inventory_confidence()');
  -- 03:00 IST = 21:30 UTC
  perform cron.schedule('retention-cleanup', '30 21 * * *',
    'select private.retention_cleanup()');
  perform cron.schedule('abandon-stale-sessions', '7 * * * *',
    'select private.abandon_stale_sessions()');
end $$;
