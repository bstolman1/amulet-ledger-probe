-- Enable realtime for backfill_cursors table
ALTER TABLE public.backfill_cursors REPLICA IDENTITY FULL;

-- Increase statement timeout for backfill operations (10 minutes)
ALTER DATABASE postgres SET statement_timeout = '600000';