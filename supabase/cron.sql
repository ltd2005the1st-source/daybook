-- Phone reminders: ask Supabase to ping your app every 5 minutes.
-- 1. Supabase → Database → Extensions: enable pg_cron and pg_net.
-- 2. Replace the two placeholders below, then run this in the SQL Editor.

select cron.schedule(
  'daybook-reminders',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := 'https://YOUR-SITE.netlify.app/api/cron/reminders',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR-CRON-SECRET')
  );
  $$
);

-- To stop it later:  select cron.unschedule('daybook-reminders');
