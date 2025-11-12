-- Add progress tracking fields to acs_snapshots for resumable processing
ALTER TABLE public.acs_snapshots
ADD COLUMN IF NOT EXISTS cursor_after bigint DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS processed_pages integer DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS processed_events bigint DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS page_size integer DEFAULT 500 NOT NULL,
ADD COLUMN IF NOT EXISTS failure_count integer DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS last_error_message text,
ADD COLUMN IF NOT EXISTS started_at timestamp with time zone DEFAULT now(),
ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone;

-- Update the updated_at column trigger to work properly
CREATE OR REPLACE FUNCTION update_acs_snapshots_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_acs_snapshots_updated_at_trigger ON public.acs_snapshots;

CREATE TRIGGER update_acs_snapshots_updated_at_trigger
BEFORE UPDATE ON public.acs_snapshots
FOR EACH ROW
EXECUTE FUNCTION update_acs_snapshots_updated_at();

COMMENT ON COLUMN public.acs_snapshots.cursor_after IS 'ACS cursor position for resuming (from range.to)';
COMMENT ON COLUMN public.acs_snapshots.processed_pages IS 'Number of pages successfully processed';
COMMENT ON COLUMN public.acs_snapshots.processed_events IS 'Total events processed so far';
COMMENT ON COLUMN public.acs_snapshots.page_size IS 'Adaptive page size (can be reduced on errors)';
COMMENT ON COLUMN public.acs_snapshots.failure_count IS 'Consecutive failure count for this batch';
COMMENT ON COLUMN public.acs_snapshots.last_error_message IS 'Last error message for debugging';