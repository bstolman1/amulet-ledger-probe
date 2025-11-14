-- Add snapshot_type field to track full vs incremental snapshots
ALTER TABLE public.acs_snapshots 
ADD COLUMN snapshot_type text NOT NULL DEFAULT 'full';

-- Add comment for documentation
COMMENT ON COLUMN public.acs_snapshots.snapshot_type IS 'Type of snapshot: ''full'' for complete ACS snapshots, ''incremental'' for v2/updates based deltas';

-- Create index for faster queries by snapshot type
CREATE INDEX idx_acs_snapshots_type_migration ON public.acs_snapshots(snapshot_type, migration_id, status);