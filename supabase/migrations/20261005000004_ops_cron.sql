-- Applied on a real Supabase project only: the PGlite test harness skips every file whose name contains _cron.
-- Runs the purge daily at 21:00 UTC (02:30 IST). pg_cron runs a job as the user that scheduled it, which owns the function.
-- If Supabase rejects create extension pg_cron from a migration, enable pg_cron in Dashboard, Database, Extensions, keep
-- only the cron.schedule line below, and record that in docs/ops/probes.md (P3).
create extension if not exists pg_cron;
select cron.schedule('gs-purge', '0 21 * * *', $$select public.purge_expired()$$);
