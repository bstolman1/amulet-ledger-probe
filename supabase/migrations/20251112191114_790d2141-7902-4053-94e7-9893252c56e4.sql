-- Add progress tracking fields to acs_snapshots table
ALTER TABLE acs_snapshots
ADD COLUMN IF NOT EXISTS processed_pages INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS processed_events INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_events INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS progress_percentage NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT now(),
ADD COLUMN IF NOT EXISTS elapsed_time_ms BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS pages_per_minute NUMERIC DEFAULT 0;

-- Add index for started_at for faster sorting
CREATE INDEX IF NOT EXISTS idx_acs_snapshots_started_at ON acs_snapshots(started_at DESC);