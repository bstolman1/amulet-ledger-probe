-- Add progress tracking columns to acs_snapshots
ALTER TABLE public.acs_snapshots 
ADD COLUMN IF NOT EXISTS template_batch_updates integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_batch_info jsonb;

-- Add updated_at to acs_template_stats for tracking template activity
ALTER TABLE public.acs_template_stats 
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

-- Create trigger to auto-update updated_at on acs_template_stats
CREATE TRIGGER update_acs_template_stats_updated_at
BEFORE UPDATE ON public.acs_template_stats
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();