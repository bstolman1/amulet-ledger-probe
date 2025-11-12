-- Add fields to support batch processing and resumption for ACS snapshots
ALTER TABLE public.acs_snapshots 
  ADD COLUMN IF NOT EXISTS cursor_after INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iteration_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_iterations INTEGER DEFAULT 1000;