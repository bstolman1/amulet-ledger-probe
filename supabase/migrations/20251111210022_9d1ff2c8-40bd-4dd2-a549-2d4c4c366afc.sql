-- Add progress tracking fields to acs_snapshots table
ALTER TABLE acs_snapshots
ADD COLUMN IF NOT EXISTS current_page integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_events integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS progress_percentage numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS elapsed_time_ms bigint DEFAULT 0,
ADD COLUMN IF NOT EXISTS pages_per_minute numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_progress_update timestamp with time zone;