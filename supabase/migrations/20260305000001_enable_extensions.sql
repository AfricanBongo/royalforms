-- Enable pg_net extension (HTTP requests from Postgres triggers)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Enable pg_cron extension (scheduled jobs)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
